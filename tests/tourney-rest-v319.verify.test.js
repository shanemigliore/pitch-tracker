#!/usr/bin/env node
// Independent verification of v3.19: (A) tournament floor shown as "In Tourney",
// not rest; (B) optional per-tournament rest tiers between tournament days.
// Dependency-free. Run: node tests/tourney-rest-v319.verify.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const L = require('../lib/pitch-logic.js');
const {
  setCurrentRules, DEFAULT_RULES, getAvailabilityStatus, getTourneyAdjustedRestInfo, getRegularRestSummary,
  getRegularSeasonRestBlock, getTourneyRestTiers, getTourneyDayRestDays, describeTourneyOutDays,
  getTourneyRestBlock, getTourneyEligibility, getTourneyLimitViolation, getGameLogCheck,
  getLivePitcherBudget, getLiveMilestones, getLiveStatus, getTourneyDayRestSteps, getEligibleDateStr,
  liveGameToLogEntries, normalizeLiveGame,
} = L;

let passed = 0, failed = 0;
function test(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)); }
}
let seq = 0;
const tg = (date, pitches, tid = 'tx') => ({ gameId: 'v' + (seq++), date, pitches, opponent: 'X', isTournament: true,
  tournamentId: tid, tournamentName: 'T', tourneyDay: null, sharedGameId: null });
const rg = (date, pitches) => ({ gameId: 'v' + (seq++), date, pitches, opponent: 'X', isTournament: false,
  tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null });
const P = (history, id = 'w') => ({ id, name: 'Wyatt', jersey: '7', lastPitches: 0, lastGameDate: '', history });
const TX = (extra = {}) => ({ id: 'tx', name: '5 Tool - Texas 20', startDate: '2026-11-07', days: 2,
  dayLimits: [{ max: 30, isHard: false }, { max: 45, isHard: false }], maxTotal: 75, ...extra });
const T4 = (tiers, extra = {}) => ({ id: 'tx', name: 'Four Day', startDate: '2026-11-05', days: 4,
  dayLimits: [{ max: 50, isHard: false }, { max: 50, isHard: false }, { max: 50, isHard: false }, { max: 50, isHard: false }],
  maxTotal: 200, restTiers: tiers, ...extra });
const LG = (date, pitchers = {}, context = 'tx') => ({ id: 'g1', date, context, opponent: 'Y', startedAt: 0, startedBy: 'c', pitchers });
const inGame = n => ({ pitches: n, status: 'active', order: 0, enteredAt: 0, leftAt: null });

// ─────────────────────────── A. tournament hold ───────────────────────────
test('A1 Wyatt 15p Day1, viewed Nov 7 and Nov 8: status "tourney" (never resting2/soon)', () => {
  const p = P([tg('2026-11-07', 15)]);
  for (const d of ['2026-11-07', '2026-11-08']) assert.strictEqual(getAvailabilityStatus(p, d, [TX()]), 'tourney', d);
  assert.strictEqual(getAvailabilityStatus(p, '2026-11-09', [TX()]), 'available');
});
test('A2 summary: heldByTourney, restLeft 0, regular season from Nov 9, name present', () => {
  const s = getRegularRestSummary(P([tg('2026-11-07', 15)]), [TX()], '2026-11-07');
  assert.strictEqual(s.available, false); assert.strictEqual(s.heldByTourney, true);
  assert.strictEqual(s.restLeft, 0); assert.strictEqual(s.eligibleDate, '2026-11-09');
  assert.strictEqual(s.tourneyName, '5 Tool - Texas 20'); assert.strictEqual(s.tourneyEndDate, '2026-11-08');
});
test('A3 league floor kept: regular-season game on Nov 8 is a violation mentioning the tournament', () => {
  const r = getGameLogCheck(P([tg('2026-11-07', 15)]), { context: 'regular', tourney: null, date: '2026-11-08', count: 10, tournaments: [TX()] });
  assert.ok(r && r.level === 'violation', JSON.stringify(r));
  assert.ok(/5 Tool - Texas 20/.test(r.message) && /Nov 9/.test(r.message), r.message);
  assert.strictEqual(getGameLogCheck(P([tg('2026-11-07', 15)]), { context: 'regular', date: '2026-11-09', count: 10, tournaments: [TX()] }), null);
});
test('A4 real rest after tourney uses TOTAL, starts day after last outing (20+25=45 -> 2 days)', () => {
  const p = P([tg('2026-11-07', 20), tg('2026-11-08', 25)]);
  assert.strictEqual(getEligibleDateStr(p, [TX()]), '2026-11-11');
  const s = getRegularRestSummary(p, [TX()], '2026-11-08');
  assert.strictEqual(s.heldByTourney, false); assert.strictEqual(s.restLeft, 2);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-09').restLeft, 2);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-10').restLeft, 1);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-11').available, true);
  assert.notStrictEqual(getAvailabilityStatus(p, '2026-11-08', [TX()]), 'tourney');
});
test('A5 rest date exactly equal to floor is rest, not hold (25p Day1 of 2-day -> 1 day, eligible Nov 9)', () => {
  const p = P([tg('2026-11-07', 25)]);
  const info = getTourneyAdjustedRestInfo(p, [TX()]);
  assert.strictEqual(getEligibleDateStr(p, [TX()]), '2026-11-09');
  assert.strictEqual(info.heldByTourney, false);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-07').restLeft, 1);
});
test('A6 regular rest owed from a regular game is still rest even during a tourney floor (later rest wins)', () => {
  // regular 61p Nov 6 -> 3 rest days -> eligible Nov 10 > floor Nov 9 -> not a hold
  const p = P([rg('2026-11-06', 61), tg('2026-11-07', 10)]);
  assert.strictEqual(getEligibleDateStr(p, [TX()]), '2026-11-10');
  assert.strictEqual(getTourneyAdjustedRestInfo(p, [TX()]).heldByTourney, false);
  assert.strictEqual(getRegularRestSummary(p, [TX()], '2026-11-08').restLeft, 2);
});
test('A7 regular rest that ends before floor -> hold', () => {
  const p = P([rg('2026-11-04', 30), tg('2026-11-07', 5)]);
  assert.strictEqual(getTourneyAdjustedRestInfo(p, [TX()]).heldByTourney, true);
});
test('A8 plain regular-season rest: restLeft counts rest days, not off-by-one on game day', () => {
  const p = P([rg('2026-11-01', 45)]); // 2 days: Nov 2,3 -> eligible Nov 4
  assert.strictEqual(getRegularRestSummary(p, [], '2026-11-01').restLeft, 2);
  assert.strictEqual(getRegularRestSummary(p, [], '2026-11-02').restLeft, 2);
  assert.strictEqual(getRegularRestSummary(p, [], '2026-11-03').restLeft, 1);
  assert.strictEqual(getAvailabilityStatus(p, '2026-11-01', []), 'resting2');
});
test('A9 tournament missing from list (deleted) -> no crash, no tourney name', () => {
  const p = P([tg('2026-11-07', 15, 'gone')]);
  const s = getRegularRestSummary(p, [TX()], '2026-11-07');
  assert.strictEqual(typeof s.available, 'boolean');
  getAvailabilityStatus(p, '2026-11-07', [TX()]);
});
test('A10 tiers do not change regular-season rest after the tournament', () => {
  const p = P([tg('2026-11-07', 35), tg('2026-11-08', 10)]);
  const a = getEligibleDateStr(p, [TX()]), b = getEligibleDateStr(p, [TX({ restTiers: { rest1: 30, rest2: 0, rest3: 0 } })]);
  assert.strictEqual(a, b);
});

// ─────────────────────────── B. rest tiers parsing ───────────────────────────
test('B1 parse: object form, array form, numeric strings', () => {
  assert.deepStrictEqual(getTourneyRestTiers({ restTiers: { rest1: 30, rest2: 45, rest3: 60 } }), [30, 45, 60]);
  assert.deepStrictEqual(getTourneyRestTiers({ restTiers: [30, '45'] }), [30, 45]);
  assert.deepStrictEqual(getTourneyRestTiers({ restTiers: { rest1: '30', rest2: 0, rest3: 0 } }), [30]);
});
test('B2 parse: blank/missing/junk -> [] (existing tournaments unchanged)', () => {
  for (const v of [undefined, null, '', 'abc', 42, true, {}, [], { rest1: 0 }, { rest1: -5 }, { rest1: 'x' },
    { rest1: null, rest2: 40 }, { rest1: NaN }, { rest1: {} }, { rest1: [] }])
    assert.deepStrictEqual(getTourneyRestTiers({ restTiers: v }), [], JSON.stringify(v));
  assert.deepStrictEqual(getTourneyRestTiers(null), []);
  assert.deepStrictEqual(getTourneyRestTiers(undefined), []);
});
test('B3 parse: out-of-order stops reading (30, 20 -> [30]; 30,30 -> [30])', () => {
  assert.deepStrictEqual(getTourneyRestTiers({ restTiers: { rest1: 30, rest2: 20, rest3: 60 } }), [30]);
  assert.deepStrictEqual(getTourneyRestTiers({ restTiers: { rest1: 30, rest2: 30 } }), [30]);
});
test('B4 RTDB array-as-object {"0":..,"1":..} restTiers', () => {
  // Writes always use {rest1..}; an array written by a hostile/legacy client may come back keyed "0","1".
  const r = getTourneyRestTiers({ restTiers: { 0: 30, 1: 45 } });
  assert.ok(Array.isArray(r)); // documented: not interpreted, but must not throw
});
test('B5 strict >: exactly the threshold owes nothing', () => {
  const t = TX({ restTiers: { rest1: 30 } });
  assert.strictEqual(getTourneyDayRestDays(t, 30), 0);
  assert.strictEqual(getTourneyDayRestDays(t, 31), 1);
  assert.strictEqual(getTourneyDayRestDays(T4({ rest1: 20, rest2: 40, rest3: 60 }), 61), 3);
  assert.strictEqual(getTourneyDayRestDays(t, 'junk'), 0);
  assert.strictEqual(getTourneyDayRestDays(t, -100), 0);
});

// ─────────────────────────── B. eligibility ───────────────────────────
const TXR = () => TX({ restTiers: { rest1: 30, rest2: 0, rest3: 0 } });
test('B6 user example: >30 Day1 -> ineligible Day2 (code tourneyRest)', () => {
  const e = getTourneyEligibility(P([tg('2026-11-07', 31)]), TXR(), '2026-11-08', [TXR()]);
  assert.strictEqual(e.eligible, false); assert.strictEqual(e.code, 'tourneyRest');
  assert.ok(/31p on Day 1/.test(e.reason), e.reason);
});
test('B7 user example: exactly 30 Day1 -> eligible Day2 with 45 left (75-30)', () => {
  const e = getTourneyEligibility(P([tg('2026-11-07', 30)]), TXR(), '2026-11-08', [TXR()]);
  assert.strictEqual(e.eligible, true); assert.strictEqual(e.pitchesLeft, 45);
  const e2 = getTourneyEligibility(P([tg('2026-11-07', 12)]), TXR(), '2026-11-08', [TXR()]);
  assert.strictEqual(e2.pitchesLeft, 63);
});
test('B8 multiple games the same day are summed (20+15 on Day1 -> out Day2)', () => {
  const e = getTourneyEligibility(P([tg('2026-11-07', 20), tg('2026-11-07', 15)]), TXR(), '2026-11-08', [TXR()]);
  assert.strictEqual(e.eligible, false);
});
test('B9 Day1 itself unaffected by its own pitches (still eligible on Day1 under total)', () => {
  const e = getTourneyEligibility(P([tg('2026-11-07', 40)]), TXR(), '2026-11-07', [TXR()]);
  assert.strictEqual(e.eligible, true);
});
test('B10 applies from any day (4-day: >20 on Day 2 -> out Day 3, back Day 4)', () => {
  const t = T4({ rest1: 20, rest2: 40, rest3: 60 });
  const p = P([tg('2026-11-06', 25)]); // Day 2
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-07', [t]).eligible, false);
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-08', [t]).eligible, true);
});
test('B11 2-day tier: >40 Day1 -> out Days 2-3, back Day 4', () => {
  const t = T4({ rest1: 20, rest2: 40, rest3: 60 });
  const p = P([tg('2026-11-05', 41)]);
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-06', [t]).eligible, false);
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-07', [t]).eligible, false);
  const e4 = getTourneyEligibility(p, t, '2026-11-08', [t]);
  assert.strictEqual(e4.eligible, true, e4.reason);
  const b = getTourneyRestBlock(p, t, '2026-11-06');
  assert.strictEqual(b.eligibleDay, 4); assert.strictEqual(b.eligibleDate, '2026-11-08');
});
test('B12 rest running past the last day -> "out rest of tournament"', () => {
  const t = T4({ rest1: 20, rest2: 40, rest3: 60 });
  const e = getTourneyEligibility(P([tg('2026-11-07', 61)]), t, '2026-11-08', [t]); // Day3 61 -> 3 days
  assert.strictEqual(e.eligible, false); assert.ok(/rest of tournament/.test(e.reason), e.reason);
});
test('B13 the latest-ending block wins across days', () => {
  const t = T4({ rest1: 20, rest2: 40, rest3: 60 });
  const p = P([tg('2026-11-05', 45), tg('2026-11-06', 25)]); // D1 2 days (out D2,D3); D2 1 day (out D3)
  const b = getTourneyRestBlock(p, t, '2026-11-07');
  assert.strictEqual(b.lastOutDay, 3);
});
test('B14 no tiers -> no rest between days (pre-v3.19 behavior)', () => {
  const e = getTourneyEligibility(P([tg('2026-11-07', 50)]), TX(), '2026-11-08', [TX()]);
  assert.strictEqual(e.eligible, true); assert.strictEqual(e.pitchesLeft, 25);
});
test('B15 viewing a date before the start / after the end does not throw', () => {
  const t = TXR(); const p = P([tg('2026-11-07', 40)]);
  getTourneyEligibility(p, t, '2026-11-01', [t]);
  assert.strictEqual(getTourneyEligibility(p, t, '2026-11-20', [t]).code, 'ended');
  assert.strictEqual(getTourneyRestBlock(p, t, '2026-11-20'), null);
  assert.strictEqual(getTourneyRestBlock(p, t, 'garbage'), null);
});
test('B16 describeTourneyOutDays labels', () => {
  const t = T4({ rest1: 20 });
  assert.strictEqual(describeTourneyOutDays(t, 1, 1), 'Day 2');
  assert.strictEqual(describeTourneyOutDays(t, 1, 2), 'Days 2–3');
  assert.strictEqual(describeTourneyOutDays(t, 3, 3), 'Day 4');
  assert.strictEqual(describeTourneyOutDays(t, 4, 1), null);
  assert.strictEqual(describeTourneyOutDays(t, 1, 0), null);
});

// ─────────────────────────── B. save-time checks ───────────────────────────
test('B17 logging on a rest day -> violation (warn-and-override)', () => {
  const t = TXR();
  const r = getGameLogCheck(P([tg('2026-11-07', 31)]), { context: 'tx', tourney: t, date: '2026-11-08', count: 5, tournaments: [t] });
  assert.ok(r && r.level === 'violation' && /Rest day/.test(r.message), JSON.stringify(r));
});
test('B18 crossing a tier -> non-blocking note naming the day lost; exactly threshold -> no tier note', () => {
  const t = TXR();
  const r = getTourneyLimitViolation(P([]), t, '2026-11-07', 31, [t]);
  assert.ok(r && r.level === 'note' && /out Day 2/.test(r.message), JSON.stringify(r));
  const r2 = getTourneyLimitViolation(P([]), t, '2026-11-07', 30, [t]);
  assert.strictEqual(r2, null);
});
test('B19 crossing via second game of the day -> note; already crossed earlier -> no repeat tier note', () => {
  const t = TXR();
  const r = getTourneyLimitViolation(P([tg('2026-11-07', 25)]), t, '2026-11-07', 10, [t]);
  assert.ok(r && r.level === 'note' && /out Day 2/.test(r.message), JSON.stringify(r));
  const r2 = getTourneyLimitViolation(P([tg('2026-11-07', 35)]), t, '2026-11-07', 5, [t]);
  assert.ok(!r2 || !/out Day/.test(r2.message), JSON.stringify(r2));
});
test('B20 crossing a tier on the last day -> no in-tournament note', () => {
  const t = TXR();
  const r = getTourneyLimitViolation(P([]), t, '2026-11-08', 40, [t]);
  assert.ok(!r || !/out Day/.test(r.message), JSON.stringify(r));
});
test('B21 guideline note + tier note combined, still level note', () => {
  const t = TXR(); // day1 guideline 30 + tier 30
  const r = getTourneyLimitViolation(P([]), t, '2026-11-07', 33, [t]);
  assert.strictEqual(r.level, 'note'); assert.ok(/guideline/.test(r.message) && /out Day 2/.test(r.message), r.message);
});
test('B22 Live completion entries unaffected by tiers (all pitchers logged)', () => {
  const t = TXR();
  const lg = normalizeLiveGame(LG('2026-11-07', { w: inGame(35) }));
  const out = liveGameToLogEntries(lg, [t], 'sg');
  assert.strictEqual(out.entries.length, 1);
});

// ─────────────────────────── B. Live tab ───────────────────────────
test('B23 Live: rest-day pitcher not eligible with reason', () => {
  const t = TXR();
  const b = getLivePitcherBudget(P([tg('2026-11-07', 31)]), normalizeLiveGame(LG('2026-11-08')), [t]);
  assert.strictEqual(b.eligible, false); assert.ok(/Day 1/.test(b.reason), b.reason);
});
test('B24 Live: approaching a tier warns "Next pitch = out Day 2" at exactly the threshold', () => {
  const t = TXR();
  const b = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-07', { w: inGame(30) })), [t]);
  assert.ok(b.milestones.some(m => m.text === 'Next pitch = out Day 2'), JSON.stringify(b.milestones));
  assert.ok(b.status.next && /out Day 2/.test(b.status.next.text || b.status.next), JSON.stringify(b.status));
  const b2 = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-07', { w: inGame(26) })), [t]);
  assert.ok(b2.milestones.some(m => /5 pitches until out Day 2/.test(m.text)), JSON.stringify(b2.milestones));
  const b3 = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-07', { w: inGame(10) })), [t]);
  assert.ok(!b3.milestones.some(m => /out Day/.test(m.text)));
});
test('B25 Live: crossed -> status.dayOut = "Day 2", "Now out Day 2" milestone', () => {
  const t = TXR();
  const b = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-07', { w: inGame(31) })), [t]);
  assert.strictEqual(b.status.dayOut, 'Day 2');
  assert.ok(b.milestones.some(m => m.text === 'Now out Day 2'));
});
test('B26 Live: prior logged same-day pitches count toward the tier', () => {
  const t = TXR();
  const b = getLivePitcherBudget(P([tg('2026-11-07', 28)]), normalizeLiveGame(LG('2026-11-07', { w: inGame(3) })), [t]);
  assert.strictEqual(b.status.dayOut, 'Day 2');
});
test('B27 Live: ring tick for a tier below the day limit; last day has no tier steps', () => {
  const t = T4({ rest1: 20, rest2: 40, rest3: 60 });
  const b = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-05', { w: inGame(5) })), [t]);
  const day = b.rings.find(r => r.key === 'day');
  assert.deepStrictEqual(day.ticks, [20, 40]);
  assert.deepStrictEqual(getTourneyDayRestSteps(t, 4), []);
  const b4 = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-08', { w: inGame(20) })), [t]);
  assert.ok(!b4.milestones.some(m => /out Day/.test(m.text)));
  assert.strictEqual(b4.status.dayOut, null);
});
test('B28 Live: regular context untouched (no dayOut)', () => {
  const b = getLivePitcherBudget(P([]), normalizeLiveGame(LG('2026-11-10', { w: inGame(31) }, 'regular')), [TXR()]);
  assert.ok(!b.status.dayOut);
});
test('B29 getLiveMilestones/getLiveStatus tolerate junk dayRest', () => {
  for (const dr of [undefined, null, {}, { used: 'x' }, { steps: null }, { used: 5, steps: [] }]) {
    getLiveMilestones({ restUsed: 5, limits: [], restAfterTourney: true, dayRest: dr });
    getLiveStatus({ restUsed: 5, limits: [], restAfterTourney: true, dayRest: dr });
  }
});

// ─────────────────────────── stability / security ───────────────────────────
test('S1 hostile tournament fields do not throw anywhere in the pipeline', () => {
  const bad = [
    { id: 'tx', name: '<img src=x onerror=alert(1)>', startDate: '2026-11-07', days: 2, restTiers: { rest1: '1e3', rest2: [], rest3: { x: 1 } } },
    { id: 'tx', startDate: 'not-a-date', days: 'x', restTiers: 'hello' },
    { id: 'tx', startDate: '2026-11-07', days: -3, dayLimits: { 0: { max: 30, isHard: false } }, restTiers: [5, 1, 9] },
    { id: 'tx', startDate: '2026-11-07', days: 3, dayLimits: null, maxTotal: 'lots', restTiers: { rest1: 1e308 } },
    { id: 'tx', startDate: '2026-11-07', days: 14, restTiers: { rest1: 1, rest2: 2, rest3: 3 } },
  ];
  const p = P([tg('2026-11-07', 99), tg('2026-11-08', '7'), tg('bad', 5), { gameId: 'z', pitches: 'NaN', isTournament: true, tournamentId: 'tx' }]);
  for (const t of bad) {
    for (const d of ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-30', '']) {
      getTourneyEligibility(p, t, d, [t]);
      getTourneyLimitViolation(p, t, d, 5, [t]);
      getTourneyRestBlock(p, t, d);
      getAvailabilityStatus(p, d || null, [t]);
      getRegularRestSummary(p, [t], d || undefined);
      getRegularSeasonRestBlock(p, [t], d || '2026-11-08');
      const b = getLivePitcherBudget(p, normalizeLiveGame(LG(d || '2026-11-07', { w: inGame(30) })), [t]);
      assert.ok(b && typeof b.eligible === 'boolean');
    }
  }
});
test('S2 hostile tourney name is passed through as plain text in reasons (no HTML building)', () => {
  const t = TX({ name: '<b>x</b>' });
  const r = getRegularSeasonRestBlock(P([tg('2026-11-07', 15)]), [t], '2026-11-08');
  assert.ok(r.reason.includes('<b>x</b>')); // React renders as text; asserting no transformation/eval
  const t2 = TX({ name: { evil: true } });
  const r2 = getRegularSeasonRestBlock(P([tg('2026-11-07', 15)]), [t2], '2026-11-08');
  assert.strictEqual(typeof r2.reason, 'string');
});
test('S3 summary.tourneyName type when name is non-string (EligibilityScreen renders it as a JSX child)', () => {
  const s = getRegularRestSummary(P([tg('2026-11-07', 15)]), [TX({ name: { evil: true } })], '2026-11-07');
  // A non-string object here would crash React ("Objects are not valid as a React child").
  console.log('      note: tourneyName type =', typeof s.tourneyName);
});
test('S4 restTiers pitches-level junk on history (string pitches) still summed', () => {
  const t = TXR();
  const e = getTourneyEligibility(P([tg('2026-11-07', '31')]), t, '2026-11-08', [t]);
  assert.strictEqual(e.eligible, false);
});

// ─────────────────────────── version / wiring ───────────────────────────
test('V1 version v3.19 in both places in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/<meta name="app-version" content="v3\.19"\/>/.test(html));
  assert.ok(/const APP_VERSION = "v3\.19";/.test(html));
});
test('V2 every new global used by components is destructured in index.html', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const comps = fs.readdirSync(path.join(__dirname, '..', 'components')).map(f =>
    fs.readFileSync(path.join(__dirname, '..', 'components', f), 'utf8')).join('\n');
  for (const fn of Object.keys(L)) {
    if (new RegExp('\\b' + fn + '\\(').test(comps) && !/^[A-Z_]+$/.test(fn))
      assert.ok(new RegExp('\\b' + fn + '\\b').test(html.split('window.PitchLogic')[0] + html), fn);
  }
  for (const fn of ['getRegularRestSummary', 'getTourneyRestTiers']) assert.ok(html.includes(fn), fn);
});
test('V3 STATUS has a "tourney" entry with label In Tourney', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'ui-constants.js'), 'utf8');
  assert.ok(/tourney:\s*\{\s*label:"In Tourney"/.test(src));
});
test('V4 TournamentScreen validation logic (re-implemented from source expressions)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'TournamentScreen.js'), 'utf8');
  const m = src.match(/const tierNums = ([^;]+);\s*const tierError = ([\s\S]+?);\n/);
  assert.ok(m, 'tier validation found');
  const fn = new Function('restTiers', `const tierNums = ${m[1]}; return ${m[2]};`);
  assert.strictEqual(fn(['', '', '']), null);
  assert.strictEqual(fn(['30', '', '']), null);
  assert.strictEqual(fn(['30', '45', '60']), null);
  assert.ok(fn(['', '45', '']));
  assert.ok(fn(['30', '', '60']));
  assert.ok(fn(['30', '30', '']));
  assert.ok(fn(['30', '20', '']));
  assert.ok(fn(['0', '', '']));
  assert.ok(fn(['-5', '', '']));
  console.log('      note: "1e3" ->', JSON.stringify(fn(['1e3', '', ''])), '(parseInt reads 1)');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
