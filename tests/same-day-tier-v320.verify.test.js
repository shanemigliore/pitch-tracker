#!/usr/bin/env node
// Independent verification of v3.20: tournament rest tiers also end the day the
// tier is crossed (pitches already LOGGED on a day count toward that day's tier).
// A live, unlogged count crossing the tier does not stop the pitcher in that game.
// Dependency-free. Run: node tests/same-day-tier-v320.verify.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../lib/pitch-logic.js');
const {
  setCurrentRules, DEFAULT_RULES, getTourneyRestBlock, getTourneyEligibility, getTourneyLimitViolation,
  getGameLogCheck, getLivePitcherBudget, getEligibleDateStr, getAvailabilityStatus, todayStr, addDays,
  liveGameToLogEntries, normalizeLiveGame,
} = L;

let passed = 0, failed = 0;
function test(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)); }
}
let seq = 0;
const tg = (date, pitches, tid = 'tx') => ({ gameId: 'g' + (seq++), date, pitches, opponent: 'X', isTournament: true,
  tournamentId: tid, tournamentName: 'T', tourneyDay: null, sharedGameId: null });
const rg = (date, pitches) => ({ gameId: 'g' + (seq++), date, pitches, opponent: 'X', isTournament: false,
  tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null });
const P = (history, id = 'j') => ({ id, name: 'Jackson', jersey: '4', lastPitches: 0, lastGameDate: '', history });
const lim = (n, max = 75, isHard = true) => Array.from({ length: n }, () => ({ max, isHard }));
const T = (days, tiers, extra = {}) => ({ id: 'tx', name: 'Fall Classic', startDate: '2026-11-07', days,
  dayLimits: lim(days), maxTotal: 300, restTiers: tiers, ...extra });
const D = n => addDays('2026-11-07', n - 1); // tournament day n -> date
const LG = (date, pitchers = {}, context = 'tx') => ({ id: 'lg', date, context, opponent: 'Y', startedAt: 0, startedBy: 'c', pitchers });
const act = n => ({ pitches: n, status: 'active', order: 0, enteredAt: 0, leftAt: null });

// ───────────────────── Functionality: the reported bug ─────────────────────
test('F1 Jackson 33p Day 1 (tier 30, 2-day): ineligible rest of Day 1, code tourneyRest', () => {
  const t = T(2, { rest1: 30 });
  const e = getTourneyEligibility(P([tg(D(1), 33)]), t, D(1), [t]);
  assert.strictEqual(e.eligible, false); assert.strictEqual(e.code, 'tourneyRest');
  assert.ok(e.restBlock.sameDay); assert.strictEqual(e.restBlock.fromDay, 1);
  assert.strictEqual(e.restBlock.eligibleDay, null);
  assert.ok(/Threw 33p (today|earlier that day) \(Day 1\) — 1 rest day, out rest of tournament/.test(e.reason), e.reason);
});
test('F2 Jackson Day 2 also out (unchanged from v3.19)', () => {
  const t = T(2, { rest1: 30 });
  const e = getTourneyEligibility(P([tg(D(1), 33)]), t, D(2), [t]);
  assert.strictEqual(e.eligible, false); assert.strictEqual(e.code, 'tourneyRest');
  assert.ok(/Threw 33p on Day 1/.test(e.reason), e.reason);
});
test('F3 exactly the threshold (30) stays eligible on Day 1 and Day 2', () => {
  const t = T(2, { rest1: 30 });
  const p = P([tg(D(1), 30)]);
  assert.strictEqual(getTourneyEligibility(p, t, D(1), [t]).eligible, true);
  assert.strictEqual(getTourneyEligibility(p, t, D(1), [t]).pitchesLeft, 45);
  assert.strictEqual(getTourneyEligibility(p, t, D(2), [t]).eligible, true);
  assert.strictEqual(getTourneyRestBlock(p, t, D(1)), null);
});
test('F4 3-day: 33p Day 1 -> out Day 1 & 2, eligible Day 3 with sensible reason', () => {
  const t = T(3, { rest1: 30 });
  const p = P([tg(D(1), 33)]);
  const e1 = getTourneyEligibility(p, t, D(1), [t]);
  assert.strictEqual(e1.eligible, false);
  assert.ok(/1 rest day, eligible Day 3 \(Nov 9\)/.test(e1.reason), e1.reason);
  assert.strictEqual(getTourneyEligibility(p, t, D(2), [t]).eligible, false);
  assert.strictEqual(getTourneyEligibility(p, t, D(3), [t]).eligible, true);
});
test('F5 last tournament day: crossing tier still ends that day', () => {
  const t = T(2, { rest1: 30 });
  const p = P([tg(D(2), 31)]);
  const e = getTourneyEligibility(p, t, D(2), [t]);
  assert.strictEqual(e.eligible, false); assert.strictEqual(e.code, 'tourneyRest');
  assert.ok(/out rest of tournament/.test(e.reason), e.reason);
  // single-day tournament with tiers
  const t1 = T(1, { rest1: 30 });
  assert.strictEqual(getTourneyEligibility(P([tg(D(1), 31)]), t1, D(1), [t1]).eligible, false);
});
test('F6 multiple games same day sum: 20 + 15 = 35 > 30 blocks; 15 + 15 = 30 does not', () => {
  const t = T(3, { rest1: 30 });
  assert.strictEqual(getTourneyEligibility(P([tg(D(1), 20), tg(D(1), 15)]), t, D(1), [t]).eligible, false);
  const ok = getTourneyEligibility(P([tg(D(1), 15), tg(D(1), 15)]), t, D(1), [t]);
  assert.strictEqual(ok.eligible, true); assert.strictEqual(ok.pitchesLeft, 45);
});
test('F7 2/3-day tiers: 45p (tiers 30/40/50) Day 1 of 4 -> out Days 1-3, eligible Day 4', () => {
  const t = T(4, { rest1: 30, rest2: 40, rest3: 50 });
  const p = P([tg(D(1), 45)]);
  const e = getTourneyEligibility(p, t, D(1), [t]);
  assert.strictEqual(e.restBlock.restDays, 2); assert.strictEqual(e.restBlock.eligibleDay, 4);
  assert.ok(/2 rest days, eligible Day 4/.test(e.reason), e.reason);
  [1, 2, 3].forEach(d => assert.strictEqual(getTourneyEligibility(p, t, D(d), [t]).eligible, false, 'day ' + d));
  assert.strictEqual(getTourneyEligibility(p, t, D(4), [t]).eligible, true);
  const p3 = P([tg(D(1), 51)]);
  [1, 2, 3, 4].forEach(d => assert.strictEqual(getTourneyEligibility(p3, t, D(d), [t]).eligible, false, '3-tier day ' + d));
});
test('F8 viewing an earlier day ignores later days\' pitches', () => {
  const t = T(4, { rest1: 30 });
  // Day 1 10p, Day 3 40p: Day 1 and Day 2 must be eligible, Day 3 & 4 out.
  const p = P([tg(D(1), 10), tg(D(3), 40)]);
  assert.strictEqual(getTourneyEligibility(p, t, D(1), [t]).eligible, true);
  assert.strictEqual(getTourneyEligibility(p, t, D(2), [t]).eligible, true);
  assert.strictEqual(getTourneyRestBlock(p, t, D(2)), null);
  assert.strictEqual(getTourneyEligibility(p, t, D(3), [t]).eligible, false);
  assert.strictEqual(getTourneyEligibility(p, t, D(4), [t]).eligible, false);
});
test('F9 latest-ending block wins (earlier-day rest vs same-day crossing)', () => {
  const t = T(4, { rest1: 30 });
  // Day 1 35 (out Day 2) then Day 2 logged anyway 35 (override) -> on Day 2, block until Day 3, eligible Day 4
  const b = getTourneyRestBlock(P([tg(D(1), 35), tg(D(2), 35)]), t, D(2));
  assert.strictEqual(b.fromDay, 2); assert.strictEqual(b.sameDay, true); assert.strictEqual(b.eligibleDay, 4);
});
test('F10 no tiers = v3.18 behaviour: 33p Day 1 stays eligible same day', () => {
  const t = T(2, undefined);
  const e = getTourneyEligibility(P([tg(D(1), 33)]), t, D(1), [t]);
  assert.strictEqual(e.eligible, true); assert.strictEqual(e.pitchesLeft, 42);
});
test('F11 regular-season rest after the tournament is unchanged (total-based)', () => {
  const t = T(2, { rest1: 30 });
  const t0 = T(2, undefined);
  const h = [tg(D(1), 33)];
  assert.strictEqual(getEligibleDateStr(P(h), [t]), getEligibleDateStr(P(h), [t0]));
  assert.strictEqual(getAvailabilityStatus(P(h), D(3), [t]), getAvailabilityStatus(P(h), D(3), [t0]));
});
test('F12 other tournaments\' games and regular games on that date do not count toward the tier', () => {
  const t = T(2, { rest1: 30 });
  const p = P([tg(D(1), 20), tg(D(1), 20, 'other'), rg(D(1), 15)]);
  assert.strictEqual(getTourneyRestBlock(p, t, D(1)), null);
});

// ──────────────── Save-time checks (Log Game / Live completion) ─────────────
test('S1 second game on a day already over the tier = violation, warn-and-override', () => {
  const t = T(2, { rest1: 30 });
  const v = getGameLogCheck(P([tg(D(1), 33)]), { context: 'tx', tourney: t, date: D(1), count: 5, tournaments: [t] });
  assert.ok(v && v.level === 'violation', JSON.stringify(v));
  assert.ok(/Threw 33p .*\(Day 1\)/.test(v.message), v.message);
});
test('S2 a game that itself crosses the tier is only a note naming out days', () => {
  const t = T(3, { rest1: 30 });
  const v = getGameLogCheck(P([]), { context: 'tx', tourney: t, date: D(1), count: 35, tournaments: [t] });
  assert.ok(v && v.level === 'note', JSON.stringify(v));
  assert.ok(/Day 1: 35p — 1 rest day, out Day 2/.test(v.message), v.message);
  // two games, second one crosses: 20 logged + 15 -> note
  const v2 = getGameLogCheck(P([tg(D(1), 20)]), { context: 'tx', tourney: t, date: D(1), count: 15, tournaments: [t] });
  assert.ok(v2 && v2.level === 'note', JSON.stringify(v2));
});
test('S3 crossing on the last day: no note (no days left) and no violation', () => {
  const t = T(2, { rest1: 30 });
  assert.strictEqual(getGameLogCheck(P([]), { context: 'tx', tourney: t, date: D(2), count: 35, tournaments: [t] }), null);
});
test('S4 logging a game on a later day does not retroactively block an earlier-day log', () => {
  const t = T(3, { rest1: 30 });
  // Day 2 has 40 logged; logging a Day 1 game afterwards (back-filling) is judged on Day 1's own pitches
  const v = getGameLogCheck(P([tg(D(2), 40)]), { context: 'tx', tourney: t, date: D(1), count: 10, tournaments: [t] });
  assert.strictEqual(v, null, JSON.stringify(v));
});
test('S5 Live completion: liveGameToLogEntries + check over a pitcher with a game already logged today', () => {
  const t = T(2, { rest1: 30 });
  const lg = normalizeLiveGame(LG(D(1), { j: act(10) }));
  const { entries } = liveGameToLogEntries(lg, [t], 'sg');
  assert.strictEqual(entries.length, 1);
  const v = getGameLogCheck(P([tg(D(1), 33)]), { context: 'tx', tourney: t, date: D(1), count: 10, tournaments: [t] });
  assert.strictEqual(v.level, 'violation');
});

// ─────────────────────────── Live tab (option a) ───────────────────────────
test('L1 live count crossing the tier mid-game does NOT make the pitcher ineligible', () => {
  const t = T(2, { rest1: 30 });
  const p = P([]);
  const b = getLivePitcherBudget(p, LG(D(1), { j: act(35) }), [t]);
  assert.strictEqual(b.eligible, true, b.reason);
  assert.strictEqual(b.status.dayOut, 'Day 2');
  assert.ok(b.pitchesLeft > 0);
});
test('L2 earlier logged game + live count: logged under tier, live pushes over -> still eligible, SITS Day 2', () => {
  const t = T(3, { rest1: 30 });
  const b = getLivePitcherBudget(P([tg(D(1), 20)]), LG(D(1), { j: act(15) }), [t]);
  assert.strictEqual(b.eligible, true); assert.strictEqual(b.status.dayOut, 'Day 2');
});
test('L3 logged over tier earlier today -> not available for a new live game, reason shown', () => {
  const t = T(2, { rest1: 30 });
  const b = getLivePitcherBudget(P([tg(D(1), 33)]), LG(D(1), {}), [t]);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Threw 33p/.test(b.reason), b.reason);
  assert.ok(b.status.alert && /Threw 33p/.test(b.status.alert));
});
test('L4 live count never feeds getTourneyRestBlock (same history -> same block regardless of live count)', () => {
  const t = T(2, { rest1: 30 });
  const p = P([tg(D(1), 10)]);
  for (const n of [0, 25, 31, 999]) assert.strictEqual(getLivePitcherBudget(p, LG(D(1), { j: act(n) }), [t]).eligible, true, 'n=' + n);
});

// ─────────────────────────────── Usability ─────────────────────────────────
test('U1 "today" wording when the date is today; "earlier that day" otherwise; never "on Day N" for same day', () => {
  const today = todayStr();
  const t = { ...T(2, { rest1: 30 }), startDate: today };
  const e = getTourneyEligibility(P([tg(today, 33)]), t, today, [t]);
  assert.strictEqual(e.reason, 'Threw 33p today (Day 1) — 1 rest day, out rest of tournament');
  const t2 = T(2, { rest1: 30 });
  const e2 = getTourneyEligibility(P([tg(D(1), 33)]), t2, D(1), [t2]);
  if (D(1) !== today) assert.strictEqual(e2.reason, 'Threw 33p earlier that day (Day 1) — 1 rest day, out rest of tournament');
});
test('U2 violation message for second game is readable (prefix + reason)', () => {
  const t = T(3, { rest1: 30 });
  const v = getTourneyLimitViolation(P([tg(D(1), 33)]), t, D(1), 5, [t]);
  assert.ok(/^Rest day — Threw 33p .* \(Day 1\) — 1 rest day, eligible Day 3 \(Nov 9\)$/.test(v.message), v.message);
});
test('U3 rest block takes priority over the hard daily limit reason when both apply', () => {
  const t = { ...T(2, { rest1: 30 }), dayLimits: lim(2, 40) };
  const e = getTourneyEligibility(P([tg(D(1), 45)]), t, D(1), [t]);
  assert.strictEqual(e.code, 'tourneyRest');
});
test('U4 Roster tourneyLeft is null when blocked (EligibilityScreen maps eligible -> pitchesLeft)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'EligibilityScreen.js'), 'utf8');
  assert.ok(/tourneyLeft:te\.eligible \? te\.pitchesLeft : null/.test(src));
  assert.ok(/te\.code==="tourneyRest" \? \(te\.restBlock && te\.restBlock\.sameDay \? "Done Today" : "Rest Day"\)/.test(src));
});

// ─────────────────────── Stability / untrusted data ────────────────────────
test('X1 dates before start are evaluated as Day 1 (no crash, consistent)', () => {
  const t = T(2, { rest1: 30 });
  const e = getTourneyEligibility(P([tg(D(1), 33)]), t, '2026-11-01', [t]);
  assert.strictEqual(e.dayNum, 1); assert.strictEqual(e.eligible, false);
  const e0 = getTourneyEligibility(P([]), t, '2026-11-01', [t]);
  assert.strictEqual(e0.eligible, true);
  assert.strictEqual(getTourneyRestBlock(P([tg(D(1), 33)]), t, '2026-11-01'), null); // raw block: outside tournament
});
test('X2 dates after the tournament: no block, "ended"', () => {
  const t = T(2, { rest1: 30 });
  assert.strictEqual(getTourneyRestBlock(P([tg(D(1), 33)]), t, D(3)), null);
  assert.strictEqual(getTourneyEligibility(P([tg(D(1), 33)]), t, D(3), [t]).code, 'ended');
});
test('X3 junk pitches / dates / tourneyDay in history never crash and never count as over a tier', () => {
  const t = T(3, { rest1: 30 });
  const junk = [
    { tournamentId: 'tx', date: D(1), pitches: 'abc' }, { tournamentId: 'tx', date: D(1), pitches: null },
    { tournamentId: 'tx', date: 'garbage', pitches: 99, tourneyDay: 'x' }, { tournamentId: 'tx', date: D(1), pitches: NaN },
    { tournamentId: 'tx', date: D(1), pitches: -50 }, { tournamentId: 'tx' }, null && {},
  ].filter(Boolean);
  const p = P(junk);
  assert.doesNotThrow(() => getTourneyEligibility(p, t, D(1), [t]));
  assert.strictEqual(getTourneyRestBlock(p, t, D(1)), null);
  assert.doesNotThrow(() => getLivePitcherBudget(p, LG(D(1), { j: act(5) }), [t]));
});
test('X4 numeric-string pitches still count (RTDB strings): "33" -> blocked', () => {
  const t = T(2, { rest1: 30 });
  assert.strictEqual(getTourneyEligibility(P([tg(D(1), '33')]), t, D(1), [t]).eligible, false);
});
test('X5 junk restTiers (strings, negative, huge, descending, array/object) never crash', () => {
  const p = P([tg(D(1), 33)]);
  const tiers = [null, 'x', 5, [], [30], ['30'], { rest1: -1 }, { rest1: 1e21 }, { rest1: 'abc' }, { rest1: 40, rest2: 30 },
    { rest1: Infinity }, { rest1: '1e3' }, { rest1: { a: 1 } }];
  for (const tr of tiers) {
    const t = T(2, tr);
    assert.doesNotThrow(() => getTourneyEligibility(p, t, D(1), [t]), JSON.stringify(tr));
    assert.doesNotThrow(() => getTourneyLimitViolation(p, t, D(1), 5, [t]), JSON.stringify(tr));
  }
  // array form works the same as object form
  const ta = T(2, [30]);
  assert.strictEqual(getTourneyEligibility(p, ta, D(1), [ta]).eligible, false);
});
test('X6 junk tournament config (no startDate, days 0/NaN/huge, missing history) never crashes', () => {
  const p = { id: 'j' };
  for (const extra of [{ startDate: '' }, { startDate: 'nope' }, { days: 0 }, { days: 'x' }, { days: 1e9 }, { dayLimits: null }]) {
    const t = T(2, { rest1: 30 }, extra);
    assert.doesNotThrow(() => getTourneyEligibility(p, t, D(1), [t]), JSON.stringify(extra));
    assert.doesNotThrow(() => getTourneyRestBlock(P([tg(D(1), 33)]), t, D(1)), JSON.stringify(extra));
  }
  assert.strictEqual(getTourneyRestBlock(P([]), null, D(1)), null);
  assert.strictEqual(getTourneyRestBlock(P([]), T(2, { rest1: 30 }), 'not-a-date'), null);
});
test('X7 malicious live game (huge counts, bad status) normalized; eligibility unaffected', () => {
  const t = T(2, { rest1: 30 });
  const lg = normalizeLiveGame(LG(D(1), { j: { pitches: 1e9, status: 'active', order: 0 }, k: { pitches: 5, status: 'evil' } }));
  assert.ok(lg);
  const b = getLivePitcherBudget(P([]), lg, [t]);
  assert.strictEqual(b.count, 999); assert.strictEqual(b.eligible, true);
  assert.ok(!lg.pitchers.k);
});
test('X8 reason text is plain text (tournament name/opponent never injected into reason)', () => {
  const t = T(2, { rest1: 30 }, { name: '<img src=x onerror=alert(1)>' });
  const e = getTourneyEligibility(P([tg(D(1), 33)]), t, D(1), [t]);
  assert.ok(!/<img/.test(e.reason), e.reason);
});

// ─────────────────────────────── Versioning ────────────────────────────────
test('V1 version v3.20 in meta tag, APP_VERSION and CLAUDE.md', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(/<meta name="app-version" content="v3\.20"\/>/.test(html));
  assert.ok(/const APP_VERSION = "v3\.20";/.test(html));
  assert.ok(/\*\*Current version:\*\* v3\.20/.test(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
