#!/usr/bin/env node
/**
 * Dependency-free logic tests for the rest-day / pitch-eligibility engine.
 * Run with: node tests/logic.test.js
 *
 * The engine lives in lib/pitch-logic.js, a small UMD module with no DOM/React/
 * Firebase dependency, loaded by index.html via <script src="lib/pitch-logic.js">
 * in the browser and required directly here - no HTML parsing or eval tricks
 * needed.
 */

'use strict';

const assert = require('assert');
const logic = require('../lib/pitch-logic.js');

// ── Minimal test harness ────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`FAIL  ${name}`);
    console.log(`      ${e.message}`);
  }
}

function makeEntry(overrides) {
  return Object.assign(
    {
      gameId: 'g_' + Math.random().toString(36).slice(2),
      date: '2026-07-20',
      pitches: 0,
      opponent: null,
      isTournament: false,
      tournamentId: null,
      tournamentName: null,
      tourneyDay: null,
      sharedGameId: null,
    },
    overrides
  );
}

console.log('Loaded from lib/pitch-logic.js:', Object.keys(logic).join(', '));
console.log('');

// ── 1. Bug #3: doubleheader aggregation (recomputeLast) ────────────────────
// Desired/correct behavior: two entries on the same date should have their
// pitches SUMMED (30 + 25 = 55). Written as the CORRECT assertion - expected
// to currently FAIL against the unfixed index.html, which is the proof the
// bug is real.

test('1a. [BUG #3] recomputeLast sums same-day doubleheader pitches (order: 30 then 25 -> 55)', () => {
  const history = [
    makeEntry({ gameId: 'g1', date: '2026-07-20', pitches: 30 }),
    makeEntry({ gameId: 'g2', date: '2026-07-20', pitches: 25 }),
  ];
  const result = logic.recomputeLast(history);
  assert.strictEqual(
    result.lastPitches,
    55,
    `expected lastPitches to be 55 (30+25 summed for a same-day doubleheader), got ${result.lastPitches}`
  );
});

test('1b. [BUG #3] recomputeLast sums same-day doubleheader pitches (order: 25 then 30 -> 55)', () => {
  const history = [
    makeEntry({ gameId: 'g1', date: '2026-07-20', pitches: 25 }),
    makeEntry({ gameId: 'g2', date: '2026-07-20', pitches: 30 }),
  ];
  const result = logic.recomputeLast(history);
  assert.strictEqual(
    result.lastPitches,
    55,
    `expected lastPitches to be 55 (30+25 summed for a same-day doubleheader), got ${result.lastPitches}`
  );
});

// ── 2. Sanity: single game day ──────────────────────────────────────────────

test('2. recomputeLast: single history entry returns that entry\'s pitches/date', () => {
  const history = [makeEntry({ gameId: 'g1', date: '2026-07-20', pitches: 42 })];
  const result = logic.recomputeLast(history);
  assert.strictEqual(result.lastPitches, 42);
  assert.strictEqual(result.lastGameDate, '2026-07-20');
});

// ── 3. Different-date entries: latest date wins ─────────────────────────────

test('3a. recomputeLast: different dates, latest date wins (array order: early then late)', () => {
  const history = [
    makeEntry({ gameId: 'g1', date: '2026-07-18', pitches: 50 }),
    makeEntry({ gameId: 'g2', date: '2026-07-20', pitches: 10 }),
  ];
  const result = logic.recomputeLast(history);
  assert.strictEqual(result.lastGameDate, '2026-07-20');
  assert.strictEqual(result.lastPitches, 10);
});

test('3b. recomputeLast: different dates, latest date wins (array order: late then early)', () => {
  const history = [
    makeEntry({ gameId: 'g2', date: '2026-07-20', pitches: 10 }),
    makeEntry({ gameId: 'g1', date: '2026-07-18', pitches: 50 }),
  ];
  const result = logic.recomputeLast(history);
  assert.strictEqual(result.lastGameDate, '2026-07-20');
  assert.strictEqual(result.lastPitches, 10);
});

// ── 4. getRegRestDays threshold boundaries against DEFAULT_RULES ───────────
// DEFAULT_RULES = { maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 }

logic.setCurrentRules(logic.DEFAULT_RULES);

const restDayCases = [
  [20, 0],
  [21, 1],
  [40, 1],
  [41, 2],
  [60, 2],
  [61, 3],
];

for (const [pitches, expectedDays] of restDayCases) {
  test(`4. getRegRestDays(${pitches}) === ${expectedDays}`, () => {
    const result = logic.getRegRestDays(pitches);
    assert.strictEqual(
      result,
      expectedDays,
      `expected getRegRestDays(${pitches}) to be ${expectedDays}, got ${result}`
    );
  });
}

// ── 5. Bug #4: mid-tournament rest computation ──────────────────────────────
// Desired/correct behavior: a pitcher whose only game so far is Day 1 of a
// still-in-progress 3-day tournament should NOT have rest computed off the
// cumulative-tournament-total branch (info.isTourney should be false, falling
// back to plain day-based rest) until the tournament has actually ended.
// Written as the CORRECT assertion - expected to currently FAIL, which is
// the proof the bug is real.

test('5. [BUG #4] getTourneyAdjustedRestInfo: in-progress tournament (day 1 of 3) should not use tournament-total branch', () => {
  const today = logic.todayStr();
  const pitcher = {
    id: 'p1',
    name: 'Test Pitcher',
    jersey: '1',
    lastPitches: 45,
    lastGameDate: today,
    history: [
      makeEntry({
        gameId: 'g1',
        date: today,
        pitches: 45,
        isTournament: true,
        tournamentId: 't1',
        tournamentName: 'Test Tourney',
        tourneyDay: 1,
      }),
    ],
  };
  const tournaments = [
    { id: 't1', name: 'Test Tourney', startDate: today, days: 3, day1IsHardLimit: false },
  ];

  const info = logic.getTourneyAdjustedRestInfo(pitcher, tournaments);
  assert.strictEqual(
    info.isTourney,
    false,
    `expected info.isTourney to be false for a tournament that hasn't ended yet (day 1 of 3), got ${info.isTourney}` +
      ` (info=${JSON.stringify(info)})`
  );
});

// ── 5b. Post-tournament recovery: cumulative-total branch still applies
// once the tournament has actually ended ───────────────────────────────────

test('5b. getTourneyAdjustedRestInfo: after tournament ends, uses cumulative-total branch', () => {
  const today = logic.todayStr();
  // Tournament ran for 3 days starting 10 days ago -> long over by today.
  const startDate = logic.addDays(today, -10);
  const lastPitchDate = logic.addDays(startDate, 2); // day 3 of the tournament
  const pitcher = {
    id: 'p1',
    name: 'Test Pitcher',
    jersey: '1',
    lastPitches: 45,
    lastGameDate: lastPitchDate,
    history: [
      makeEntry({ gameId: 'g1', date: startDate, pitches: 20, isTournament: true, tournamentId: 't1', tourneyDay: 1 }),
      makeEntry({ gameId: 'g2', date: lastPitchDate, pitches: 25, isTournament: true, tournamentId: 't1', tourneyDay: 3 }),
    ],
  };
  const tournaments = [{ id: 't1', name: 'Test Tourney', startDate, days: 3, day1IsHardLimit: false }];

  const info = logic.getTourneyAdjustedRestInfo(pitcher, tournaments);
  assert.strictEqual(info.isTourney, true, `expected isTourney true once tournament has ended, got ${JSON.stringify(info)}`);
  assert.strictEqual(info.totalPitches, 45, `expected cumulative tournament total of 45 (20+25), got ${info.totalPitches}`);
});

// ── 5c. getActiveTourney: picks the tournament covering a given date ───────

test('5c. getActiveTourney: finds the tournament covering a date inside its range', () => {
  const start = '2026-07-10';
  const tournaments = [{ id: 't1', name: 'T1', startDate: start, days: 3 }];
  const active = logic.getActiveTourney(tournaments, '2026-07-11'); // day 2 of 3
  assert.ok(active && active.id === 't1', `expected to find t1 for a date inside its range, got ${JSON.stringify(active)}`);
});

test('5d. getActiveTourney: returns nothing for a date outside any tournament range', () => {
  const start = '2026-07-10';
  const tournaments = [{ id: 't1', name: 'T1', startDate: start, days: 3 }]; // covers 07-10..07-12
  const active = logic.getActiveTourney(tournaments, '2026-07-13');
  assert.strictEqual(active, undefined, `expected no active tournament for a date after it ended, got ${JSON.stringify(active)}`);
});

// ── 6. getEligibleDate null guards ──────────────────────────────────────────

test('6a. getEligibleDate: empty date string returns null', () => {
  const result = logic.getEligibleDate('', 30, logic.getRegRestDays);
  assert.strictEqual(result, null);
});

test('6b. getEligibleDate: invalid date string returns null', () => {
  const result = logic.getEligibleDate('not-a-date', 30, logic.getRegRestDays);
  assert.strictEqual(result, null);
});

// ── Summary ──────────────────────────────────────────────────────────────

console.log('');
console.log(`${passed} passed, ${failed} failed (${passed + failed} total)`);

if (failed > 0) {
  console.log('');
  console.log('Failed tests:');
  for (const f of failures) {
    console.log(`  - ${f.name}`);
  }
}

process.exitCode = failed > 0 ? 1 : 0;
