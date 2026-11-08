// v3.19: (A) a pitcher held out of the regular season only because their
// tournament isn't over shows as "In Tourney", not as rest days; (B) optional
// per-tournament rest tiers between tournament days.
// Run: node tests/tourney-rest-v319.test.js
const assert = require('assert');
const L = require('../lib/pitch-logic.js');
const {
  setCurrentRules, DEFAULT_RULES, getAvailabilityStatus, getTourneyAdjustedRestInfo, getRegularRestSummary,
  getRegularSeasonRestBlock, getTourneyRestTiers, getTourneyDayRestDays, describeTourneyOutDays,
  getTourneyRestBlock, getTourneyEligibility, getTourneyLimitViolation, getGameLogCheck,
  getLivePitcherBudget, getLiveMilestones, getLiveStatus, getTourneyDayRestSteps,
} = L;

let passed = 0, failed = 0;
function test(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); }
}

const th = (date, pitches, tid = 'tx', day = null) => ({ gameId: 'g' + date + pitches + Math.random(), date, pitches,
  opponent: 'X', isTournament: true, tournamentId: tid, tournamentName: 'Texas 20', tourneyDay: day, sharedGameId: null });
const rg = (date, pitches) => ({ gameId: 'r' + date + pitches + Math.random(), date, pitches,
  opponent: 'X', isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null });
const pitcher = history => ({ id: 'p', name: 'Wyatt', jersey: '27', lastPitches: 0, lastGameDate: '', history });
// The user's real tournament: Nov 7-8, Day 1 30 guideline, Day 2 45 guideline, 75 total.
const TX = (extra = {}) => ({ id: 'tx', name: '5 Tool - Texas 20', startDate: '2026-11-07', days: 2,
  dayLimits: [{ max: 30, isHard: false }, { max: 45, isHard: false }], maxTotal: 75, ...extra });
const live = (date, context = 'tx', pitchers = {}) => ({ id: 'g1', date, context, opponent: 'Y', startedAt: 0, startedBy: 'c', pitchers });

// ── A. Tournament hold is not rest ───────────────────────────────────────────
test('A1. Wyatt: 15p on Day 1 viewed Day 1 -> "tourney" status, not "2 Days"', () => {
  const p = pitcher([th('2026-11-07', 15)]);
  assert.strictEqual(getAvailabilityStatus(p, '2026-11-07', [TX()]), 'tourney');
  const info = getTourneyAdjustedRestInfo(p, [TX()]);
  assert.strictEqual(info.heldByTourney, true);
  assert.strictEqual(info.restDays, 0);
  assert.strictEqual(info.tourneyEndDate, '2026-11-08');
});
test('A2. summary: no rest owed, regular season from Nov 9, tournament name', () => {
  const s = getRegularRestSummary(pitcher([th('2026-11-07', 15)]), [TX()], '2026-11-07');
  assert.deepStrictEqual(s, { available: false, eligibleDate: '2026-11-09', heldByTourney: true,
    tourneyName: '5 Tool - Texas 20', tourneyEndDate: '2026-11-08', restLeft: 0 });
});
test('A3. available again the day after the tournament', () => {
  const p = pitcher([th('2026-11-07', 15)]);
  assert.strictEqual(getAvailabilityStatus(p, '2026-11-09', [TX()]), 'available');
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-09').available, true);
});
test('A4. real rest past the floor is still rest (45 total -> 2 days, Nov 11)', () => {
  const p = pitcher([th('2026-11-07', 30), th('2026-11-08', 15)]);
  const info = getTourneyAdjustedRestInfo(p, [TX()]);
  assert.strictEqual(info.heldByTourney, false);
  assert.strictEqual(L.toLocalDateStr(info.eligibleDate), '2026-11-11');
  assert.strictEqual(getAvailabilityStatus(p, '2026-11-08', [TX()]), 'resting2');
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-08').restLeft, 2);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-09').restLeft, 2);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-10').restLeft, 1);
});
test('A5. rest date equal to the floor counts as rest, not a hold', () => {
  // 25p on Day 1 (Nov 7): 1 rest day -> Nov 9 == floor
  const p = pitcher([th('2026-11-07', 25)]);
  const info = getTourneyAdjustedRestInfo(p, [TX()]);
  assert.strictEqual(info.heldByTourney, false);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-08').restLeft, 1);
});
test('A6. regular rest from an earlier game that binds later is not a hold', () => {
  const p = pitcher([rg('2026-11-06', 65), th('2026-11-07', 5)]);
  const info = getTourneyAdjustedRestInfo(p, [TX()]);
  assert.strictEqual(info.heldByTourney, false);
  assert.strictEqual(L.toLocalDateStr(info.eligibleDate), '2026-11-10');
});
test('A7. regular-season block reason names the tournament', () => {
  const b = getRegularSeasonRestBlock(pitcher([th('2026-11-07', 15)]), [TX()], '2026-11-07');
  assert.strictEqual(b.reason, 'In 5 Tool - Texas 20 through Nov 8 — eligible Nov 9');
});
test('A8. regular rest summary: pitched today, 25p -> 1 rest day left', () => {
  const s = getRegularRestSummary(pitcher([rg('2026-11-07', 25)]), [], '2026-11-07');
  assert.strictEqual(s.restLeft, 1);
  assert.strictEqual(s.eligibleDate, '2026-11-09');
});

// ── B. Rest tiers ─────────────────────────────────────────────────────────────
test('B1. tier parsing: ordered, increasing, stops at gap/invalid', () => {
  assert.deepStrictEqual(getTourneyRestTiers(TX()), []);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: { rest1: 30, rest2: 0, rest3: 0 } })), [30]);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: { rest1: 30, rest2: 50, rest3: 70 } })), [30, 50, 70]);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: { rest1: 0, rest2: 50 } })), []);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: { rest1: 30, rest2: 20, rest3: 70 } })), [30]);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: { rest1: '30', rest2: 'abc' } })), [30]);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: [30, 50] })), [30, 50]);
  assert.deepStrictEqual(getTourneyRestTiers(TX({ restTiers: 'junk' })), []);
});
test('B2. strict >: 30 = 0 days, 31 = 1, tiers stack', () => {
  const t = TX({ restTiers: { rest1: 30, rest2: 50, rest3: 70 } });
  assert.deepStrictEqual([0, 30, 31, 50, 51, 70, 71].map(n => getTourneyDayRestDays(t, n)), [0, 0, 1, 1, 2, 2, 3]);
});
const T30 = () => TX({ restTiers: { rest1: 30 } });
test('B3. user example: 31+ on Day 1 -> out Day 2', () => {
  const p = pitcher([th('2026-11-07', 31)]);
  const e = getTourneyEligibility(p, T30(), '2026-11-08', [T30()]);
  assert.strictEqual(e.eligible, false);
  assert.strictEqual(e.code, 'tourneyRest');
  assert.strictEqual(e.reason, 'Threw 31p on Day 1 — 1 rest day, out rest of tournament');
});
test('B4. user example: 30 on Day 1 -> eligible Day 2 with 45 left of 75', () => {
  const p = pitcher([th('2026-11-07', 30)]);
  const e = getTourneyEligibility(p, T30(), '2026-11-08', [T30()]);
  assert.strictEqual(e.eligible, true, e.reason);
  assert.strictEqual(e.pitchesLeft, 45);
});
test('B5. multiple games on one day are summed for the tier', () => {
  const p = pitcher([th('2026-11-07', 20), th('2026-11-07', 11)]);
  assert.strictEqual(getTourneyEligibility(p, T30(), '2026-11-08', [T30()]).eligible, false);
});
test('B6. (v3.20) logged pitches over a tier block the rest of that same day; at the tier they do not', () => {
  const p = pitcher([th('2026-11-07', 35)]);
  const e = getTourneyEligibility(p, T30(), '2026-11-07', [T30()]);
  assert.strictEqual(e.code, 'tourneyRest');
  assert.strictEqual(e.eligible, false);
  assert.strictEqual(getTourneyEligibility(pitcher([th('2026-11-07', 30)]), T30(), '2026-11-07', [T30()]).eligible, true);
});
test('B7. any day -> next days; 2-day tier in a 4-day tournament', () => {
  const t = TX({ days: 4, dayLimits: [], maxTotal: 200, restTiers: { rest1: 30, rest2: 50 } });
  const p = pitcher([th('2026-11-08', 55)]); // Day 2
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-09', [t]).eligible, false); // Day 3
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-10', [t]).eligible, false); // Day 4
  const b = getTourneyRestBlock(p, t, '2026-11-09');
  assert.deepStrictEqual({ from: b.fromDay, rest: b.restDays, last: b.lastOutDay, ed: b.eligibleDay },
    { from: 2, rest: 2, last: 4, ed: null });
  const p2 = pitcher([th('2026-11-07', 35)]); // Day 1, 1 day
  assert.strictEqual(getTourneyEligibility(p2, t, '2026-11-08', [t]).eligible, false);
  assert.strictEqual(getTourneyEligibility(p2, t, '2026-11-09', [t]).eligible, true);
  assert.strictEqual(getTourneyRestBlock(p2, t, '2026-11-08').eligibleDate, '2026-11-09');
  assert.ok(/eligible Day 3 \(Nov 9\)/.test(getTourneyEligibility(p2, t, '2026-11-08', [t]).reason));
});
test('B8. latest-ending block wins across days', () => {
  const t = TX({ days: 4, dayLimits: [], maxTotal: 200, restTiers: { rest1: 30, rest2: 50 } });
  const p = pitcher([th('2026-11-07', 55), th('2026-11-09', 35)]); // D1 -> out D2-3, D3 -> out D4
  const b = getTourneyRestBlock(p, t, '2026-11-10');
  assert.strictEqual(b.fromDay, 3);
});
test('B9. no tiers = pre-v3.19 behavior (no rest between days)', () => {
  const p = pitcher([th('2026-11-07', 60)]);
  assert.strictEqual(getTourneyEligibility(p, TX(), '2026-11-08', [TX()]).eligible, true);
});
test('B10. save-time: logging on a rest day is a violation', () => {
  const p = pitcher([th('2026-11-07', 31)]);
  const v = getTourneyLimitViolation(p, T30(), '2026-11-08', 5, [T30()]);
  assert.strictEqual(v.level, 'violation');
  assert.ok(/^Rest day — Threw 31p on Day 1/.test(v.message), v.message);
  const g = getGameLogCheck(p, { context: 'tx', tourney: T30(), date: '2026-11-08', count: 5, tournaments: [T30()] });
  assert.strictEqual(g.level, 'violation');
});
test('B11. save-time: crossing a tier is a non-blocking note (not on the last day)', () => {
  const p = pitcher([th('2026-11-07', 20)]);
  const v = getTourneyLimitViolation(p, T30(), '2026-11-07', 15, [T30()]);
  assert.strictEqual(v.level, 'note');
  assert.ok(/Day 1: 35p — 1 rest day, out Day 2/.test(v.message), v.message);
  // Day 2 is the last day: no tournament days left to sit -> only the guideline matters
  assert.strictEqual(getTourneyLimitViolation(pitcher([]), T30(), '2026-11-08', 40, [T30()]), null);
});
test('B12. note combines guideline + tier', () => {
  const v = getTourneyLimitViolation(pitcher([]), T30(), '2026-11-07', 33, [T30()]);
  assert.strictEqual(v.level, 'note');
  assert.ok(/Over Day 1 guideline/.test(v.message) && /out Day 2/.test(v.message), v.message);
});
test('B13. out-day labels', () => {
  const t = TX({ days: 4 });
  assert.strictEqual(describeTourneyOutDays(t, 1, 1), 'Day 2');
  assert.strictEqual(describeTourneyOutDays(t, 1, 2), 'Days 2–3');
  assert.strictEqual(describeTourneyOutDays(t, 3, 3), 'Day 4');
  assert.strictEqual(describeTourneyOutDays(t, 4, 1), null);
  assert.strictEqual(describeTourneyOutDays(t, 1, 0), null);
});

// ── B (Live) ──────────────────────────────────────────────────────────────────
test('B14. Live: day ring ticks + milestones for the tier', () => {
  const t = TX({ dayLimits: [{ max: 40, isHard: false }, { max: 45, isHard: false }], restTiers: { rest1: 30 } });
  const p = pitcher([]);
  const b = getLivePitcherBudget(p, live('2026-11-07', 'tx', { p: { pitches: 30, status: 'active', order: 1, enteredAt: 1 } }), [t]);
  assert.deepStrictEqual(b.rings[0].ticks, [30]);
  assert.ok(b.milestones.some(m => m.text === 'Next pitch = out Day 2'), JSON.stringify(b.milestones));
  assert.strictEqual(b.status.next, 'Next pitch = out Day 2');
  assert.strictEqual(b.status.dayOut, null);
  const b2 = getLivePitcherBudget(p, live('2026-11-07', 'tx', { p: { pitches: 31, status: 'active', order: 1, enteredAt: 1 } }), [t]);
  assert.strictEqual(b2.status.dayOut, 'Day 2');
  assert.ok(b2.milestones.some(m => m.text === 'Now out Day 2'));
  const b3 = getLivePitcherBudget(p, live('2026-11-07', 'tx', { p: { pitches: 26, status: 'active', order: 1, enteredAt: 1 } }), [t]);
  assert.ok(b3.milestones.some(m => m.text === '5 pitches until out Day 2 (at 31p today)'), JSON.stringify(b3.milestones));
});
test('B15. Live: last day has no tier warnings', () => {
  const p = pitcher([]);
  const b = getLivePitcherBudget(p, live('2026-11-08', 'tx', { p: { pitches: 30, status: 'active', order: 1, enteredAt: 1 } }), [T30()]);
  assert.deepStrictEqual(getTourneyDayRestSteps(T30(), 2), []);
  assert.ok(!b.milestones.some(m => /out Day/.test(m.text)));
  assert.strictEqual(b.status.dayOut, null);
});
test('B16. Live: pitcher on a rest day is not eligible, reason shown', () => {
  const p = pitcher([th('2026-11-07', 31)]);
  const b = getLivePitcherBudget(p, live('2026-11-08'), [T30()]);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Threw 31p on Day 1/.test(b.reason));
});
test('B17. regular rest after tournament unchanged by tiers (total-based)', () => {
  const p = pitcher([th('2026-11-07', 31)]);
  const a = getTourneyAdjustedRestInfo(p, [T30()]), b = getTourneyAdjustedRestInfo(p, [TX()]);
  assert.strictEqual(L.toLocalDateStr(a.eligibleDate), L.toLocalDateStr(b.eligibleDate));
});
test('B18. junk inputs never throw', () => {
  [null, undefined, {}, { restTiers: null }, { restTiers: { rest1: -5 } }, { restTiers: { rest1: 1e21 } }].forEach(t => {
    getTourneyRestTiers(t); getTourneyDayRestDays(t, 50);
    getTourneyRestBlock(pitcher([th('2026-11-07', 99)]), t, '2026-11-08');
  });
  getLiveStatus({ restUsed: 5, limits: [], restAfterTourney: true, dayRest: { used: 'x', steps: null } });
  getLiveMilestones({ restUsed: 5, limits: [], restAfterTourney: true, dayRest: {} });
});

// ── v3.20: same-day tier block (Jackson: 33p on Day 1 with a 30 tier) ─────────
test('C1. Jackson 33p on Day 1: not eligible for the rest of Day 1 or Day 2', () => {
  const t = TX({ dayLimits: [{ max: 50, isHard: false }, { max: 50, isHard: false }], restTiers: { rest1: 30 } });
  const p = pitcher([th('2026-11-07', 11), th('2026-11-07', 22)]);
  const d1 = getTourneyEligibility(p, t, '2026-11-07', [t]);
  assert.strictEqual(d1.eligible, false);
  assert.ok(/^Threw 33p (today|earlier that day) \(Day 1\) — 1 rest day, out rest of tournament$/.test(d1.reason), d1.reason);
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-08', [t]).eligible, false);
});
test('C2. second game the same day after crossing: save-time violation', () => {
  const p = pitcher([th('2026-11-07', 33)]);
  const v = getTourneyLimitViolation(p, T30(), '2026-11-07', 5, [T30()]);
  assert.strictEqual(v.level, 'violation');
});
test('C3. game that itself crosses the tier: still only a note (option a)', () => {
  const v = getTourneyLimitViolation(pitcher([th('2026-11-07', 20)]), T30(), '2026-11-07', 13, [T30()]);
  assert.strictEqual(v.level, 'note');
});
test('C4. Live: crossing mid-game keeps the pitcher eligible in that game (live count is not logged)', () => {
  const b = getLivePitcherBudget(pitcher([]), live('2026-11-07', 'tx', { p: { pitches: 33, status: 'active', order: 1, enteredAt: 1 } }), [T30()]);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.status.dayOut, 'Day 2');
});
test('C5. Live: a pitcher who crossed in an earlier logged game today cannot be brought in', () => {
  const b = getLivePitcherBudget(pitcher([th('2026-11-07', 33)]), live('2026-11-07'), [T30()]);
  assert.strictEqual(b.eligible, false);
});
test('C6. last day: crossing ends the day even with no tournament day after', () => {
  const p = pitcher([th('2026-11-08', 31)]);
  const e = getTourneyEligibility(p, T30(), '2026-11-08', [T30()]);
  assert.strictEqual(e.eligible, false);
});
test('C7. viewing an earlier day does not use later days\' pitches', () => {
  const t = TX({ days: 3, dayLimits: [], maxTotal: 200, restTiers: { rest1: 30 } });
  const p = pitcher([th('2026-11-08', 40)]); // Day 2
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-07', [t]).eligible, true);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed) process.exit(1);
