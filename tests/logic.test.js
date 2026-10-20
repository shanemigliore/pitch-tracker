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

// ── 5. In-progress tournament: regular-season rest uses the running
// tournament total (CPYL), and can't end before the day after the tournament.
// (Replaces the pre-v3.7 behavior, which fell back to day-based rest until the
// tournament ended.)

test('5. getTourneyAdjustedRestInfo: in-progress tournament uses running total, clamped past tournament end', () => {
  const today = logic.todayStr();
  const pitcher = {
    id: 'p1', name: 'Test Pitcher', jersey: '1', lastPitches: 45, lastGameDate: today,
    history: [makeEntry({ gameId: 'g1', date: today, pitches: 45, isTournament: true,
      tournamentId: 't1', tournamentName: 'Test Tourney', tourneyDay: 1 })],
  };
  const tournaments = [{ id: 't1', name: 'Test Tourney', startDate: today, days: 3 }];
  const info = logic.getTourneyAdjustedRestInfo(pitcher, tournaments);
  assert.strictEqual(info.isTourney, true);
  // 45 -> 2 rest days -> today+3, which is the day after the 3-day tournament ends anyway.
  assert.strictEqual(logic.getEligibleDateStr(pitcher, tournaments), logic.addDays(today, 3));
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

// ── 7. getEligibleDateStr returns a plain local date, not a UTC instant ────

test('7. getEligibleDateStr returns a plain YYYY-MM-DD string (no UTC round-trip)', () => {
  const pitcher = { id: 'p1', name: 'Test', jersey: '1', lastPitches: 45, lastGameDate: '2026-07-20', history: [] };
  const result = logic.getEligibleDateStr(pitcher, []);
  assert.ok(
    /^\d{4}-\d{2}-\d{2}$/.test(result),
    `expected a plain YYYY-MM-DD string with no time/UTC component, got ${JSON.stringify(result)}`
  );
});

// ── 8. Season helpers ───────────────────────────────────────────────────────

test('8a. getSeasonName formats term + year', () => {
  assert.strictEqual(logic.getSeasonName({ term: 'Spring', year: 2026 }), 'Spring 2026');
});

test('8b. getSeasonName returns empty string for missing season', () => {
  assert.strictEqual(logic.getSeasonName(null), '');
});

test('8c. compareSeasonsDesc: later year sorts before earlier year', () => {
  const seasons = [
    { term: 'Spring', year: 2026 },
    { term: 'Fall', year: 2026 },
    { term: 'Spring', year: 2027 },
  ];
  const sorted = [...seasons].sort(logic.compareSeasonsDesc);
  assert.deepStrictEqual(
    sorted.map(logic.getSeasonName),
    ['Spring 2027', 'Fall 2026', 'Spring 2026'],
    `expected newest-first order, got ${JSON.stringify(sorted.map(logic.getSeasonName))}`
  );
});

test('8d. compareSeasonsDesc: within same year, later term sorts first', () => {
  const seasons = [
    { term: 'Winter', year: 2026 },
    { term: 'Summer', year: 2026 },
    { term: 'Fall', year: 2026 },
    { term: 'Spring', year: 2026 },
  ];
  const sorted = [...seasons].sort(logic.compareSeasonsDesc);
  assert.deepStrictEqual(
    sorted.map(s => s.term),
    ['Fall', 'Summer', 'Spring', 'Winter'],
    `expected Fall>Summer>Spring>Winter within the same year, got ${JSON.stringify(sorted.map(s => s.term))}`
  );
});

// ── 9. Per-day tournament limits + CPYL post-tournament rest (v3.7) ─────────

logic.setCurrentRules(logic.DEFAULT_RULES); // 10U: 20/40/60

const FRI = '2026-10-23'; // Fri-Sun tournament
const T3 = { id: 'T', name: 'Fall Classic', startDate: FRI, days: 3, maxTotal: 100,
  dayLimits: [{ max: 75, isHard: true }, { max: 75, isHard: true }, { max: 75, isHard: true }] };

function tourneyPitcher(perDay, t = T3) {
  return { id: 'p', name: 'P', jersey: '1', history: perDay
    .map((n, i) => n ? makeEntry({ date: logic.addDays(t.startDate, i), pitches: n, isTournament: true,
      tournamentId: t.id, tournamentName: t.name, tourneyDay: i + 1 }) : null)
    .filter(Boolean) };
}

// CPYL "Pitch Counts 101" examples (Fri/Sat/Sun) + the examples from the spec.
const restCases = [
  ['CPYL pitcher 1: 33/0/0 -> Monday',     [33, 0, 0],  '2026-10-26'],
  ['CPYL pitcher 2: 28/0/2 -> Tuesday',    [28, 0, 2],  '2026-10-27'],
  ['CPYL pitcher 3: 10/15/19 -> Wednesday',[10, 15, 19],'2026-10-28'],
  ['CPYL pitcher 4: 4/20/42 -> Thursday',  [4, 20, 42], '2026-10-29'],
  ['spec: 20/0/5 -> rest day after tournament, eligible day 5', [20, 0, 5], '2026-10-27'],
  ['spec: 25/0/0 -> rest served during tournament, eligible after it', [25, 0, 0], '2026-10-26'],
  ['spec: 25/45/0 = 70 -> 3 rest days starting day 3, eligible day 6', [25, 45, 0], '2026-10-28'],
  ['25/20/0 = 45 -> 2 rest days from day 2, eligible day 5', [25, 20, 0], '2026-10-27'],
  ['<=20 total -> no rest days, but not before the day after the tournament', [10, 0, 10], '2026-10-26'],
];
for (const [name, perDay, expected] of restCases) {
  test(`9a. ${name}`, () => {
    assert.strictEqual(logic.getEligibleDateStr(tourneyPitcher(perDay), [T3]), expected);
  });
}

test('9b. regular game pitched during post-tournament rest cannot shorten it', () => {
  const p = tourneyPitcher([4, 20, 42]); // eligible Thu 10/29
  p.history.push(makeEntry({ date: '2026-10-27', pitches: 10 })); // illegal Tue game, 0 rest on its own
  assert.strictEqual(logic.getEligibleDateStr(p, [T3]), '2026-10-29');
  // ...and a GameLog-style check "as of" Tue only sees the tournament.
  assert.strictEqual(logic.getEligibleDateStr(p, [T3], { before: '2026-10-27' }), '2026-10-29');
});

test('9c. later regular game with more rest extends past the tournament rest', () => {
  const p = tourneyPitcher([33, 0, 0]); // eligible Mon 10/26
  p.history.push(makeEntry({ date: '2026-10-27', pitches: 65 })); // 3 rest days
  assert.strictEqual(logic.getEligibleDateStr(p, [T3]), '2026-10-31');
});

test('9d. getTourneyDayLimits: legacy maxDay1/day1IsHardLimit shape', () => {
  const legacy = { id: 'L', startDate: FRI, days: 3, maxDay1: 55, day1IsHardLimit: true, maxTotal: 115 };
  assert.deepStrictEqual(logic.getTourneyDayLimits(legacy),
    [{ max: 55, isHard: true }, { max: 55, isHard: false }, { max: 55, isHard: false }]);
  assert.strictEqual(logic.getTourneyMaxTotal(legacy), 115);
});

test('9e. getTourneyDayLimits: RTDB object-shaped array, short array padded with hard defaults', () => {
  const t = { startDate: FRI, days: 3, dayLimits: { 0: { max: 60, isHard: false }, 1: { max: 40, isHard: true } } };
  assert.deepStrictEqual(logic.getTourneyDayLimits(t), [
    { max: 60, isHard: false }, { max: 40, isHard: true },
    { max: logic.DEFAULT_TOURNEY_DAY_LIMIT, isHard: true }]);
});

test('9f. getTourneyDayNumber derives the day from the date', () => {
  assert.strictEqual(logic.getTourneyDayNumber(T3, '2026-10-22'), null);
  assert.strictEqual(logic.getTourneyDayNumber(T3, FRI), 1);
  assert.strictEqual(logic.getTourneyDayNumber(T3, '2026-10-25'), 3);
  assert.strictEqual(logic.getTourneyDayNumber(T3, '2026-10-26'), null);
});

test('9g. in-tournament: no rest between days (45 on Fri, eligible Sat)', () => {
  const e = logic.getTourneyEligibility(tourneyPitcher([45]), T3, '2026-10-24', [T3]);
  assert.strictEqual(e.eligible, true, e.reason);
  assert.strictEqual(e.pitchesLeft, 55); // min(75 today, 100-45 total)
});

test('9h. in-tournament: reaching a hard daily limit ends that day only', () => {
  const p = tourneyPitcher([77]); // finished a batter past 75
  assert.strictEqual(logic.getTourneyEligibility(p, T3, FRI, [T3]).eligible, false);
  const sat = logic.getTourneyEligibility(p, T3, '2026-10-24', [T3]);
  assert.strictEqual(sat.eligible, true);
  assert.strictEqual(sat.pitchesLeft, 23);
});

test('9i. in-tournament: reaching the total exactly ends the tournament', () => {
  const p = tourneyPitcher([60, 40]);
  assert.strictEqual(logic.getTourneyEligibility(p, T3, '2026-10-25', [T3]).eligible, false);
});

test('9j. guideline day limit never makes a pitcher ineligible', () => {
  const t = { ...T3, dayLimits: [{ max: 30, isHard: false }, { max: 75, isHard: true }, { max: 75, isHard: true }] };
  const e = logic.getTourneyEligibility(tourneyPitcher([40], t), t, FRI, [t]);
  assert.strictEqual(e.eligible, true);
  assert.strictEqual(e.atGuideline, true);
  const v = logic.getTourneyLimitViolation(tourneyPitcher([], t), t, FRI, 40, [t]);
  assert.strictEqual(v.level, 'note');
});

test('9k. pre-tournament regular-season rest carries into the tournament', () => {
  const p = tourneyPitcher([]);
  p.history.push(makeEntry({ date: '2026-10-22', pitches: 50 })); // Thu, 2 rest -> eligible Sun
  assert.strictEqual(logic.getTourneyEligibility(p, T3, FRI, [T3]).eligible, false);
  assert.strictEqual(logic.getTourneyEligibility(p, T3, '2026-10-25', [T3]).eligible, true);
  assert.strictEqual(logic.getTourneyLimitViolation(p, T3, '2026-10-24', 10, [T3]).level, 'violation');
});

test('9l. getTourneyLimitViolation: finishing a batter over a hard limit is a (overridable) violation', () => {
  const p = tourneyPitcher([70]);
  const v = logic.getTourneyLimitViolation(p, T3, FRI, 7, [T3]); // logging a 2nd Fri game: 70 + 7
  assert.strictEqual(v.level, 'violation');
  assert.ok(/finishing a batter/.test(v.message), v.message);
  assert.strictEqual(logic.getTourneyLimitViolation(p, T3, FRI, 5, [T3]), null); // exactly 75
});

test('9m. getTourneyLimitViolation: over the tournament total', () => {
  const p = tourneyPitcher([60, 30]);
  assert.ok(/tournament limit/.test(logic.getTourneyLimitViolation(p, T3, '2026-10-25', 12, [T3]).message));
  assert.strictEqual(logic.getTourneyLimitViolation(p, T3, '2026-10-25', 10, [T3]), null);
});

test('9n. 12U thresholds (25/45/65) drive post-tournament rest', () => {
  logic.setCurrentRules({ maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 });
  try {
    assert.strictEqual(logic.getEligibleDateStr(tourneyPitcher([25]), [T3]), '2026-10-26'); // 25 -> no rest, floor Mon
    assert.strictEqual(logic.getEligibleDateStr(tourneyPitcher([20, 0, 26]), [T3]), '2026-10-28'); // 46 -> 2
  } finally {
    logic.setCurrentRules(logic.DEFAULT_RULES);
  }
});

// ── 10. Live game (v3.8) ─────────────────────────────────────────────────

function liveGame(overrides) {
  return Object.assign({ id: 'lg1', date: '2026-10-20', context: 'regular', opponent: 'Hawks',
    startedAt: 1, startedBy: 'Coach', pitchers: {} }, overrides);
}
const LT = { id: 'lt', name: 'Fall Classic', startDate: '2026-10-23', days: 3, maxTotal: 100,
  dayLimits: [{ max: 50, isHard: true }, { max: 40, isHard: false }, { max: 50, isHard: true }] };

test('10a. regular season: pitches left = maxPitches minus live count', () => {
  const p = { id: 'a', name: 'A', history: [] };
  const b = logic.getLivePitcherBudget(p, liveGame({ pitchers: { a: { pitches: 38, status: 'active', order: 1 } } }), []);
  assert.strictEqual(b.inGame, true);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.pitchesLeft, 55 - 38);
  assert.deepStrictEqual(b.rest, { restDays: 1, nextAt: 41, nextRestDays: 2 });
});

test('10b. regular season: same-day logged pitches count toward the daily max', () => {
  const p = { id: 'a', name: 'A', history: [makeEntry({ date: '2026-10-20', pitches: 30 })] };
  const b = logic.getLivePitcherBudget(p, liveGame({ pitchers: { a: { pitches: 10, status: 'active', order: 1 } } }), []);
  assert.strictEqual(b.priorToday, 30);
  assert.strictEqual(b.pitchesLeft, 15);
  const full = { id: 'b', name: 'B', history: [makeEntry({ date: '2026-10-20', pitches: 55 })] };
  assert.strictEqual(logic.getLivePitcherBudget(full, liveGame(), []).eligible, false);
});

test('10c. regular season: resting pitcher is unavailable with reason', () => {
  const p = { id: 'a', name: 'A', history: [makeEntry({ date: '2026-10-19', pitches: 45 })] };
  const b = logic.getLivePitcherBudget(p, liveGame(), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Resting/.test(b.reason), b.reason);
});

test('10d. tournament: tighter of hard day limit and total, guideline note', () => {
  const p = { id: 'a', name: 'A', history: [
    makeEntry({ date: '2026-10-23', pitches: 45, isTournament: true, tournamentId: 'lt' })] };
  const day1 = logic.getLivePitcherBudget(p, liveGame({ date: '2026-10-23', context: 'lt',
    pitchers: { a: { pitches: 3, status: 'active', order: 1 } } }), [LT]);
  assert.strictEqual(day1.pitchesLeft, 2);
  assert.strictEqual(day1.leftLabel, 'left today');
  const day2 = logic.getLivePitcherBudget(p, liveGame({ date: '2026-10-24', context: 'lt',
    pitchers: { a: { pitches: 41, status: 'active', order: 1 } } }), [LT]);
  assert.strictEqual(day2.pitchesLeft, 100 - 86);
  assert.strictEqual(day2.leftLabel, 'left in tourney');
  assert.ok(day2.note && /guideline/.test(day2.note));
});

test('10e. tournament: date outside tournament is unavailable', () => {
  const b = logic.getLivePitcherBudget({ id: 'a', history: [] }, liveGame({ date: '2026-10-30', context: 'lt' }), [LT]);
  assert.strictEqual(b.eligible, false);
});

test('10f. liveGameToLogEntries drops 0-count pitchers and keeps entry order', () => {
  const g = liveGame({ pitchers: {
    b: { pitches: 20, status: 'active', order: 2 },
    a: { pitches: 30, status: 'left', order: 1 },
    c: { pitches: 0, status: 'left', order: 3 } } });
  const { entries, dropped } = logic.liveGameToLogEntries(g, [], 'sg');
  assert.deepStrictEqual(entries.map(e => e.playerId), ['a', 'b']);
  assert.deepStrictEqual(dropped, ['c']);
  assert.strictEqual(entries[0].data.gameId, 'sg_a');
  assert.strictEqual(entries[0].data.sharedGameId, 'sg');
  assert.strictEqual(entries[0].data.isTournament, false);
  assert.strictEqual(entries[0].data.opponent, 'Hawks');
});

test('10g. liveGameToLogEntries for a tournament fills tournament fields from the date', () => {
  const g = liveGame({ date: '2026-10-24', context: 'lt', pitchers: { a: { pitches: 12, status: 'active', order: 1 } } });
  const d = logic.liveGameToLogEntries(g, [LT], 'sg').entries[0].data;
  assert.strictEqual(d.tournamentId, 'lt');
  assert.strictEqual(d.tournamentName, 'Fall Classic');
  assert.strictEqual(d.tourneyDay, 2);
});

test('10h. normalizeLiveGame rejects junk and sanitizes fields', () => {
  assert.strictEqual(logic.normalizeLiveGame(null), null);
  assert.strictEqual(logic.normalizeLiveGame({ date: '2026-10-20' }), null);
  const g = logic.normalizeLiveGame({ id: 'x', date: 'nope', opponent: '  ' + 'z'.repeat(100),
    pitchers: { a: { pitches: -4, status: 'active' }, b: 'junk', c: { pitches: '5000', status: 'left' }, d: { pitches: 3 } } });
  assert.ok(logic.isIsoDate(g.date));
  assert.strictEqual(g.opponent.length, logic.LIVE_OPPONENT_MAX);
  assert.deepStrictEqual(Object.keys(g.pitchers), ['a', 'c']); // d: no status -> dropped
  assert.strictEqual(g.pitchers.a.pitches, 0);
  assert.strictEqual(g.pitchers.a.status, 'active');
  assert.strictEqual(g.pitchers.c.pitches, logic.LIVE_MAX_COUNT);
});

test('10i. getRestThresholdInfo at the 3-day max has no next threshold', () => {
  assert.deepStrictEqual(logic.getRestThresholdInfo(0), { restDays: 0, nextAt: 21, nextRestDays: 1 });
  assert.deepStrictEqual(logic.getRestThresholdInfo(61), { restDays: 3, nextAt: null, nextRestDays: null });
});

test('10j. applyLiveGameAction guards game id, missing pitchers, and clamps counts', () => {
  const g = liveGame({ pitchers: { a: { pitches: 1, status: 'active', order: 1, enteredAt: 1 } } });
  const A = (raw, action) => logic.applyLiveGameAction(raw, 'lg1', action);
  assert.strictEqual(A(null, { type: 'bump', id: 'a', delta: 1 }), undefined);            // game gone
  assert.strictEqual(A({ pitchers: {} }, { type: 'bump', id: 'a', delta: 1 }), undefined); // junk, no id
  assert.strictEqual(logic.applyLiveGameAction(g, 'other', { type: 'bump', id: 'a', delta: 1 }), undefined);
  assert.strictEqual(A(g, { type: 'bump', id: 'zz', delta: 1 }), undefined);              // removed pitcher
  assert.strictEqual(A(g, { type: 'bump', id: 'a', delta: -5 }).pitchers.a.pitches, 0);
  assert.strictEqual(A(g, { type: 'setCount', id: 'a', value: '5000' }).pitchers.a.pitches, 999);
  assert.strictEqual(g.pitchers.a.pitches, 1); // input not mutated
});

test('10k. add marks the active pitcher left; undoAdd reverses only before the new pitcher throws', () => {
  const g = liveGame({ pitchers: { a: { pitches: 30, status: 'active', order: 1, enteredAt: 1 } } });
  const g2 = logic.applyLiveGameAction(g, 'lg1', { type: 'add', id: 'b', now: 5 });
  assert.strictEqual(g2.pitchers.a.status, 'left');
  assert.strictEqual(g2.pitchers.a.leftAt, 5);
  assert.deepStrictEqual(g2.pitchers.b, { pitches: 0, status: 'active', order: 2, enteredAt: 5 });
  assert.strictEqual(logic.applyLiveGameAction(g2, 'lg1', { type: 'add', id: 'b' }), undefined); // already in
  const g3 = logic.applyLiveGameAction(g2, 'lg1', { type: 'undoAdd', id: 'b', prevIds: ['a'] });
  assert.strictEqual(g3.pitchers.b, undefined);
  assert.strictEqual(g3.pitchers.a.status, 'active');
  const thrown = logic.applyLiveGameAction(g2, 'lg1', { type: 'bump', id: 'b', delta: 1 });
  assert.strictEqual(logic.applyLiveGameAction(thrown, 'lg1', { type: 'undoAdd', id: 'b', prevIds: ['a'] }), undefined);
});

test('10l. sanitizeLiveCount handles exponent-notation numbers', () => {
  assert.strictEqual(logic.sanitizeLiveCount(1e21), 999);
  assert.strictEqual(logic.sanitizeLiveCount(Infinity), 0);
  assert.strictEqual(logic.sanitizeLiveCount(12.7), 12);
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
