// v3.17: regular-season same-day rest. Pitches already logged earlier on the
// game date count toward rest: once rest is owed (21+ that day with the default
// 20/40/60 rules), no more regular-season pitching that day. 20 or fewer owes
// nothing, so the pitcher stays available up to the daily max.
// Run: node tests/same-day-rest-v317.test.js
const assert = require('assert');
const logic = require('../lib/pitch-logic.js');
const {
  getLivePitcherBudget, getGameLogCheck, getRegularSeasonRestBlock,
  setCurrentRules, DEFAULT_RULES,
} = logic;

let passed = 0, failed = 0;
function test(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); }
}

const D = '2026-10-27';
const h = (date, pitches, extra = {}) => ({ gameId: 'g' + date + pitches + Math.random(), date, pitches,
  opponent: 'X', isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null, ...extra });
const pitcher = (history) => ({ id: 'p', name: 'P', jersey: '1', lastPitches: 0, lastGameDate: '', history });
const live = (date = D) => ({ id: 'g1', date, context: 'regular', opponent: 'Y', startedAt: 0, startedBy: 'c', pitchers: {} });
const T = { id: 'tA', name: 'Fall Classic', startDate: '2026-10-26', days: 3,
  dayLimits: [{ max: 50, isHard: true }, { max: 50, isHard: true }, { max: 50, isHard: true }], maxTotal: 100 };

test('21 earlier today -> not eligible today, eligible day after tomorrow', () => {
  const b = getLivePitcherBudget(pitcher([h(D, 21)]), live(), []);
  assert.strictEqual(b.eligible, false);
  assert.strictEqual(b.reason, 'Threw 21p on Oct 27 — eligible Oct 29');
});
test('20 earlier today -> still eligible with 35 left (0 rest days owed)', () => {
  const b = getLivePitcherBudget(pitcher([h(D, 20)]), live(), []);
  assert.strictEqual(b.eligible, true, b.reason);
  assert.strictEqual(b.priorToday, 20);
  assert.strictEqual(b.pitchesLeft, 35);
});
test('51 earlier today -> not eligible (2 rest days -> Oct 30)', () => {
  const b = getLivePitcherBudget(pitcher([h(D, 51)]), live(), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Threw 51p on Oct 27 — eligible Oct 30/.test(b.reason), b.reason);
});
test('two games today of 10 + 15 -> the day total (25) owes rest', () => {
  const b = getLivePitcherBudget(pitcher([h(D, 10), h(D, 15)]), live(), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Threw 25p on Oct 27/.test(b.reason), b.reason);
});
test('older rest that binds later still reads "Resting"', () => {
  // 61 two days ago -> 3 rest days -> eligible Oct 29; 5 today owes nothing
  const b = getLivePitcherBudget(pitcher([h('2026-10-25', 61), h(D, 5)]), live(), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/^Resting — eligible Oct 29/.test(b.reason), b.reason);
});
test('tournament pitches earlier today -> not eligible for a regular game today', () => {
  const p = pitcher([h(D, 10, { isTournament: true, tournamentId: 'tA', tournamentName: 'Fall Classic', tourneyDay: 2 })]);
  const b = getLivePitcherBudget(p, live(), [T]);
  assert.strictEqual(b.eligible, false);
  assert.ok(/^Resting/.test(b.reason), b.reason);
});
test('unfinished game from yesterday ignores outings logged after its date', () => {
  const y = '2026-10-26';
  const b = getLivePitcherBudget(pitcher([h(D, 45)]), live(y), []);
  assert.strictEqual(b.eligible, true, b.reason);
});
test('unfinished game from yesterday counts outings logged on yesterday', () => {
  const y = '2026-10-26';
  const b = getLivePitcherBudget(pitcher([h(y, 30)]), live(y), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Threw 30p on Oct 26/.test(b.reason), b.reason);
});
test('live count never changes eligibility mid-game (only logged history does)', () => {
  const g = live(); g.pitchers.p = { pitches: 40, status: 'active', order: 0, enteredAt: 1, leftAt: null };
  const b = getLivePitcherBudget(pitcher([]), g, []);
  assert.strictEqual(b.eligible, true);
});
test('Log Game save check flags a second same-day regular game after 21+', () => {
  const c = getGameLogCheck(pitcher([h(D, 21)]), { context: 'regular', tourney: null, date: D, count: 10, tournaments: [] });
  assert.deepStrictEqual(c, { level: 'violation', message: 'Threw 21p on Oct 27 — eligible Oct 29' });
});
test('Log Game save check allows a second game after 20 or fewer earlier', () => {
  assert.strictEqual(getGameLogCheck(pitcher([h(D, 20)]), { context: 'regular', tourney: null, date: D, count: 10, tournaments: [] }), null);
});
test('Log Game for an earlier date ignores later outings', () => {
  assert.strictEqual(getGameLogCheck(pitcher([h(D, 50)]), { context: 'regular', tourney: null, date: '2026-10-20', count: 10, tournaments: [] }), null);
});
test('tournament games keep their own rules (same-day pitching within limits allowed)', () => {
  const p = pitcher([h(D, 30, { isTournament: true, tournamentId: 'tA', tournamentName: 'Fall Classic', tourneyDay: 2 })]);
  const b = getLivePitcherBudget(p, { ...live(), context: 'tA' }, [T]);
  assert.strictEqual(b.eligible, true, b.reason);
  assert.strictEqual(b.pitchesLeft, 20); // Day 2 hard 50 - 30
});
test('reason says "earlier today" when the game date is today', () => {
  const today = logic.todayStr();
  const b = getLivePitcherBudget(pitcher([h(today, 21)]), live(today), []);
  assert.ok(/^Threw 21p earlier today — eligible /.test(b.reason), b.reason);
});
test('custom team rules: rest1 25 -> 25 earlier today still eligible, 26 not', () => {
  setCurrentRules({ maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 });
  assert.strictEqual(getRegularSeasonRestBlock(pitcher([h(D, 25)]), [], D), null);
  setCurrentRules({ maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 });
  assert.ok(getRegularSeasonRestBlock(pitcher([h(D, 26)]), [], D));
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
process.exit(failed ? 1 : 0);
