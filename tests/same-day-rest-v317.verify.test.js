// Independent verification of the v3.17 regular-season same-day rest rule.
// Written against the rule as stated by the user, NOT against the
// implementation: >rest1 pitches already logged on the game date -> not
// eligible again until rest is served; <=rest1 -> still eligible with
// maxPitches - earlier pitches left; the combined day total sets rest.
// Tournaments keep their own same-day rules.
//
// Contains its own oracle (UTC date math, no pitch-logic helpers) and a
// seeded randomized cross-check of Live (getLivePitcherBudget), Log Game
// (getGameLogCheck) and the Roster tab (getAvailabilityStatus /
// daysUntilEligible) so the three can't silently disagree again.
// Run: node tests/same-day-rest-v317.verify.test.js   (also try TZ=Pacific/Kiritimati, TZ=America/New_York)
const assert = require('assert');
const L = require('../lib/pitch-logic.js');
const {
  getLivePitcherBudget, getGameLogCheck, getRegularSeasonRestBlock, getAvailabilityStatus,
  daysUntilEligible, getEligibleDateStr, getTourneyEligibility, setCurrentRules, DEFAULT_RULES,
} = L;

let passed = 0, failed = 0, known = 0;
function test(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); }
}
// A pre-existing bug outside v3.17's scope: printed, not counted as a failure.
function knownBug(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); console.log('OK    (known-bug check now passes) ' + name); }
  catch (e) { known++; console.log('KNOWN ' + name + '\n      ' + (e && e.message)); }
}

// ── oracle ──────────────────────────────────────────────────────────────────
const utc = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const iso = ms => new Date(ms).toISOString().slice(0, 10);
const plus = (s, n) => iso(utc(s) + n * 86400000);
function oRest(n, r) { return n > r.rest3 ? 3 : n > r.rest2 ? 2 : n > r.rest1 ? 1 : 0; }
// Regular-only history: latest eligible date over every game day <= date.
function oracleBlock(history, date, r) {
  const byDay = {};
  history.forEach(h => { if (h.date <= date) byDay[h.date] = (byDay[h.date] || 0) + h.pitches; });
  let elig = null;
  Object.keys(byDay).forEach(d => {
    const rd = oRest(byDay[d], r);
    if (rd > 0) { const e = plus(d, rd + 1); if (!elig || e > elig) elig = e; }
  });
  return elig && elig > date ? elig : null;
}

const D = '2026-10-27';
let seq = 0;
const h = (date, pitches, extra = {}) => ({ gameId: 'g' + (seq++), date, pitches, opponent: 'X',
  isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null, ...extra });
const th = (date, pitches, tid = 'tA', day = 1) => h(date, pitches, { isTournament: true, tournamentId: tid, tournamentName: 'T', tourneyDay: day });
const pitcher = history => ({ id: 'p', name: 'P', jersey: '1', lastPitches: 0, lastGameDate: '', history });
const live = (date = D, context = 'regular', pitchers = {}) => ({ id: 'g1', date, context, opponent: 'Y', startedAt: 0, startedBy: 'c', pitchers });
const regCheck = (p, date, count = 10, tournaments = []) => getGameLogCheck(p, { context: 'regular', tourney: null, date, count, tournaments });
const T = (id, start, days = 3, max = 50, total = 100) => ({ id, name: id, startDate: start, days,
  dayLimits: Array.from({ length: days }, () => ({ max, isHard: true })), maxTotal: total });

// ── boundaries, default rules ───────────────────────────────────────────────
test('boundary sweep 0..80 earlier today: eligible iff <= rest1, pitchesLeft = 55 - prior', () => {
  for (let n = 0; n <= 80; n++) {
    const b = getLivePitcherBudget(pitcher(n ? [h(D, n)] : []), live(), []);
    const expectElig = n <= 20;
    assert.strictEqual(b.eligible, expectElig, `n=${n}: ${b.reason}`);
    assert.strictEqual(b.priorToday, n);
    assert.strictEqual(b.pitchesLeft, 55 - n, `n=${n}`);
    const want = oracleBlock([{ date: D, pitches: n }], D, DEFAULT_RULES);
    const c = regCheck(pitcher(n ? [h(D, n)] : []), D);
    assert.strictEqual(!!c, !!want, `logcheck n=${n}`);
    if (want) {
      assert.strictEqual(getRegularSeasonRestBlock(pitcher([h(D, n)]), [], D).eligibleDate, want);
      // wording follows the game date: "earlier today" only when it IS today (verification A1)
      assert.ok(/^Threw \d+p (earlier today|on [A-Z][a-z]{2} \d{1,2}) — eligible /.test(c.message) && c.message.startsWith(`Threw ${n}p `), c.message);
    }
  }
});
test('rest from the combined day total: 20 earlier + 21 now in Live -> rest reflects 41 (2 days)', () => {
  const g = live(D, 'regular', { p: { pitches: 21, status: 'active', order: 0, enteredAt: 1, leftAt: null } });
  const b = getLivePitcherBudget(pitcher([h(D, 20)]), g, []);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.used, 41);
  assert.strictEqual(b.pitchesLeft, 14);
  assert.strictEqual(b.rest.restDays, 2);
});
test('three same-day games 5 + 7 + 8 (=20) -> still eligible, 35 left; a fourth of 1 -> blocked', () => {
  const p = pitcher([h(D, 5), h(D, 7), h(D, 8)]);
  const b = getLivePitcherBudget(p, live(), []);
  assert.strictEqual(b.eligible, true, b.reason);
  assert.strictEqual(b.pitchesLeft, 35);
  p.history.push(h(D, 1));
  assert.strictEqual(getLivePitcherBudget(p, live(), []).eligible, false);
  assert.ok(regCheck(p, D));
});
test('after logging the combined total the Roster tab agrees (21 -> not available today, eligible D+2)', () => {
  const p = pitcher([h(D, 12), h(D, 9)]);
  assert.notStrictEqual(getAvailabilityStatus(p, D, []), 'available');
  assert.strictEqual(getEligibleDateStr(p, []), '2026-10-29');
  assert.strictEqual(daysUntilEligible(p, D, []), 2);
});

// ── custom team rules ───────────────────────────────────────────────────────
test('custom rules 75/30/50/70: 30 earlier -> eligible, 45 left; 31 -> blocked until D+2; 71 -> D+4', () => {
  const r = { maxPitches: 75, rest1: 30, rest2: 50, rest3: 70 };
  setCurrentRules(r);
  let b = getLivePitcherBudget(pitcher([h(D, 30)]), live(), []);
  assert.strictEqual(b.eligible, true); assert.strictEqual(b.pitchesLeft, 45);
  b = getLivePitcherBudget(pitcher([h(D, 31)]), live(), []);
  assert.strictEqual(b.eligible, false);
  assert.strictEqual(getRegularSeasonRestBlock(pitcher([h(D, 31)]), [], D).eligibleDate, '2026-10-29');
  assert.strictEqual(getRegularSeasonRestBlock(pitcher([h(D, 71)]), [], D).eligibleDate, '2026-10-31');
});
test('custom rules with maxPitches <= rest1 (40/50/60/70): 40 earlier -> unavailable via daily max', () => {
  setCurrentRules({ maxPitches: 40, rest1: 50, rest2: 60, rest3: 70 });
  const b = getLivePitcherBudget(pitcher([h(D, 40)]), live(), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/daily max/.test(b.reason), b.reason);
  // v3.18: no rest owed, but the day total (40 + 10) is over the 40 max -> Log Game warns
  const c = regCheck(pitcher([h(D, 40)]), D);
  assert.ok(c && c.level === 'violation' && /over the 40p daily max/.test(c.message), c && c.message);
});

// ── tournaments ─────────────────────────────────────────────────────────────
test('tournament outing earlier the same day blocks a regular game until the day after the tournament', () => {
  const t = T('tA', '2026-10-26');
  const p = pitcher([th(D, 10, 'tA', 2)]);
  const blk = getRegularSeasonRestBlock(p, [t], D);
  assert.strictEqual(blk.eligibleDate, '2026-10-29');
  assert.ok(/^Resting/.test(blk.reason));
  assert.ok(regCheck(p, D, 5, [t]));
});
test('tournament on its last day + regular game same evening: 45 total -> rest from last outing (2 days)', () => {
  const t = T('tA', '2026-10-25');            // ends D
  const p = pitcher([th('2026-10-25', 20, 'tA', 1), th(D, 25, 'tA', 3)]);
  assert.strictEqual(getRegularSeasonRestBlock(p, [t], D).eligibleDate, '2026-10-30');
});
test('tournament same-day: two games on one tournament day within the hard limit both allowed', () => {
  const t = T('tA', '2026-10-26');
  const p = pitcher([th(D, 20, 'tA', 2)]);
  const b = getLivePitcherBudget(p, live(D, 'tA'), [t]);
  assert.strictEqual(b.eligible, true, b.reason);
  assert.strictEqual(b.pitchesLeft, 30);
  assert.strictEqual(getGameLogCheck(p, { context: 'tA', tourney: t, date: D, count: 30, tournaments: [t] }), null);
  assert.strictEqual(getGameLogCheck(p, { context: 'tA', tourney: t, date: D, count: 31, tournaments: [t] }).level, 'violation');
});
test('regular-season same-day pitches do not count against a tournament day budget (tournament keeps its own rules)', () => {
  const t = T('tA', '2026-10-26');
  const p = pitcher([h(D, 30)]);
  const b = getLivePitcherBudget(p, live(D, 'tA'), [t]);
  assert.strictEqual(b.pitchesLeft, 50);
});

// ── past dates ──────────────────────────────────────────────────────────────
test('unfinished live game dated in the past: outings after its date ignored, on its date counted, before it counted', () => {
  const past = '2026-10-20';
  assert.strictEqual(getLivePitcherBudget(pitcher([h('2026-10-21', 60), h(D, 60)]), live(past), []).eligible, true);
  const same = getLivePitcherBudget(pitcher([h(past, 25), h(D, 60)]), live(past), []);
  assert.strictEqual(same.eligible, false);
  assert.ok(/eligible Oct 22/.test(same.reason), same.reason);
  const before = getLivePitcherBudget(pitcher([h('2026-10-19', 45)]), live(past), []);
  assert.strictEqual(before.eligible, false);
  assert.ok(/^Resting — eligible Oct 22/.test(before.reason), before.reason);
});
test('Log Game for a past date: same-day entry on that date blocks, later entries never do', () => {
  assert.ok(regCheck(pitcher([h('2026-10-10', 22), h(D, 60)]), '2026-10-10'));
  assert.strictEqual(regCheck(pitcher([h('2026-10-11', 60)]), '2026-10-10'), null);
});
test('live game later than all history (future date) uses all history', () => {
  // 45 on Oct 27 -> 2 rest days (Oct 28, 29) -> eligible Oct 30
  assert.strictEqual(getLivePitcherBudget(pitcher([h(D, 45)]), live('2026-10-29'), []).eligible, false);
  assert.strictEqual(getLivePitcherBudget(pitcher([h(D, 45)]), live('2026-10-30'), []).eligible, true);
});

// ── malformed input ─────────────────────────────────────────────────────────
test('string pitch counts are summed numerically ("10" + "11" -> 21 -> blocked)', () => {
  assert.ok(getRegularSeasonRestBlock(pitcher([h(D, '10'), h(D, '11')]), [], D));
  assert.strictEqual(getLivePitcherBudget(pitcher([h(D, '10'), h(D, '10')]), live(), []).pitchesLeft, 35);
});
test('entries with missing/invalid dates or NaN pitches never throw and are ignored', () => {
  const p = pitcher([h('', 60), h(null, 60), h('2026-13-45', 60), h('10/27/2026', 60), h(D, 'abc'), h(D, null)]);
  assert.strictEqual(getRegularSeasonRestBlock(p, [], D), null);
  const b = getLivePitcherBudget(p, live(), []);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.pitchesLeft, 55);
});
test('pitcher with no history array / legacy lastPitches only', () => {
  assert.strictEqual(getRegularSeasonRestBlock({ id: 'x' }, [], D), null);
  assert.ok(getRegularSeasonRestBlock({ id: 'x', history: [], lastGameDate: D, lastPitches: 30 }, [], D));
});
test('invalid live game date falls back to today (no throw)', () => {
  const b = getLivePitcherBudget(pitcher([]), live('garbage'), []);
  assert.strictEqual(b.eligible, true);
});
test('tournaments arg null/undefined tolerated', () => {
  assert.ok(getRegularSeasonRestBlock(pitcher([h(D, 30)]), undefined, D));
  assert.ok(getRegularSeasonRestBlock(pitcher([th(D, 30, 'gone')]), null, D)); // deleted tournament: rest still counts
});

// ── randomized cross-check: oracle vs Live vs Log Game vs Roster ────────────
test('randomized (seeded, 3000 cases): Live / Log Game / Roster agree with the oracle for the game date', () => {
  let s = 12345; const rnd = n => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
  const ruleSets = [DEFAULT_RULES, { maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 }, { maxPitches: 85, rest1: 35, rest2: 50, rest3: 65 }];
  for (let i = 0; i < 3000; i++) {
    const r = ruleSets[rnd(ruleSets.length)];
    const game = plus('2026-10-01', rnd(20));
    const hist = Array.from({ length: rnd(6) }, () => ({ date: plus('2026-10-01', rnd(20)), pitches: rnd(70) }));
    // Roster comparison only holds when nothing is logged after the game date.
    const histUpTo = hist.filter(x => x.date <= game);
    setCurrentRules({ ...r });
    const p = pitcher(hist.map(x => h(x.date, x.pitches)));
    const want = oracleBlock(hist, game, r);
    const prior = hist.filter(x => x.date === game).reduce((a, x) => a + x.pitches, 0);
    const b = getLivePitcherBudget(p, live(game), []);
    const expEligible = !want && prior < r.maxPitches;
    const ctx = `case ${i} rules=${JSON.stringify(r)} game=${game} hist=${JSON.stringify(hist)}`;
    assert.strictEqual(b.eligible, expEligible, `live ${ctx} reason=${b.reason}`);
    assert.strictEqual(b.pitchesLeft, r.maxPitches - prior, `left ${ctx}`);
    const blk = getRegularSeasonRestBlock(p, [], game);
    assert.strictEqual(blk ? blk.eligibleDate : null, want, `block ${ctx}`);
    assert.strictEqual(!!regCheck(p, game), !!want, `logcheck ${ctx}`);
    const p2 = pitcher(histUpTo.map(x => h(x.date, x.pitches)));
    const st = getAvailabilityStatus(p2, game, []);
    assert.strictEqual(st === 'available', !oracleBlock(histUpTo, game, r), `roster ${ctx} st=${st}`);
    const days = daysUntilEligible(p2, game, []);
    const w2 = oracleBlock(histUpTo, game, r);
    assert.strictEqual(days, w2 ? (utc(w2) - utc(game)) / 86400000 : 0, `days ${ctx}`);
  }
});

// Header ✓/😴 counts (App.js isAvailableNow) use getAvailabilityStatus(p, null)
// outside a tournament; for "today" that is the same function the Roster tab
// uses, so the randomized Roster check above covers it. During a tournament the
// header uses getTourneyEligibility, unaffected by v3.17:
test('header during a tournament: regular same-day rule does not leak into tournament eligibility', () => {
  const t = T('tA', '2026-10-26');
  const p = pitcher([th(D, 30, 'tA', 2)]);
  assert.strictEqual(getTourneyEligibility(p, t, D, [t]).eligible, true);
});

// ── pre-existing (not v3.17) — reported, not counted ───────────────────────
knownBug('DST fall-back: daysUntilEligible/getAvailabilityStatus off by one across the 25h day (run with TZ=America/New_York)', () => {
  const p = pitcher([h('2026-10-31', 25)]); // eligible Nov 2
  assert.strictEqual(daysUntilEligible(p, '2026-11-01', []), 1);
  assert.strictEqual(getAvailabilityStatus(p, '2026-11-01', []), 'tomorrow');
});
knownBug('isTournament entry without tournamentId: counted for rest but not in Live priorToday', () => {
  const p = pitcher([h(D, 10, { isTournament: true }), h(D, 10)]);
  assert.strictEqual(getLivePitcherBudget(p, live(), []).priorToday, 20);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)${known ? `, ${known} known pre-existing bug(s) reported` : ''}`);
process.exit(failed ? 1 : 0);
