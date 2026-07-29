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

// Post-tournament rest (CPYL rules):
// - First rest day = day after last pitch date in tournament
// - Total tournament pitches determine rest requirement (same thresholds as regular season)
// - ≤20 total pitches = no rest required (eligible immediately)
// A tournament is "over" once today is past its last scheduled day.
function isTourneyOver(tourney, refDateStr) {
  if (!tourney || !tourney.startDate) return true;
  const end = addDays(tourney.startDate, (tourney.days || 1) - 1);
  return (refDateStr || todayStr()) > end;
}

function getTourneyAdjustedRestInfo(pitcher, tournaments) {
  const history = pitcher.history || [];
  if (history.length > 0 && tournaments && tournaments.length > 0) {
    const sorted = [...history].sort((a,b) => a.date < b.date ? 1 : -1);
    const lastGame = sorted[0];
    if (lastGame && lastGame.isTournament && lastGame.tournamentId) {
      const tourney = tournaments.find(t => t.id === lastGame.tournamentId);
      if (tourney && isTourneyOver(tourney)) {
        const tourneyGames = history.filter(h => h.tournamentId === lastGame.tournamentId);
        const totalPitches = tourneyGames.reduce((s, g) => s + g.pitches, 0);
        const lastPitchDate = lastGame.date;
        const restDays = getRegRestDays(totalPitches);
        let eligibleDate = null;
        if (restDays > 0) {
          eligibleDate = new Date(lastPitchDate + "T12:00:00");
          eligibleDate.setDate(eligibleDate.getDate() + restDays + 1);
        }
        return { isTourney:true, totalPitches, lastPitchDate, eligibleDate, restDays };
      }
      // Tournament still in progress: League eligibility uses that day's
      // real pitch total (falls through below), same as any regular-season
      // day. The cumulative-tournament-total "recovery" rule only applies
      // once the tournament has actually ended.
    }
  }
  // Standard regular-season rest
  const eligibleDate = getEligibleDate(pitcher.lastGameDate, pitcher.lastPitches, getRegRestDays);
  return { isTourney:false, totalPitches:pitcher.lastPitches, lastPitchDate:pitcher.lastGameDate, eligibleDate };
}

function getAvailabilityStatus(pitcher, onDate, tournaments) {
  if (!pitcher.lastPitches || pitcher.lastPitches === 0) return "available";
  const info = getTourneyAdjustedRestInfo(pitcher, tournaments);
  if (!info.eligibleDate) return "available";
  const eligMid = new Date(info.eligibleDate); eligMid.setHours(0,0,0,0);
  const ref = onDate ? new Date(onDate + "T00:00:00") : new Date();
  ref.setHours(0,0,0,0);
  if (eligMid <= ref) return "available";
  const msLeft = eligMid - ref;
  const daysLeft = Math.ceil(msLeft / 86400000);
  if (daysLeft <= 1) return "tomorrow";
  const restDays = info.isTourney ? info.restDays : getRegRestDays(pitcher.lastPitches);
  if (restDays <= 1) return "soon";
  if (restDays <= 2) return "resting2";
  return "resting";
}

function daysUntilEligible(pitcher, onDate, tournaments) {
  if (!pitcher.lastGameDate || pitcher.lastPitches === 0) return 0;
  const info = getTourneyAdjustedRestInfo(pitcher, tournaments);
  if (!info.eligibleDate) return 0;
  const eligMid = new Date(info.eligibleDate); eligMid.setHours(0,0,0,0);
  const ref = onDate ? new Date(onDate + "T00:00:00") : new Date();
  ref.setHours(0,0,0,0);
  const ms = eligMid - ref;
  return Math.max(0, Math.ceil(ms / 86400000));
}

function getEligibleDateStr(pitcher, tournaments) {
  if (!pitcher.lastGameDate || !pitcher.lastPitches) return null;
  const info = getTourneyAdjustedRestInfo(pitcher, tournaments);
  if (!info.eligibleDate) return null;
  // Plain local YYYY-MM-DD, matching every other date string in this app -
  // avoids a UTC round-trip (eligibleDate is built from a local-noon anchor
  // via getEligibleDate/getTourneyAdjustedRestInfo, so re-deriving it via
  // .toISOString() and re-parsing elsewhere is an unnecessary, fragile hop).
  const d = info.eligibleDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.includes("T") ? "" : "T12:00:00"));
  return d.toLocaleDateString("en-US", { month:"short", day:"numeric" });
}
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
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
  formatDate, todayStr, addDays, newId,
  getDeviceId, getCoachName, setCoachName, recomputeLast,
  getActiveTourney, getSubjectKey,
  TERM_ORDER, getSeasonName, compareSeasonsDesc,
};

});
