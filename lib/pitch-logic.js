// Pure pitch-count / rest-day / eligibility logic — no DOM, no React, no Firebase.
// Loaded in the browser via <script src="lib/pitch-logic.js"> (exposes window.PitchLogic)
// and required directly from Node tests via module.exports. Keep this file dependency-free
// so both environments can load it with zero build step.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.PitchLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

// ─── Per-team pitch rules (updated when a team is selected) ──────────────────
const DEFAULT_RULES = { maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 };
let currentRules = { ...DEFAULT_RULES };

function setCurrentRules(rules) {
  currentRules = rules && rules.maxPitches ? rules : { ...DEFAULT_RULES };
}
function getCurrentRules() {
  return currentRules;
}

function getRegRestDays(pitches) {
  const r = currentRules;
  if (pitches > r.rest3) return 3;
  if (pitches > r.rest2) return 2;
  if (pitches > r.rest1) return 1;
  return 0;
}

function getEligibleDate(gameDate, pitches, restFn) {
  const days = restFn(pitches);
  if (days === 0) return null;
  if (!gameDate) return null;
  const d = new Date(gameDate + "T12:00:00");
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days + 1);
  return d;
}

// ─── Tournament config ───────────────────────────────────────────────────────
// A tournament has one pitch limit per day (each independently a hard limit or
// a guideline) plus one total limit for the whole tournament:
//   dayLimits: [{ max, isHard }, ...]  (index 0 = Day 1), maxTotal: number
// Tournaments created before per-day limits existed only have maxDay1 /
// day1IsHardLimit - getTourneyDayLimits reads both shapes.
const DEFAULT_TOURNEY_DAY_LIMIT = 50;
const DEFAULT_TOURNEY_TOTAL = 100;

function getTourneyDays(t) {
  return Math.max(1, parseInt(t && t.days, 10) || 1);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isIsoDate(s) {
  return typeof s === "string" && ISO_DATE_RE.test(s) && !isNaN(new Date(s + "T12:00:00").getTime());
}

function getTourneyEndDate(t) {
  if (!t || !isIsoDate(t.startDate)) return null;
  return addDays(t.startDate, getTourneyDays(t) - 1);
}

function getTourneyDayLimits(t) {
  const n = getTourneyDays(t);
  // Firebase RTDB can hand an array back as a {"0":..,"1":..} object.
  const raw = t && t.dayLimits;
  const src = Array.isArray(raw) ? raw
    : raw && typeof raw === "object" ? Object.keys(raw).reduce((a, k) => { a[k] = raw[k]; return a; }, [])
    : null;
  const legacyMax = parseInt(t && t.maxDay1, 10) || DEFAULT_TOURNEY_DAY_LIMIT;
  return Array.from({ length: n }, (_, i) => {
    const d = src && src[i];
    const max = d && parseInt(d.max, 10);
    if (max > 0) return { max, isHard: !!d.isHard };
    if (src) return { max: DEFAULT_TOURNEY_DAY_LIMIT, isHard: true };
    // Legacy shape: Day 1 keeps its configured type, other days copy its cap as a guideline.
    return { max: legacyMax, isHard: i === 0 ? !!(t && t.day1IsHardLimit) : false };
  });
}

function getTourneyMaxTotal(t) {
  return parseInt(t && t.maxTotal, 10) || DEFAULT_TOURNEY_TOTAL;
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + "T12:00:00"), b = new Date(toStr + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

// 1-based tournament day for a date, or null if the date is outside the tournament.
function getTourneyDayNumber(t, dateStr) {
  if (!t || !isIsoDate(t.startDate) || !isIsoDate(dateStr)) return null;
  const i = daysBetween(t.startDate, dateStr);
  if (isNaN(i) || i < 0 || i >= getTourneyDays(t)) return null;
  return i + 1;
}

// A tournament is "over" once the reference date is past its last scheduled day.
function isTourneyOver(tourney, refDateStr) {
  const end = getTourneyEndDate(tourney);
  if (!end) return true;
  return (refDateStr || todayStr()) > end;
}

// Per-day and total pitches a pitcher has thrown in one tournament. The day an
// entry counts toward comes from its date (the source of truth); the stored
// tourneyDay is only a fallback for entries whose date can't be placed.
// opts.through: only count games dated on or before this date (viewing a past day).
function getPitcherTourneyStats(pitcher, t, opts) {
  const through = opts && opts.through;
  const games = (pitcher.history || []).filter(h => t && h.tournamentId === t.id &&
    (!through || !h.date || h.date <= through));
  const byDay = Array.from({ length: getTourneyDays(t) }, () => 0);
  let total = 0, lastPitchDate = null;
  games.forEach(g => {
    const n = Number(g.pitches) || 0;
    total += n;
    const day = getTourneyDayNumber(t, g.date) || g.tourneyDay;
    if (day >= 1 && day <= byDay.length) byDay[day - 1] += n;
    if (g.date && (!lastPitchDate || g.date > lastPitchDate)) lastPitchDate = g.date;
  });
  return { total, byDay, games, lastPitchDate };
}

// ─── Regular-season rest ─────────────────────────────────────────────────────
// Every "outing" sets a rest requirement and the pitcher is eligible once ALL
// of them are served (latest eligible date wins - a regular game pitched during
// mandatory rest can't shorten it):
// - Regular-season game day: that day's pitches -> rest days, starting the next day.
// - Tournament (CPYL): pitches summed across the whole tournament -> rest days,
//   starting the day after the last day the pitcher threw in it, and never
//   eligible for a regular-season game before the day after the tournament ends.
//   Applies while a tournament is in progress too (provisional, using the total
//   so far). No rest rules apply between days *within* a tournament - see
//   getTourneyEligibility.
// opts.before: only count outings strictly before this date (used to judge
// whether a game being logged on that date broke a rest rule).
function getOutings(pitcher, tournaments, opts) {
  const before = opts && opts.before;
  const regByDate = {}, tourneyById = {};
  (pitcher.history || []).forEach(h => {
    if (!isIsoDate(h.date) || (before && h.date >= before)) return;
    if (h.isTournament && h.tournamentId) {
      (tourneyById[h.tournamentId] = tourneyById[h.tournamentId] || []).push(h);
    } else {
      regByDate[h.date] = (regByDate[h.date] || 0) + (Number(h.pitches) || 0);
    }
  });
  // Defensive: a pitcher record with lastPitches/lastGameDate but no history
  // (shouldn't happen - recomputeLast keeps them in sync) still rests.
  if (!(pitcher.history || []).length && isIsoDate(pitcher.lastGameDate) && pitcher.lastPitches > 0 &&
      (!before || pitcher.lastGameDate < before)) {
    regByDate[pitcher.lastGameDate] = pitcher.lastPitches;
  }
  const outings = Object.keys(regByDate).map(date => ({
    isTourney: false, tournamentId: null, pitches: regByDate[date], lastPitchDate: date, notBefore: null,
  }));
  Object.keys(tourneyById).forEach(id => {
    const games = tourneyById[id];
    const t = (tournaments || []).find(x => x.id === id);
    const pitches = games.reduce((s, g) => s + (Number(g.pitches) || 0), 0);
    if (pitches <= 0) return; // no real appearance - nothing to rest from
    const lastPitchDate = games.reduce((m, g) => (g.date > m ? g.date : m), games[0].date);
    const end = getTourneyEndDate(t);
    outings.push({ isTourney: true, tournamentId: id, pitches, lastPitchDate,
      notBefore: end ? addDays(end, 1) : null });
  });
  return outings;
}

// The tournament floor applies even when no rest days are owed: anyone who
// pitched in a tournament can't pitch a regular-season game until it's over.
function outingEligibleDate(o) {
  const restDays = getRegRestDays(o.pitches);
  let d = restDays > 0 ? addDays(o.lastPitchDate, restDays + 1) : null;
  if (o.notBefore && (!d || o.notBefore > d)) d = o.notBefore;
  return d;
}

function getTourneyAdjustedRestInfo(pitcher, tournaments, opts) {
  const outings = getOutings(pitcher, tournaments, opts);
  let binding = null, bindingDate = null;
  outings.forEach(o => {
    const d = outingEligibleDate(o);
    if (d && (!bindingDate || d > bindingDate)) { binding = o; bindingDate = d; }
  });
  if (!binding) {
    // Nothing owed - describe the most recent outing for display purposes.
    const latest = outings.reduce((m, o) => (!m || o.lastPitchDate > m.lastPitchDate ? o : m), null);
    return { isTourney: !!(latest && latest.isTourney), tournamentId: latest ? latest.tournamentId : null,
      totalPitches: latest ? latest.pitches : 0, lastPitchDate: latest ? latest.lastPitchDate : null,
      eligibleDate: null, restDays: 0 };
  }
  return { isTourney: binding.isTourney, tournamentId: binding.tournamentId,
    totalPitches: binding.pitches, lastPitchDate: binding.lastPitchDate,
    eligibleDate: new Date(bindingDate + "T12:00:00"), restDays: getRegRestDays(binding.pitches) };
}

function getAvailabilityStatus(pitcher, onDate, tournaments) {
  const info = getTourneyAdjustedRestInfo(pitcher, tournaments);
  if (!info.eligibleDate) return "available";
  const eligMid = new Date(info.eligibleDate); eligMid.setHours(0,0,0,0);
  const ref = onDate ? new Date(onDate + "T00:00:00") : new Date();
  ref.setHours(0,0,0,0);
  if (eligMid <= ref) return "available";
  const msLeft = eligMid - ref;
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft <= 1) return "tomorrow";
  // Owed only because a tournament isn't over yet (0 rest days): bucket by
  // days remaining instead.
  const severity = info.restDays || daysLeft;
  if (severity <= 1) return "soon";
  if (severity <= 2) return "resting2";
  return "resting";
}

function daysUntilEligible(pitcher, onDate, tournaments) {
  const info = getTourneyAdjustedRestInfo(pitcher, tournaments);
  if (!info.eligibleDate) return 0;
  const eligMid = new Date(info.eligibleDate); eligMid.setHours(0,0,0,0);
  const ref = onDate ? new Date(onDate + "T00:00:00") : new Date();
  ref.setHours(0,0,0,0);
  const ms = eligMid - ref;
  return Math.max(0, Math.ceil(ms / 86400000));
}

function getEligibleDateStr(pitcher, tournaments, opts) {
  const info = getTourneyAdjustedRestInfo(pitcher, tournaments, opts);
  if (!info.eligibleDate) return null;
  // Plain local YYYY-MM-DD, matching every other date string in this app -
  // avoids a UTC round-trip (eligibleDate is built from a local-noon anchor
  // in getTourneyAdjustedRestInfo, so re-deriving it via .toISOString() and
  // re-parsing elsewhere is an unnecessary, fragile hop).
  return toLocalDateStr(info.eligibleDate);
}

// ─── In-tournament eligibility ───────────────────────────────────────────────
// During a tournament only the tournament's own limits apply (no rest days
// between tournament days), plus any regular-season rest still owed from
// before the tournament started. A hard daily limit, once reached, sits the
// pitcher for the rest of that day; reaching the tournament total sits them
// for the rest of the tournament. Guidelines never affect eligibility.
// A date before the tournament is evaluated as Day 1.
function getTourneyEligibility(pitcher, t, dateStr, tournaments) {
  if (!t) return { eligible: true, reason: "" };
  const start = t.startDate || dateStr;
  const effDate = dateStr && start && dateStr < start ? start : dateStr;
  const dayNum = getTourneyDayNumber(t, effDate);
  const stats = getPitcherTourneyStats(pitcher, t, { through: effDate });
  const maxTotal = getTourneyMaxTotal(t);
  const remainingTotal = Math.max(0, maxTotal - stats.total);
  const base = { dayNum, total: stats.total, maxTotal, remainingTotal };
  if (!dayNum) return { ...base, eligible: false, code: "ended",
    reason: t.startDate ? "Tournament has ended" : "Tournament has no start date" };
  const limit = getTourneyDayLimits(t)[dayNum - 1];
  const dayPitches = stats.byDay[dayNum - 1] || 0;
  const remainingToday = limit.isHard ? Math.max(0, limit.max - dayPitches) : null;
  const pitchesLeft = remainingToday === null ? remainingTotal : Math.min(remainingToday, remainingTotal);
  const out = { ...base, dayPitches, dayLimit: limit, remainingToday, pitchesLeft };

  const preStr = t.startDate ? getEligibleDateStr(pitcher, tournaments, { before: t.startDate }) : null;
  if (preStr && preStr > effDate) {
    return { ...out, eligible: false, restingUntil: preStr, code: "resting",
      reason: `Resting (pre-tournament) — eligible ${formatDate(preStr)}` };
  }
  if (stats.total >= maxTotal) {
    return { ...out, eligible: false, code: "total", reason: `Reached tournament limit (${stats.total}/${maxTotal}p)` };
  }
  if (limit.isHard && dayPitches >= limit.max) {
    return { ...out, eligible: false, code: "day", reason: `Reached Day ${dayNum} limit (${dayPitches}/${limit.max}p) — done for today` };
  }
  const dayPart = `Day ${dayNum}: ${dayPitches}/${limit.max}p ${limit.isHard ? "limit" : "guideline"}`;
  const overGuide = !limit.isHard && dayPitches >= limit.max;
  const guideNote = !overGuide ? "" : dayPitches > limit.max ? " (over guideline)" : " (at guideline)";
  return { ...out, eligible: true, atGuideline: overGuide,
    reason: `${dayPart}${guideNote} · ${stats.total}/${maxTotal}p total` };
}

// Save-time check for a tournament game about to be logged with `count` pitches
// on `dateStr`. Returns null, a { level:"note" } (guideline exceeded - never
// blocks), or a { level:"violation" } (rest owed, a limit already reached
// before this game, or going over a hard daily limit / the total, which CPYL
// only allows when finishing a batter). Violations are warn-and-override.
function getTourneyLimitViolation(pitcher, t, dateStr, count, tournaments) {
  if (!t) return null;
  const dayNum = getTourneyDayNumber(t, dateStr);
  if (!dayNum) return { level: "violation", message: t.startDate
    ? "Game date is outside this tournament's dates" : "Tournament has no start date" };
  const preStr = t.startDate ? getEligibleDateStr(pitcher, tournaments, { before: t.startDate }) : null;
  if (preStr && preStr > dateStr) {
    return { level: "violation", message: `Resting from before the tournament — eligible ${formatDate(preStr)}` };
  }
  const stats = getPitcherTourneyStats(pitcher, t);
  const maxTotal = getTourneyMaxTotal(t);
  const limit = getTourneyDayLimits(t)[dayNum - 1];
  const priorDay = stats.byDay[dayNum - 1] || 0;
  const newTotal = stats.total + count, newDay = priorDay + count;
  if (stats.total >= maxTotal) {
    return { level: "violation", message: `Already at tournament limit before this game (${stats.total}/${maxTotal}p)` };
  }
  if (limit.isHard && priorDay >= limit.max) {
    return { level: "violation", message: `Already at Day ${dayNum} limit before this game (${priorDay}/${limit.max}p)` };
  }
  if (newTotal > maxTotal) {
    return { level: "violation", message: `Over tournament limit (${newTotal}/${maxTotal}p) — allowed only if finishing a batter` };
  }
  if (limit.isHard && newDay > limit.max) {
    return { level: "violation", message: `Over Day ${dayNum} limit (${newDay}/${limit.max}p) — allowed only if finishing a batter` };
  }
  if (!limit.isHard && newDay > limit.max) {
    return { level: "note", message: `Over Day ${dayNum} guideline (${newDay}/${limit.max}p)` };
  }
  return null;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.includes("T") ? "" : "T12:00:00"));
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
}
function todayStr() {
  return toLocalDateStr(new Date());
}
// Local YYYY-MM-DD. Never via .toISOString(): that converts to UTC, which is
// already the next calendar day at local noon in UTC+13/+14 zones.
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toLocalDateStr(d);
}
function newId() { return Date.now().toString() + Math.random().toString(36).slice(2,6); }

// ── Device identification ──────────────────────────────────────────────────
const DEVICE_ID_KEY = "pt_device_id";
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch(e) {
    return "unknown";
  }
}
// ── Coach identity (mandatory, entered once via AuthGate) ──────────────────
const COACH_NAME_KEY = "pt_coach_name";
function getCoachName() {
  try {
    return localStorage.getItem(COACH_NAME_KEY) || "";
  } catch(e) {
    return "";
  }
}
function setCoachName(name) {
  try {
    localStorage.setItem(COACH_NAME_KEY, name);
  } catch(e) {}
}

// Rebuild lastPitches/lastGameDate from sorted history
function recomputeLast(history) {
  if (!history || history.length === 0) return { lastPitches:0, lastGameDate:null };
  const sorted = [...history].sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const lastDate = sorted[sorted.length - 1].date;
  const lastPitches = history
    .filter(h => h.date === lastDate)
    .reduce((sum, h) => sum + (h.pitches || 0), 0);
  return { lastPitches, lastGameDate: lastDate };
}

function getActiveTourney(tournaments, dateStr) {
  return (tournaments || []).find(t => t.startDate &&
    dateStr >= t.startDate && dateStr <= addDays(t.startDate, (t.days || 1) - 1));
}

// ── Seasons ───────────────────────────────────────────────────────────────
const TERM_ORDER = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };

function getSeasonName(season) {
  if (!season) return "";
  return `${season.term} ${season.year}`;
}

// Descending (most recent first): higher year wins, then later term within a year.
function compareSeasonsDesc(a, b) {
  if (a.year !== b.year) return b.year - a.year;
  return (TERM_ORDER[b.term] ?? 0) - (TERM_ORDER[a.term] ?? 0);
}

function getSubjectKey(undoData) {
  if (!undoData) return null;
  switch (undoData.type) {
    case "DELETE_GAME":        return `game:${undoData.playerId}:${undoData.gameId}`;
    case "RESTORE_GAME":       return `game:${undoData.playerId}:${undoData.entry?.gameId}`;
    case "DELETE_PITCHER":     return `pitcher:${undoData.pitcherId}`;
    case "RESTORE_PITCHER":    return `pitcher:${undoData.pitcher?.id}`;
    case "RESTORE_PITCHER_META": return `pitcher:${undoData.pitcherId}`;
    case "DELETE_TOURNEY":     return `tourney:${undoData.tourneyId}`;
    case "RESTORE_TOURNEY":    return `tourney:${undoData.tourney?.id}`;
    default: return null;
  }
}

return {
  DEFAULT_RULES, setCurrentRules, getCurrentRules,
  getRegRestDays, getEligibleDate, isTourneyOver, getTourneyAdjustedRestInfo,
  getAvailabilityStatus, daysUntilEligible, getEligibleDateStr,
  DEFAULT_TOURNEY_DAY_LIMIT, DEFAULT_TOURNEY_TOTAL,
  getTourneyDays, getTourneyEndDate, getTourneyDayLimits, getTourneyMaxTotal, getTourneyDayNumber,
  getPitcherTourneyStats, getTourneyEligibility, getTourneyLimitViolation,
  formatDate, todayStr, addDays, toLocalDateStr, isIsoDate, newId,
  getDeviceId, getCoachName, setCoachName, recomputeLast,
  getActiveTourney, getSubjectKey,
  TERM_ORDER, getSeasonName, compareSeasonsDesc,
};

});
