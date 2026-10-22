#!/usr/bin/env node
/**
 * Independent verification of the v3.12 Live-tab status box logic
 * (getLiveStatus and getLivePitcherBudget().status). Dependency-free.
 * Run with: node tests/live-status.verify.test.js
 */
'use strict';

const assert = require('assert');
const L = require('../lib/pitch-logic.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
  finally { L.setCurrentRules(null); }
}

const R10 = { maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 };
const R12 = { maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 };
const DATE = '2026-10-22';
const LEVELS = ['over', 'urgent', 'warn', 'soft', 'info', 'neutral'];

function pitcher(history) { return { id: 'p1', name: 'P', jersey: '7', lastPitches: 0, lastGameDate: '', history: history || [] }; }
function live(count, context, date) {
  return { id: 'g', date: date || DATE, context: context || 'regular', opponent: '',
    pitchers: { p1: { pitches: count, status: 'active', order: 0, enteredAt: 0, leftAt: null } } };
}
function wellFormed(st) {
  assert.ok(st && typeof st === 'object', 'status missing');
  const j = JSON.stringify(st);
  assert.ok(!/NaN|undefined|Infinity|null p|\[object/.test(j), 'bad text: ' + j);
  assert.ok([0, 1, 2, 3].includes(st.restDays), 'restDays ' + st.restDays);
  assert.ok(typeof st.next === 'string' && st.next.length > 0, 'next empty');
  assert.ok(st.alert === null || (typeof st.alert === 'string' && st.alert.length > 0), 'alert ' + st.alert);
  assert.ok(LEVELS.includes(st.level), 'level ' + st.level);
  assert.strictEqual(typeof st.justCrossed, 'boolean');
  assert.strictEqual(typeof st.restAfterTourney, 'boolean');
}
const reg = (n, hist) => L.getLivePitcherBudget(pitcher(hist), live(n), []).status;

const T = { id: 't1', name: 'Fall Classic', startDate: '2026-10-21', days: 3, maxTotal: 100,
  dayLimits: [{ max: 50, isHard: true }, { max: 40, isHard: false }, { max: 50, isHard: true }] };
const tEntry = (date, pitches, day) => ({ gameId: 'x' + date + pitches, date, pitches, opponent: 'B', isTournament: true,
  tournamentId: 't1', tournamentName: 'Fall Classic', tourneyDay: day, sharedGameId: null });
const tour = (n, hist, date) => L.getLivePitcherBudget(pitcher(hist), live(n, 't1', date), [T]).status;

// ── Regular season, 10U defaults ───────────────────────────────────────
test('10U: every count 0..70 well-formed, restDays monotonic, next non-empty', () => {
  L.setCurrentRules(R10);
  let prev = 0;
  for (let n = 0; n <= 70; n++) {
    const st = reg(n);
    wellFormed(st);
    assert.ok(st.restDays >= prev, `restDays dropped at ${n}`);
    prev = st.restDays;
    assert.strictEqual(st.restAfterTourney, false);
  }
});

test('10U: strict > thresholds (20 -> 0 days, 21 -> 1, 41 -> 2, 61 -> 3)', () => {
  L.setCurrentRules(R10);
  assert.deepStrictEqual([0, 20, 21, 40, 41, 60, 61].map(n => reg(n).restDays), [0, 0, 1, 1, 2, 2, 3]);
});

test('10U: far milestone always shown (0 -> rest1; 22 -> 19 pitches to 2 days at 41p)', () => {
  L.setCurrentRules(R10);
  assert.strictEqual(reg(0).next, '21 pitches → 1 rest day (at 21p)');
  assert.strictEqual(reg(22).next, '19 pitches → 2 rest days (at 41p)');
  assert.strictEqual(reg(0).level, 'neutral');
  assert.strictEqual(reg(0).alert, null);
});

test('10U: 20 -> "Next pitch = 1 rest day", urgent', () => {
  L.setCurrentRules(R10);
  const st = reg(20);
  assert.strictEqual(st.next, 'Next pitch = 1 rest day');
  assert.strictEqual(st.level, 'urgent');
});

test('10U: within 5 = warn (16..19), 15 = neutral', () => {
  L.setCurrentRules(R10);
  assert.strictEqual(reg(15).level, 'neutral');
  for (let n = 16; n <= 19; n++) assert.strictEqual(reg(n).level, 'warn', 'count ' + n);
});

test('10U: just crossed (21..23) = info + justCrossed, 24 = neutral', () => {
  L.setCurrentRules(R10);
  for (const n of [21, 22, 23]) { const s = reg(n); assert.ok(s.justCrossed, 'jc ' + n); assert.strictEqual(s.level, 'info', 'lvl ' + n); }
  assert.strictEqual(reg(24).justCrossed, false);
  assert.strictEqual(reg(24).level, 'neutral');
});

test('10U: daily max 55 nearer than rest3 61 -> limit wins', () => {
  L.setCurrentRules(R10);
  assert.strictEqual(reg(50).next, '5 pitches to daily max (55p)');
  assert.strictEqual(reg(50).level, 'warn');
  assert.strictEqual(reg(54).next, '1 pitch to daily max (55p)');
  assert.strictEqual(reg(54).level, 'urgent');
});

test('10U: at daily max 55 -> orange alert, next = rest3', () => {
  L.setCurrentRules(R10);
  const st = reg(55);
  assert.strictEqual(st.alert, 'At daily max · finish batter');
  assert.strictEqual(st.level, 'urgent');
  assert.strictEqual(st.next, '6 pitches → 3 rest days (at 61p)');
});

test('10U: over daily max -> red alert with overage, takes priority', () => {
  L.setCurrentRules(R10);
  const st = reg(58);
  assert.strictEqual(st.alert, 'Over daily max +3 · finish batter');
  assert.strictEqual(st.level, 'over');
  assert.strictEqual(reg(65).next, 'Max rest reached');
  assert.strictEqual(reg(65).level, 'over');
});

// ── 12U rules ───────────────────────────────────────────────────────────
test('12U: 0..90 well-formed; thresholds 25/45/65, max 75', () => {
  L.setCurrentRules(R12);
  let prev = 0;
  for (let n = 0; n <= 90; n++) { const st = reg(n); wellFormed(st); assert.ok(st.restDays >= prev); prev = st.restDays; }
  assert.deepStrictEqual([25, 26, 45, 46, 65, 66].map(n => reg(n).restDays), [0, 1, 1, 2, 2, 3]);
  assert.strictEqual(reg(25).next, 'Next pitch = 1 rest day');
  assert.strictEqual(reg(66).next, '9 pitches to daily max (75p)');
  assert.strictEqual(reg(75).alert, 'At daily max · finish batter');
  assert.strictEqual(reg(76).level, 'over');
});

test('Tie: rest step and limit equally far -> limit wins', () => {
  // maxPitches 61, rest3 60: at 56, rest3 step is 61-56=5 away, daily max 61-56=5 away.
  L.setCurrentRules({ maxPitches: 61, rest1: 20, rest2: 40, rest3: 60 });
  assert.strictEqual(reg(56).next, '5 pitches to daily max (61p)');
});

// ── Prior same-day pitches (doubleheader) ──────────────────────────────
test('Regular: prior pitches logged same day count toward status', () => {
  L.setCurrentRules(R10);
  const hist = [{ gameId: 'h1', date: DATE, pitches: 30, opponent: 'X', isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null }];
  const st = reg(10, hist);
  // used = 40 -> 1 rest day, next pitch = 2
  assert.strictEqual(st.restDays, 1);
  assert.strictEqual(st.next, 'Next pitch = 2 rest days');
  assert.strictEqual(reg(25, hist).alert, 'At daily max · finish batter');
});

test('Regular: ineligible (resting) pitcher gets reason alert, urgent', () => {
  L.setCurrentRules(R10);
  const hist = [{ gameId: 'h1', date: '2026-10-21', pitches: 45, opponent: 'X', isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null }];
  const st = reg(0, hist);
  wellFormed(st);
  assert.ok(/^Resting — eligible /.test(st.alert), st.alert);
  assert.strictEqual(st.level, 'urgent');
  // over-limit still wins over ineligibility
  assert.ok(/^Over daily max/.test(reg(60, hist).alert));
});

test('Regular: prior today at max -> at-limit alert outranks "reached earlier"', () => {
  L.setCurrentRules(R10);
  const hist = [{ gameId: 'h1', date: DATE, pitches: 55, opponent: 'X', isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null }];
  assert.strictEqual(reg(0, hist).alert, 'At daily max · finish batter');
});

// ── Tournaments ─────────────────────────────────────────────────────────
test('Tournament: every count 0..120 well-formed on each day', () => {
  L.setCurrentRules(R10);
  for (const date of ['2026-10-21', '2026-10-22', '2026-10-23']) {
    let prev = 0;
    for (let n = 0; n <= 120; n++) {
      const st = tour(n, [], date); wellFormed(st);
      assert.strictEqual(st.restAfterTourney, true);
      assert.ok(st.restDays >= prev); prev = st.restDays;
    }
  }
});

test('Tournament Day 1 hard limit 50: at / over alerts', () => {
  L.setCurrentRules(R10);
  assert.strictEqual(tour(50, [], '2026-10-21').alert, 'At Day 1 limit · finish batter');
  assert.strictEqual(tour(52, [], '2026-10-21').alert, 'Over Day 1 limit +2 · finish batter');
  assert.strictEqual(tour(52, [], '2026-10-21').level, 'over');
  assert.strictEqual(tour(46, [], '2026-10-21').next, '4 pitches to Day 1 limit (50p)');
});

test('Tournament rest text uses "p" (box is labelled TOURNEY REST)', () => {
  L.setCurrentRules(R10);
  assert.strictEqual(tour(0, [], '2026-10-21').next, '21 pitches → 1 rest day (at 21p)');
});

test('Tournament Day 2 guideline 40: soft near, soft alert at/over, never blocks', () => {
  L.setCurrentRules(R10);
  const h = [tEntry('2026-10-21', 10, 1)];
  // total = 10 + n; day = n.
  const near = tour(36, h, '2026-10-22');
  assert.strictEqual(near.next, '4 pitches to Day 2 guideline (40p)');
  assert.strictEqual(near.level, 'soft');
  const at = tour(40, h, '2026-10-22');
  assert.strictEqual(at.alert, 'At Day 2 guideline (40/40p)');
  assert.strictEqual(at.level, 'soft');
  const over = tour(44, h, '2026-10-22');
  assert.strictEqual(over.alert, 'Over Day 2 guideline (44/40p)');
  // At 41 the 61-total step is at 54 total -> far; the guideline shouldn't be "next" once reached.
  assert.ok(!/guideline/.test(over.next), over.next);
});

test('Tournament: guideline alert keeps warn color when a hard milestone is within 5', () => {
  L.setCurrentRules(R10);
  const h = [tEntry('2026-10-21', 50, 1)];
  // day 2: n=42 -> total 92, 8 to total; rest3 61 crossed. guideline over -> soft
  const st = tour(42, h, '2026-10-22');
  assert.strictEqual(st.level, 'soft');
  // n=46 -> total 96, 4 to tourney limit -> warn, alert = over guideline
  const st2 = tour(46, h, '2026-10-22');
  assert.ok(/guideline/.test(st2.alert));
  assert.strictEqual(st2.level, 'warn');
  assert.strictEqual(st2.next, '4 pitches to tourney limit (100p)');
});

test('Tournament: over tourney total -> red, outranks guideline', () => {
  L.setCurrentRules(R10);
  const h = [tEntry('2026-10-21', 50, 1)];
  const st = tour(53, h, '2026-10-22');
  assert.strictEqual(st.alert, 'Over tourney limit +3 · finish batter');
  assert.strictEqual(st.level, 'over');
  assert.strictEqual(st.restDays, 3);
  assert.strictEqual(st.next, 'Max rest reached');
});

test('Tournament: at tourney total exactly', () => {
  L.setCurrentRules(R10);
  const h = [tEntry('2026-10-21', 50, 1)];
  assert.strictEqual(tour(50, h, '2026-10-22').alert, 'At tourney limit · finish batter');
});

test('Tournament: ineligible due to pre-tournament rest shows reason', () => {
  L.setCurrentRules(R10);
  const h = [{ gameId: 'r', date: '2026-10-20', pitches: 50, opponent: 'X', isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null }];
  const st = tour(0, h, '2026-10-21');
  wellFormed(st);
  assert.ok(st.alert && st.alert.length > 0, 'no alert');
  assert.strictEqual(st.level, 'urgent');
});

test('Tournament not found / date outside -> reason alert, well-formed', () => {
  L.setCurrentRules(R10);
  const a = L.getLivePitcherBudget(pitcher(), live(5, 'nope'), [T]).status;
  wellFormed(a); assert.strictEqual(a.alert, 'Tournament not found');
  const b = L.getLivePitcherBudget(pitcher(), live(5, 't1', '2026-11-30'), [T]).status;
  wellFormed(b); assert.strictEqual(b.alert, 'Game date is outside this tournament');
});

// ── Junk input ─────────────────────────────────────────────────────────
test('Junk: getLiveStatus with garbage never throws / NaN', () => {
  L.setCurrentRules(R10);
  const junk = [{}, { restUsed: 'abc' }, { restUsed: NaN }, { restUsed: -5 }, { restUsed: 1e9 },
    { restUsed: 10, limits: null }, { restUsed: 10, limits: [{}, { max: 'x', used: 3 }, { max: 50, used: NaN }, { max: -1, used: 0 }, null].filter(Boolean) },
    { restUsed: 10, limits: [{ max: 50, used: Infinity, label: 'x' }] },
    { restUsed: 10, eligible: false }, { restUsed: 10, eligible: false, reason: '' }];
  for (const j of junk) wellFormed(L.getLiveStatus(j));
});

test('Junk: malformed team rules (string rest1) still well-formed', () => {
  L.setCurrentRules({ maxPitches: 55, rest1: 'x' });
  for (let n = 0; n <= 70; n += 7) wellFormed(reg(n));
});

test('Junk: malformed tournament config still well-formed', () => {
  L.setCurrentRules(R10);
  const bad = { id: 't1', name: 'bad', startDate: DATE, days: 2, dayLimits: { 0: 'junk', 1: null }, maxTotal: -10 };
  for (const n of [0, 5, 999]) wellFormed(L.getLivePitcherBudget(pitcher(), live(n, 't1'), [bad]).status);
});

test('Junk: huge/negative/string live counts clamp', () => {
  L.setCurrentRules(R10);
  for (const c of ['abc', -20, 1e9, null, 3.7]) wellFormed(L.getLivePitcherBudget(pitcher(), live(c), []).status);
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
process.exit(failed ? 1 : 0);
