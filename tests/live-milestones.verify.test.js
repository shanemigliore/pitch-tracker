#!/usr/bin/env node
/**
 * Independent verification of the v3.11 Live-tab rings / tick marks / milestone
 * warnings (getLivePitcherBudget().rings/.milestones, getLiveMilestones,
 * getRestTicks). Dependency-free. Run with: node tests/live-milestones.verify.test.js
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

function pitcher(history) { return { id: 'p1', name: 'P', jersey: '7', lastPitches: 0, lastGameDate: '', history: history || [] }; }
function live(count, context, date) {
  return { id: 'g', date: date || DATE, context: context || 'regular', opponent: '',
    pitchers: { p1: { pitches: count, status: 'active', order: 0, enteredAt: 0, leftAt: null } } };
}
function txt(b) { return b.milestones.map(m => m.text); }
function noNaN(b) {
  const s = JSON.stringify(b);
  assert.ok(!/NaN|undefined|Infinity/.test(b.milestones.map(m => m.text).join('|') + b.rings.map(r => r.label).join('|')), 'NaN/undefined in text: ' + s);
  b.rings.forEach(r => { assert.ok(Number.isFinite(r.value), 'ring value ' + r.value); assert.ok(Number.isFinite(r.max) && r.max > 0, 'ring max ' + r.max); });
}
const reg = (count, hist) => L.getLivePitcherBudget(pitcher(hist), live(count), []);

// ── Regular season, 10U defaults ────────────────────────────────────────
test('10U: 15 -> nothing; 16 -> 5 until 1 rest day', () => {
  L.setCurrentRules(R10);
  assert.deepStrictEqual(txt(reg(15)), []);
  const m = reg(16).milestones;
  assert.strictEqual(m.length, 1);
  assert.strictEqual(m[0].kind, 'rest'); assert.strictEqual(m[0].pitchesUntil, 5); assert.strictEqual(m[0].level, 'warn');
  assert.ok(/5 pitches until 1 rest day/.test(m[0].text));
});
test('10U: 17..19 warn count down, 20 -> "Next pitch = 1 rest day" urgent', () => {
  L.setCurrentRules(R10);
  [17, 18, 19].forEach(n => assert.strictEqual(reg(n).milestones[0].pitchesUntil, 21 - n));
  const m = reg(20).milestones;
  assert.strictEqual(m[0].text, 'Next pitch = 1 rest day'); assert.strictEqual(m[0].level, 'urgent');
});
test('10U: 21,22,23 -> "Now 1 rest day"; 24 -> nothing', () => {
  L.setCurrentRules(R10);
  [21, 22, 23].forEach(n => assert.deepStrictEqual(txt(reg(n)), ['Now 1 rest day'], 'at ' + n));
  assert.deepStrictEqual(txt(reg(24)), []);
});
test('10U: 50 -> 5 to daily max; 52 -> 3; 54 -> 1 urgent; 55 -> At ... finish batter', () => {
  L.setCurrentRules(R10);
  assert.deepStrictEqual(txt(reg(49)), []);
  assert.deepStrictEqual(txt(reg(50)), ['5 pitches to daily max (55p)']);
  assert.deepStrictEqual(txt(reg(52)), ['3 pitches to daily max (55p)']);
  const m54 = reg(54).milestones; assert.strictEqual(m54[0].text, '1 pitch to daily max (55p)'); assert.strictEqual(m54[0].level, 'urgent');
  assert.deepStrictEqual(txt(reg(55)), ['At daily max (55p) — finish batter only']);
});
test('10U: past max, rest3=60 still warns (56..60), crossed 61..63', () => {
  L.setCurrentRules(R10);
  assert.deepStrictEqual(txt(reg(56)), ['5 pitches until 3 rest days (at 61p)']);
  assert.deepStrictEqual(txt(reg(58)), ['3 pitches until 3 rest days (at 61p)']);
  assert.deepStrictEqual(txt(reg(60)), ['Next pitch = 3 rest days']);
  assert.deepStrictEqual(txt(reg(61)), ['Now 3 rest days']);
  assert.deepStrictEqual(txt(reg(64)), []);
});
test('10U: ring = today used vs max, ticks at 20,40 (60 >= max excluded)', () => {
  L.setCurrentRules(R10);
  const b = reg(18);
  assert.strictEqual(b.rings.length, 1);
  assert.strictEqual(b.rings[0].label, 'TODAY');
  assert.strictEqual(b.rings[0].value, 18); assert.strictEqual(b.rings[0].max, 55);
  assert.deepStrictEqual(b.rings[0].ticks, [20, 40]);
  assert.strictEqual(b.pitchesLeft, 37);
});
test('regular: pitches logged earlier today count toward ring + milestones (doubleheader)', () => {
  L.setCurrentRules(R10);
  const hist = [{ gameId: 'a', date: DATE, pitches: 12, isTournament: false }];
  const b = reg(6, hist);
  assert.strictEqual(b.rings[0].value, 18);
  assert.deepStrictEqual(txt(b), ['3 pitches until 1 rest day (at 21p)']);
  // Logged on a different day does not count today
  assert.strictEqual(reg(6, [{ gameId: 'b', date: '2026-10-10', pitches: 12, isTournament: false }]).rings[0].value, 6);
});
test('regular: limit + rest both in window -> sorted most urgent first', () => {
  L.setCurrentRules({ maxPitches: 22, rest1: 20, rest2: 40, rest3: 60 });
  const m = reg(18).milestones; // 3 until rest (at 21), 4 to max (22)
  assert.deepStrictEqual(m.map(x => x.kind), ['rest', 'limit']);
  const m2 = reg(20).milestones; // next pitch rest (1), 2 to max
  assert.strictEqual(m2[0].text, 'Next pitch = 1 rest day');
  // tie: limit first
  L.setCurrentRules({ maxPitches: 21, rest1: 20, rest2: 40, rest3: 60 });
  assert.deepStrictEqual(reg(20).milestones.map(x => x.kind), ['limit', 'rest']);
});

// ── 12U rules ───────────────────────────────────────────────────────────
test('12U: 21 none, 21..25 warn for rest1=25, 26..28 crossed, 70..74 limit, 75 At, 61..65 rest3', () => {
  L.setCurrentRules(R12);
  assert.deepStrictEqual(txt(reg(20)), []);
  assert.deepStrictEqual(txt(reg(21)), ['5 pitches until 1 rest day (at 26p)']);
  assert.deepStrictEqual(txt(reg(25)), ['Next pitch = 1 rest day']);
  assert.deepStrictEqual(txt(reg(28)), ['Now 1 rest day']);
  assert.deepStrictEqual(txt(reg(29)), []);
  assert.deepStrictEqual(txt(reg(65)), ['Next pitch = 3 rest days']);
  assert.deepStrictEqual(txt(reg(70)), ['5 pitches to daily max (75p)']);
  assert.deepStrictEqual(txt(reg(75)), ['At daily max (75p) — finish batter only']);
  assert.deepStrictEqual(reg(1).rings[0].ticks, [25, 45, 65]);
});

// ── Tournament ──────────────────────────────────────────────────────────
const T = { id: 't1', name: 'Fall Classic', startDate: '2026-10-22', days: 3, maxTotal: 100,
  dayLimits: [{ max: 50, isHard: true }, { max: 40, isHard: false }, { max: 50, isHard: true }] };
const tb = (count, hist, date, t) => L.getLivePitcherBudget(pitcher(hist), live(count, 't1', date || DATE), [t || T]);
const tEntry = (date, pitches) => ({ gameId: 'x' + date, date, pitches, isTournament: true, tournamentId: 't1', tournamentName: 'Fall Classic', tourneyDay: null, sharedGameId: null });

test('tournament: two rings DAY N + TOURNEY, ticks only on TOURNEY', () => {
  L.setCurrentRules(R10);
  const b = tb(10);
  assert.deepStrictEqual(b.rings.map(r => r.label), ['DAY 1', 'TOURNEY']);
  assert.deepStrictEqual(b.rings.map(r => r.max), [50, 100]);
  assert.deepStrictEqual(b.rings[0].ticks, []);
  assert.deepStrictEqual(b.rings[1].ticks, [20, 40, 60]);
  assert.strictEqual(b.rings[0].guideline, false);
});
test('tournament: hard day limit 45 -> 5 to Day 1 limit; 50 -> At Day 1 limit', () => {
  L.setCurrentRules(R10);
  assert.ok(txt(tb(45)).includes('5 pitches to Day 1 limit (50p)'));
  assert.strictEqual(tb(50).milestones[0].text, 'At Day 1 limit (50p) — finish batter only');
});
test('tournament: rest steps worded "after tourney" and use total', () => {
  L.setCurrentRules(R10);
  assert.deepStrictEqual(txt(tb(20)), ['Next pitch = 1 rest day after tourney']);
  assert.deepStrictEqual(txt(tb(16)), ['5 pitches until 1 rest day after tourney (at 21p total)']);
  assert.deepStrictEqual(txt(tb(22)), ['Now 1 rest day after tourney']);
});
test('tournament: prior-day pitches count toward TOURNEY ring, not DAY ring', () => {
  L.setCurrentRules(R10);
  const hist = [tEntry('2026-10-22', 30)];
  const b = tb(8, hist, '2026-10-23'); // Day 2 guideline
  assert.deepStrictEqual(b.rings.map(r => r.value), [8, 38]);
  assert.strictEqual(b.rings[0].guideline, true);
  assert.deepStrictEqual(txt(b), ['3 pitches until 2 rest days after tourney (at 41p total)']);
});
test('tournament: guideline day warns soft and never "At ..."', () => {
  L.setCurrentRules(R10);
  const near = tb(36, [], '2026-10-23').milestones.filter(m => m.kind === 'limit');
  assert.strictEqual(near.length, 1); assert.strictEqual(near[0].level, 'soft');
  assert.ok(!txt(tb(40, [], '2026-10-23')).some(t => t.startsWith('At Day')));
  assert.ok(!txt(tb(40, [], '2026-10-23')).some(t => /guideline/.test(t)));
});
test('tournament: total cap 100 warnings from 95, At at 100', () => {
  L.setCurrentRules(R10);
  const hist = [tEntry('2026-10-22', 50), tEntry('2026-10-23', 40)];
  assert.ok(txt(tb(5, hist, '2026-10-24')).includes('5 pitches to tourney limit (100p)'));
  assert.ok(txt(tb(10, hist, '2026-10-24')).includes('At tourney limit (100p) — finish batter only'));
  assert.strictEqual(tb(10, hist, '2026-10-24').rings[1].value, 100);
});
test('tournament: legacy shape (maxDay1/day1IsHardLimit) works', () => {
  L.setCurrentRules(R10);
  const legacy = { id: 't1', name: 'Old', startDate: '2026-10-22', days: 2, maxTotal: 100, maxDay1: 50, day1IsHardLimit: true };
  const b = tb(47, [], '2026-10-23', legacy);
  assert.deepStrictEqual(b.rings.map(r => r.label), ['DAY 2', 'TOURNEY']);
  assert.strictEqual(b.rings[0].guideline, true);
  noNaN(b);
});
test('tournament: date outside / missing tourney -> one fallback ring, no milestones', () => {
  L.setCurrentRules(R10);
  const b = tb(30, [], '2026-11-30');
  assert.strictEqual(b.rings.length, 1); assert.deepStrictEqual(b.milestones, []); noNaN(b);
  const b2 = L.getLivePitcherBudget(pitcher(), live(30, 'nope'), []);
  assert.strictEqual(b2.rings.length, 1); noNaN(b2);
  const b3 = L.getLivePitcherBudget(pitcher(), live(0, 'nope'), []);
  assert.ok(b3.rings[0].max >= 1); noNaN(b3);
});

// ── Stability ───────────────────────────────────────────────────────────
test('counts 0 and 999 (regular + tournament) - no throws, no NaN', () => {
  L.setCurrentRules(R10);
  [0, 999, -5, 'abc', null, 1e9, NaN].forEach(c => {
    const b = reg(c); noNaN(b);
    const t = tb(c); noNaN(t);
  });
  assert.deepStrictEqual(txt(reg(0)), []);
  assert.deepStrictEqual(txt(reg(999)), []);
});
test('malformed rules: missing rest keys, null, strings, zero -> no throw, no NaN text', () => {
  [{ maxPitches: 55 }, null, undefined, {}, { maxPitches: 55, rest1: 'x', rest2: null, rest3: NaN },
   { maxPitches: 55, rest1: -1, rest2: 0, rest3: Infinity }, { maxPitches: 0 }].forEach(r => {
    L.setCurrentRules(r);
    [0, 18, 20, 55, 999].forEach(c => { noNaN(reg(c)); noNaN(tb(c)); });
  });
});
test('malformed tournament limits: dayLimits as object, junk entries, bad maxTotal', () => {
  L.setCurrentRules(R10);
  const objT = { ...T, dayLimits: { 0: { max: 30, isHard: true }, 1: 'junk', 2: null } };
  const b = tb(28, [], DATE, objT);
  assert.strictEqual(b.rings[0].max, 30);
  assert.ok(txt(b).includes('2 pitches to Day 1 limit (30p)'));
  noNaN(tb(5, [], '2026-10-23', objT));
  [{ ...T, maxTotal: 'abc' }, { ...T, maxTotal: -10 }, { ...T, dayLimits: 'x' }, { ...T, days: 'x' }, { ...T, dayLimits: [{ max: -3 }] }]
    .forEach(t => { noNaN(tb(10, [], DATE, t)); });
});
test('malformed liveGame / history: no throws', () => {
  L.setCurrentRules(R10);
  const lgs = [null, {}, { pitchers: null }, { date: 'garbage', context: 'regular', pitchers: { p1: { pitches: 'x', status: 'active' } } },
    { context: 't1', pitchers: { p1: {} } }];
  lgs.forEach(lg => { const b = L.getLivePitcherBudget(pitcher([{ date: DATE, pitches: 'zz' }, null].filter(Boolean)), lg, [T]); noNaN(b); });
});
test('getLiveMilestones direct: limits undefined, used NaN, label safe', () => {
  L.setCurrentRules(R10);
  assert.doesNotThrow(() => L.getLiveMilestones({ restUsed: 18 }));
  assert.doesNotThrow(() => L.getLiveMilestones({ restUsed: NaN, limits: [{ label: 'x', used: NaN, max: 10 }] }));
  const m = L.getLiveMilestones({ restUsed: NaN, limits: [{ label: 'x', used: NaN, max: 10 }] });
  assert.ok(!m.some(x => /NaN/.test(x.text)));
});
test('getRestTicks excludes steps >= max and non-positive', () => {
  L.setCurrentRules(R10);
  assert.deepStrictEqual(L.getRestTicks(55), [20, 40]);
  assert.deepStrictEqual(L.getRestTicks(60), [20, 40]);
  assert.deepStrictEqual(L.getRestTicks(61), [20, 40, 60]);
  assert.deepStrictEqual(L.getRestTicks(10), []);
  assert.deepStrictEqual(L.getRestTicks(NaN), []);
});
test('milestone texts are unique per budget (used as React keys)', () => {
  L.setCurrentRules({ maxPitches: 20, rest1: 20, rest2: 20, rest3: 20 });
  [15, 18, 20, 21].forEach(c => {
    const t = txt(reg(c)); assert.strictEqual(new Set(t).size, t.length, JSON.stringify(t));
  });
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
process.exit(failed ? 1 : 0);
