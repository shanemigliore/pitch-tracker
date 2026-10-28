#!/usr/bin/env node
/**
 * Independent verification tests for the v3.8 Live Game feature's pure logic
 * (lib/pitch-logic.js): getLivePitcherBudget, getRestThresholdInfo,
 * liveGameToLogEntries, buildGameEntries, getGameLogCheck (parity with the
 * pre-v3.8 GameLogScreen getCheck), normalizeLiveGame and the sanitizers.
 * Run with: node tests/live-game-v38.test.js
 * Dependency-free, same harness style as tests/logic.test.js.
 */

'use strict';

const assert = require('assert');
const logic = require('../lib/pitch-logic.js');
const {
  getLivePitcherBudget, getRestThresholdInfo, liveGameToLogEntries, buildGameEntries,
  getGameLogCheck, normalizeLiveGame, sanitizeLiveCount, sanitizeOpponent, getLiveGamePitcherIds,
  getEligibleDateStr, getTourneyLimitViolation, getTourneyDayNumber, formatDate, getTourneyAdjustedRestInfo,
  setCurrentRules, DEFAULT_RULES, LIVE_MAX_COUNT, LIVE_OPPONENT_MAX, todayStr, addDays,
} = logic;

let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; failures.push({ name, error: e }); console.log(`FAIL  ${name}`); console.log(`      ${e.message}`); }
  finally { setCurrentRules(DEFAULT_RULES); }
}

let gid = 0;
function h(o) {
  return Object.assign({ gameId: 'g' + (++gid), date: '2026-10-20', pitches: 10, opponent: 'X',
    isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null }, o);
}
function th(t, o) { return h(Object.assign({ isTournament: true, tournamentId: t.id, tournamentName: t.name }, o)); }
function pitcher(id, history) { return { id, name: id.toUpperCase(), jersey: '1', lastPitches: 0, lastGameDate: '', history: history || [] }; }
function game(o) {
  return Object.assign({ id: 'lg1', date: '2026-10-20', context: 'regular', opponent: 'Hawks',
    startedAt: 1, startedBy: 'Coach', pitchers: {} }, o);
}
function inGame(pitches, extra) { return Object.assign({ pitches, status: 'active', order: 1, enteredAt: 1, leftAt: null }, extra); }

// Fri-Sun, Day1 hard 50, Day2 guideline 40, Day3 hard 50, total 100
const T = { id: 'tA', name: 'Fall Classic', startDate: '2026-10-23', days: 3, maxTotal: 100,
  dayLimits: [{ max: 50, isHard: true }, { max: 40, isHard: false }, { max: 50, isHard: true }] };
const TOURNEYS = [T];

// ── Reconstruction of the pre-v3.8 GameLogScreen getCheck (HEAD) ────────────
function oldGetCheck(p, { context, tournaments, gameDate, count }) {
  const selectedTourney = tournaments.find(t => t.id === context);
  const tourneyDay = selectedTourney ? getTourneyDayNumber(selectedTourney, gameDate) : null;
  const dateOutsideTourney = context !== 'regular' && !!selectedTourney && !tourneyDay;
  if (context === 'regular') {
    // v3.17: regular season counts outings already logged ON the game date too
    // (no doubleheader allowance once rest is owed) - the oracle follows the rule.
    const eligStr = getEligibleDateStr(p, tournaments, { before: addDays(gameDate, 1) });
    if (!(eligStr && eligStr > gameDate)) return null;
    const info = getTourneyAdjustedRestInfo(p, tournaments, { before: addDays(gameDate, 1) });
    const sameDay = !info.isTourney && info.lastPitchDate === gameDate;
    return { level: 'violation', message: sameDay
      ? `Threw ${info.totalPitches}p ${gameDate === todayStr() ? 'earlier today' : 'on ' + formatDate(gameDate)} — eligible ${formatDate(eligStr)}`
      : `Resting — eligible ${formatDate(eligStr)}` };
  }
  if (!selectedTourney || dateOutsideTourney) return null;
  return getTourneyLimitViolation(p, selectedTourney, gameDate, count, tournaments);
}
// New GameLogScreen getCheck (working tree)
function newGetCheck(p, { context, tournaments, gameDate, count }) {
  const selectedTourney = tournaments.find(t => t.id === context);
  const tourneyDay = selectedTourney ? getTourneyDayNumber(selectedTourney, gameDate) : null;
  const dateOutsideTourney = context !== 'regular' && !!selectedTourney && !tourneyDay;
  if (dateOutsideTourney) return null;
  return getGameLogCheck(p, { context, tourney: selectedTourney, date: gameDate, count, tournaments });
}
// Old GameLogScreen entry payload (HEAD)
function oldEntry(p, count, { gameDate, opponent, context, tournaments, sharedGameId }) {
  const selectedTourney = tournaments.find(t => t.id === context);
  const tourneyDay = selectedTourney ? getTourneyDayNumber(selectedTourney, gameDate) : null;
  return {
    pitches: count, date: gameDate, opponent,
    isTournament: context !== 'regular',
    tournamentId: context !== 'regular' ? context : null,
    tournamentName: context !== 'regular' ? selectedTourney?.name : null,
    tourneyDay: context !== 'regular' ? tourneyDay : null,
    gameId: sharedGameId + '_' + p.id, sharedGameId,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. getLivePitcherBudget — regular season
// ════════════════════════════════════════════════════════════════════════════
test('1a. regular: not in game, fresh pitcher -> eligible, 55 left', () => {
  const b = getLivePitcherBudget(pitcher('a'), game(), []);
  assert.strictEqual(b.inGame, false);
  assert.strictEqual(b.count, 0);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.pitchesLeft, 55);
  assert.strictEqual(b.leftLabel, 'left');
  assert.strictEqual(b.restAfterTourney, false);
});
test('1b. regular: live count reduces pitches left; rest hint follows live count', () => {
  const b = getLivePitcherBudget(pitcher('a'), game({ pitchers: { a: inGame(25) } }), []);
  assert.strictEqual(b.inGame, true);
  assert.strictEqual(b.pitchesLeft, 30);
  assert.deepStrictEqual(b.rest, { restDays: 1, nextAt: 41, nextRestDays: 2 });
});
test('1c. regular: doubleheader — same-day logged regular pitches count; tourney same-day does not', () => {
  const p = pitcher('a', [h({ date: '2026-10-20', pitches: 30 }), h({ date: '2026-10-19', pitches: 5 }),
    th(T, { date: '2026-10-20', pitches: 7 })]);
  const b = getLivePitcherBudget(p, game({ pitchers: { a: inGame(10) } }), TOURNEYS);
  assert.strictEqual(b.priorToday, 30);
  assert.strictEqual(b.used, 40);
  assert.strictEqual(b.pitchesLeft, 15);
});
test('1d. regular: already reached daily max earlier today -> unavailable with reason', () => {
  const p = pitcher('a', [h({ date: '2026-10-20', pitches: 55 })]);
  const b = getLivePitcherBudget(p, game(), []);
  assert.strictEqual(b.eligible, false);
  // v3.17: 55 earlier today owes rest, which is the more specific reason
  assert.ok(/^Threw 55p (earlier today|on )/.test(b.reason), b.reason);
});
test('1e. regular: resting from yesterday -> unavailable "Resting"', () => {
  const p = pitcher('a', [h({ date: '2026-10-19', pitches: 45 })]); // 2 rest days -> elig 10-22
  const b = getLivePitcherBudget(p, game(), []);
  assert.strictEqual(b.eligible, false);
  assert.ok(/^Resting/.test(b.reason), b.reason);
});
test('1f. regular: eligibility is from logged history only, not the live count', () => {
  const b = getLivePitcherBudget(pitcher('a'), game({ pitchers: { a: inGame(80) } }), []);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.pitchesLeft, -25); // over-limit -> negative
});
test('1g. regular: custom team maxPitches respected', () => {
  setCurrentRules({ maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 });
  const b = getLivePitcherBudget(pitcher('a'), game({ pitchers: { a: inGame(30) } }), []);
  assert.strictEqual(b.pitchesLeft, 45);
  assert.deepStrictEqual(b.rest, { restDays: 1, nextAt: 46, nextRestDays: 2 });
});
test('1h. regular: missing/invalid liveGame date falls back to today', () => {
  const today = todayStr();
  const p = pitcher('a', [h({ date: today, pitches: 20 })]);
  const b = getLivePitcherBudget(p, game({ date: 'garbage' }), []);
  assert.strictEqual(b.priorToday, 20);
});
test('1i. regular: null liveGame does not throw', () => {
  const b = getLivePitcherBudget(pitcher('a'), null, []);
  assert.strictEqual(b.inGame, false);
  assert.strictEqual(b.pitchesLeft, 55);
});
test('1j. regular: string pitches in history coerced', () => {
  const p = pitcher('a', [h({ date: '2026-10-20', pitches: '12' })]);
  assert.strictEqual(getLivePitcherBudget(p, game(), []).priorToday, 12);
});

// ════════════════════════════════════════════════════════════════════════════
// 2. getLivePitcherBudget — tournament
// ════════════════════════════════════════════════════════════════════════════
const tg = (date, pitchers) => game({ date, context: T.id, pitchers: pitchers || {} });
test('2a. tourney Day 1 hard: binds on day limit (50) vs total (100)', () => {
  const b = getLivePitcherBudget(pitcher('a'), tg('2026-10-23', { a: inGame(20) }), TOURNEYS);
  assert.strictEqual(b.eligible, true);
  assert.strictEqual(b.pitchesLeft, 30);
  assert.strictEqual(b.leftLabel, 'left today');
  assert.strictEqual(b.arcMax, 50);
  assert.strictEqual(b.restAfterTourney, true);
});
test('2b. tourney Day 2 guideline: only total caps; soft note at/over guideline', () => {
  const p = pitcher('a', [th(T, { date: '2026-10-23', pitches: 30 })]);
  const b = getLivePitcherBudget(p, tg('2026-10-24', { a: inGame(40) }), TOURNEYS);
  assert.strictEqual(b.leftLabel, 'left in tourney');
  assert.strictEqual(b.pitchesLeft, 100 - 70);
  assert.ok(b.note && /At Day 2 guideline/.test(b.note), b.note);
  const b2 = getLivePitcherBudget(p, tg('2026-10-24', { a: inGame(45) }), TOURNEYS);
  assert.ok(/Over Day 2 guideline/.test(b2.note), b2.note);
  const b3 = getLivePitcherBudget(p, tg('2026-10-24', { a: inGame(10) }), TOURNEYS);
  assert.strictEqual(b3.note, null);
});
test('2c. tourney: total binds when tighter than hard day limit', () => {
  const p = pitcher('a', [th(T, { date: '2026-10-23', pitches: 50 }), th(T, { date: '2026-10-24', pitches: 30 })]);
  const b = getLivePitcherBudget(p, tg('2026-10-25', { a: inGame(5) }), TOURNEYS);
  assert.strictEqual(b.pitchesLeft, 15); // total 100 - 85; day left 45
  assert.strictEqual(b.leftLabel, 'left in tourney');
});
test('2d. tourney: at hard day limit earlier today -> unavailable', () => {
  const p = pitcher('a', [th(T, { date: '2026-10-23', pitches: 50 })]);
  const b = getLivePitcherBudget(p, tg('2026-10-23'), TOURNEYS);
  assert.strictEqual(b.eligible, false);
  assert.ok(/Day 1 limit/.test(b.reason), b.reason);
});
test('2e. tourney: at total -> unavailable', () => {
  const p = pitcher('a', [th(T, { date: '2026-10-23', pitches: 50 }), th(T, { date: '2026-10-24', pitches: 50 })]);
  const b = getLivePitcherBudget(p, tg('2026-10-25'), TOURNEYS);
  assert.strictEqual(b.eligible, false);
  assert.ok(/tournament limit/.test(b.reason), b.reason);
});
test('2f. tourney: pre-tournament rest owed -> unavailable', () => {
  const p = pitcher('a', [h({ date: '2026-10-22', pitches: 50 })]); // 2 rest -> elig 10-25
  const b = getLivePitcherBudget(p, tg('2026-10-23'), TOURNEYS);
  assert.strictEqual(b.eligible, false);
  assert.ok(/pre-tournament/.test(b.reason), b.reason);
  const b3 = getLivePitcherBudget(p, tg('2026-10-25'), TOURNEYS);
  assert.strictEqual(b3.eligible, true);
});
test('2g. tourney: over hard limit live -> negative pitchesLeft', () => {
  const b = getLivePitcherBudget(pitcher('a'), tg('2026-10-23', { a: inGame(57) }), TOURNEYS);
  assert.strictEqual(b.pitchesLeft, -7);
});
test('2h. tourney: date outside tourney -> unavailable, no throw', () => {
  const b = getLivePitcherBudget(pitcher('a'), tg('2026-10-20', { a: inGame(5) }), TOURNEYS);
  assert.strictEqual(b.eligible, false);
  assert.ok(/outside/.test(b.reason));
  assert.strictEqual(b.pitchesLeft, 0);
  assert.ok(b.arcMax >= 1);
});
test('2i. tourney: missing (deleted) tourney -> unavailable "Tournament not found"', () => {
  const b = getLivePitcherBudget(pitcher('a'), tg('2026-10-23', { a: inGame(5) }), []);
  assert.strictEqual(b.eligible, false);
  assert.strictEqual(b.reason, 'Tournament not found');
  assert.strictEqual(b.count, 5);
});
test('2j. tourney: tourney without start date', () => {
  const t = { id: 'tB', name: 'NoDate', days: 2, maxTotal: 80 };
  const b = getLivePitcherBudget(pitcher('a'), game({ context: 'tB' }), [t]);
  assert.strictEqual(b.eligible, false);
  assert.ok(/no start date/.test(b.reason));
});
test('2k. tourney: legacy-shape tourney (maxDay1/day1IsHardLimit) works', () => {
  const t = { id: 'tL', name: 'Legacy', startDate: '2026-10-23', days: 2, maxTotal: 90, maxDay1: 45, day1IsHardLimit: true };
  const b = getLivePitcherBudget(pitcher('a'), game({ context: 'tL', date: '2026-10-23', pitchers: { a: inGame(10) } }), [t]);
  assert.strictEqual(b.pitchesLeft, 35);
  const b2 = getLivePitcherBudget(pitcher('a'), game({ context: 'tL', date: '2026-10-24', pitchers: { a: inGame(10) } }), [t]);
  assert.strictEqual(b2.leftLabel, 'left in tourney');
  assert.strictEqual(b2.pitchesLeft, 80);
});
test('2l. tourney: doubleheader same tourney day — prior pitches same day counted', () => {
  const p = pitcher('a', [th(T, { date: '2026-10-23', pitches: 20 })]);
  const b = getLivePitcherBudget(p, tg('2026-10-23', { a: inGame(10) }), TOURNEYS);
  assert.strictEqual(b.priorToday, 20);
  assert.strictEqual(b.pitchesLeft, 20);
});
test('2m. tourney: rest hint based on tournament total incl. live count', () => {
  const p = pitcher('a', [th(T, { date: '2026-10-23', pitches: 30 })]);
  const b = getLivePitcherBudget(p, tg('2026-10-24', { a: inGame(15) }), TOURNEYS);
  assert.strictEqual(b.rest.restDays, 2); // 45 total
  assert.strictEqual(b.rest.nextAt, 61);
});

// ════════════════════════════════════════════════════════════════════════════
// 3. getRestThresholdInfo
// ════════════════════════════════════════════════════════════════════════════
test('3a. default thresholds: strict >, nextAt = threshold+1', () => {
  assert.deepStrictEqual(getRestThresholdInfo(0), { restDays: 0, nextAt: 21, nextRestDays: 1 });
  assert.deepStrictEqual(getRestThresholdInfo(20), { restDays: 0, nextAt: 21, nextRestDays: 1 });
  assert.deepStrictEqual(getRestThresholdInfo(21), { restDays: 1, nextAt: 41, nextRestDays: 2 });
  assert.deepStrictEqual(getRestThresholdInfo(40), { restDays: 1, nextAt: 41, nextRestDays: 2 });
  assert.deepStrictEqual(getRestThresholdInfo(41), { restDays: 2, nextAt: 61, nextRestDays: 3 });
  assert.deepStrictEqual(getRestThresholdInfo(61), { restDays: 3, nextAt: null, nextRestDays: null });
});
test('3b. custom 12U rules 25/45/65', () => {
  setCurrentRules({ maxPitches: 75, rest1: 25, rest2: 45, rest3: 65 });
  assert.deepStrictEqual(getRestThresholdInfo(25), { restDays: 0, nextAt: 26, nextRestDays: 1 });
  assert.deepStrictEqual(getRestThresholdInfo(46), { restDays: 2, nextAt: 66, nextRestDays: 3 });
  assert.strictEqual(getRestThresholdInfo(66).nextAt, null);
});
test('3c. rest1 = 0 rules: 1 pitch already triggers rest', () => {
  setCurrentRules({ maxPitches: 30, rest1: 0, rest2: 10, rest3: 20 });
  assert.deepStrictEqual(getRestThresholdInfo(0), { restDays: 0, nextAt: 1, nextRestDays: 1 });
  assert.deepStrictEqual(getRestThresholdInfo(1), { restDays: 1, nextAt: 11, nextRestDays: 2 });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. buildGameEntries / liveGameToLogEntries
// ════════════════════════════════════════════════════════════════════════════
test('4a. buildGameEntries regular: matches old GameLogScreen payload exactly', () => {
  const ps = [pitcher('a'), pitcher('b')];
  const got = buildGameEntries({ pitchers: [{ id: 'a', pitches: 20 }, { id: 'b', pitches: 15 }],
    date: '2026-10-20', opponent: 'Hawks', context: 'regular', tourney: undefined, sharedGameId: 'S1' });
  const want = ps.map((p, i) => ({ playerId: p.id, data: oldEntry(p, i ? 15 : 20,
    { gameDate: '2026-10-20', opponent: 'Hawks', context: 'regular', tournaments: [], sharedGameId: 'S1' }) }));
  assert.deepStrictEqual(got, want);
});
test('4b. buildGameEntries tournament: matches old payload; tourneyDay derived from date', () => {
  const got = buildGameEntries({ pitchers: [{ id: 'a', pitches: 33 }], date: '2026-10-24', opponent: 'Hawks',
    context: T.id, tourney: T, sharedGameId: 'S2' });
  const want = [{ playerId: 'a', data: oldEntry(pitcher('a'), 33, { gameDate: '2026-10-24', opponent: 'Hawks',
    context: T.id, tournaments: TOURNEYS, sharedGameId: 'S2' }) }];
  assert.deepStrictEqual(got, want);
  assert.strictEqual(got[0].data.tourneyDay, 2);
  assert.strictEqual(got[0].data.gameId, 'S2_a');
});
test('4c. buildGameEntries: tourney context but tourney missing -> tournamentName null (old was undefined)', () => {
  const got = buildGameEntries({ pitchers: [{ id: 'a', pitches: 3 }], date: '2026-10-24', opponent: 'X',
    context: 'gone', tourney: undefined, sharedGameId: 'S' });
  assert.strictEqual(got[0].data.tournamentName, null);
  assert.strictEqual(got[0].data.tourneyDay, null);
  assert.strictEqual(got[0].data.isTournament, true);
});
test('4d. liveGameToLogEntries: drops 0-count, keeps entry order, sanitizes opponent', () => {
  const lg = game({ opponent: '  Hawks  ', pitchers: {
    b: inGame(0, { order: 1, status: 'left' }), c: inGame(12, { order: 3 }), a: inGame(30, { order: 2, status: 'left' }) } });
  const { entries, dropped } = liveGameToLogEntries(lg, [], 'SG');
  assert.deepStrictEqual(entries.map(e => e.playerId), ['a', 'c']);
  assert.deepStrictEqual(dropped, ['b']);
  assert.strictEqual(entries[0].data.opponent, 'Hawks');
  assert.strictEqual(entries[0].data.sharedGameId, 'SG');
  assert.strictEqual(entries[1].data.gameId, 'SG_c');
  assert.strictEqual(entries[0].data.isTournament, false);
});
test('4e. liveGameToLogEntries tournament fields', () => {
  const lg = tg('2026-10-25', { a: inGame(9) });
  const { entries } = liveGameToLogEntries(lg, TOURNEYS, 'SG');
  assert.deepStrictEqual(entries[0].data, { pitches: 9, date: '2026-10-25', opponent: 'Hawks', isTournament: true,
    tournamentId: 'tA', tournamentName: 'Fall Classic', tourneyDay: 3, gameId: 'SG_a', sharedGameId: 'SG' });
});
test('4f. liveGameToLogEntries clamps hostile counts', () => {
  const lg = game({ pitchers: { a: inGame(1e9) } });
  assert.strictEqual(liveGameToLogEntries(lg, [], 'S').entries[0].data.pitches, LIVE_MAX_COUNT);
});
test('4g. liveGameToLogEntries with no pitchers -> empty', () => {
  const r = liveGameToLogEntries(game(), [], 'S');
  assert.deepStrictEqual(r, { entries: [], dropped: [] });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. getGameLogCheck parity with old GameLogScreen getCheck
// ════════════════════════════════════════════════════════════════════════════
test('5a. parity sweep across contexts/dates/histories/counts', () => {
  const T2 = { id: 'tNo', name: 'NoStart', days: 2 };
  const T3 = { id: 'tLeg', name: 'Leg', startDate: '2026-10-10', days: 2, maxDay1: 40, day1IsHardLimit: false };
  const tourneys = [T, T2, T3];
  const histories = [
    [], [h({ date: '2026-10-22', pitches: 50 })], [h({ date: '2026-10-19', pitches: 61 })],
    [th(T, { date: '2026-10-23', pitches: 50 })], [th(T, { date: '2026-10-23', pitches: 49 }), th(T, { date: '2026-10-24', pitches: 45 })],
    [th(T3, { date: '2026-10-10', pitches: 41 })], [h({ date: '2026-10-24', pitches: 30 })],
  ];
  const contexts = ['regular', 'tA', 'tNo', 'tLeg', 'missing'];
  const dates = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-30'];
  const counts = [0, 1, 10, 40, 41, 50, 51, 60, 100, 101];
  let n = 0;
  histories.forEach((hist, hi) => contexts.forEach(context => dates.forEach(gameDate => counts.forEach(count => {
    const p = pitcher('p' + hi, hist);
    const args = { context, tournaments: tourneys, gameDate, count };
    assert.deepStrictEqual(newGetCheck(p, args), oldGetCheck(p, args), JSON.stringify({ hi, context, gameDate, count }));
    n++;
  }))));
  assert.ok(n > 3000);
});
test('5b. getGameLogCheck directly: outside-tourney date returns null (Live blocks via dateOutsideTourney)', () => {
  assert.strictEqual(getGameLogCheck(pitcher('a'), { context: 'tA', tourney: T, date: '2026-10-20', count: 10, tournaments: TOURNEYS }), null);
  assert.strictEqual(getGameLogCheck(pitcher('a'), { context: 'tA', tourney: null, date: '2026-10-23', count: 10, tournaments: TOURNEYS }), null);
});
test('5c. getGameLogCheck regular resting -> violation', () => {
  const p = pitcher('a', [h({ date: '2026-10-19', pitches: 45 })]);
  const c = getGameLogCheck(p, { context: 'regular', tourney: null, date: '2026-10-20', count: 5, tournaments: [] });
  assert.strictEqual(c.level, 'violation');
});
test('5d. getGameLogCheck tourney over hard day -> violation, over guideline -> note', () => {
  const c = getGameLogCheck(pitcher('a'), { context: 'tA', tourney: T, date: '2026-10-23', count: 51, tournaments: TOURNEYS });
  assert.strictEqual(c.level, 'violation');
  const n = getGameLogCheck(pitcher('a'), { context: 'tA', tourney: T, date: '2026-10-24', count: 41, tournaments: TOURNEYS });
  assert.strictEqual(n.level, 'note');
});
test('5e. live budget (pitchesLeft<0) and save-time violation agree for in-progress tourney game', () => {
  [[0, 51], [0, 50], [30, 21], [30, 20]].forEach(([prior, live]) => {
    const p = pitcher('a', prior ? [th(T, { date: '2026-10-23', pitches: prior })] : []);
    const b = getLivePitcherBudget(p, tg('2026-10-23', { a: inGame(live) }), TOURNEYS);
    const c = getGameLogCheck(p, { context: 'tA', tourney: T, date: '2026-10-23', count: live, tournaments: TOURNEYS });
    assert.strictEqual(b.pitchesLeft < 0, !!(c && c.level === 'violation'), `${prior}+${live}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. Sanitizers
// ════════════════════════════════════════════════════════════════════════════
test('6a. sanitizeLiveCount', () => {
  const cases = [[5, 5], ['5', 5], ['  7', 7], ['12abc', 12], [3.9, 3], [-1, 0], ['-4', 0], [NaN, 0], [undefined, 0],
    [null, 0], ['', 0], [{}, 0], [[], 0], [[4], 4], [true, 0], [1e9, 999], ['1e3', 1], [Infinity, 0], [999, 999], [1000, 999]];
  cases.forEach(([inp, out]) => assert.strictEqual(sanitizeLiveCount(inp), out, String(inp)));
});
test('6b. sanitizeOpponent', () => {
  assert.strictEqual(sanitizeOpponent('  Hawks  '), 'Hawks');
  assert.strictEqual(sanitizeOpponent(42), '');
  assert.strictEqual(sanitizeOpponent(null), '');
  assert.strictEqual(sanitizeOpponent({ toString() { return 'x'; } }), '');
  assert.strictEqual(sanitizeOpponent('x'.repeat(500)).length, LIVE_OPPONENT_MAX);
  assert.strictEqual(sanitizeOpponent('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>'); // escaped by React at render
});

// ════════════════════════════════════════════════════════════════════════════
// 7. normalizeLiveGame against hostile/malformed input
// ════════════════════════════════════════════════════════════════════════════
test('7a. rejects non-games', () => {
  [null, undefined, 0, 1, '', 'str', [], [1, 2], true, {}, { id: '' }, { id: 5 }, { id: null }, { id: {} }, { id: ['x'] }]
    .forEach(v => assert.strictEqual(normalizeLiveGame(v), null, JSON.stringify(v)));
});
test('7b. orphan node (no id, only pitchers — e.g. a late +1 after claim) -> null', () => {
  assert.strictEqual(normalizeLiveGame({ pitchers: { a: { pitches: 1 } } }), null);
});
test('7c. defaults fill missing fields', () => {
  const g = normalizeLiveGame({ id: 'x' });
  assert.deepStrictEqual(Object.keys(g).sort(), ['context', 'date', 'id', 'opponent', 'pitchers', 'startedAt', 'startedBy']);
  assert.strictEqual(g.context, 'regular');
  assert.strictEqual(g.date, todayStr());
  assert.deepStrictEqual(g.pitchers, {});
});
test('7d. junk field types coerced', () => {
  const g = normalizeLiveGame({ id: 'x', date: '2026-13-45', context: 7, opponent: ['a'], startedAt: 'abc', startedBy: { a: 1 },
    pitchers: 'nope' });
  assert.strictEqual(g.date, todayStr());
  assert.strictEqual(g.context, 'regular');
  assert.strictEqual(g.opponent, '');
  assert.strictEqual(g.startedAt, 0);
  assert.strictEqual(g.startedBy, '');
  assert.deepStrictEqual(g.pitchers, {});
});
test('7e. pitcher entries: junk entries dropped, fields coerced, huge counts clamped', () => {
  const g = normalizeLiveGame({ id: 'x', pitchers: {
    a: { pitches: '1e9', status: 'weird', order: 'z', enteredAt: {}, leftAt: 'q' },
    b: null, c: 5, d: 'str', e: { pitches: 1e300, status: 'left', order: 2, leftAt: 99 },
    f: [], g: { pitches: -50, status: 'active' }, nested: { pitches: { deep: { deeper: 1 } }, status: 'left' },
    h: { pitches: '1e9', status: 'active', order: 'z', enteredAt: {}, leftAt: 'q' } } });
  // Entries without a valid status ('weird', missing, arrays) are dropped (v3.8 D2 fix:
  // a stray write to a removed pitcher must not resurrect them as "active").
  assert.ok(!('a' in g.pitchers) && !('f' in g.pitchers));
  // NB: '1e9' as a STRING parses as 1 (parseInt) - acceptable, it's not a number.
  assert.deepStrictEqual(g.pitchers.h, { pitches: 1, status: 'active', order: 0, enteredAt: 0, leftAt: null });
  assert.ok(!('b' in g.pitchers) && !('c' in g.pitchers) && !('d' in g.pitchers));
  const { pitches: _ignored, ...eRest } = g.pitchers.e; // 1e300 clamping covered by 7e2
  assert.deepStrictEqual(eRest, { status: 'left', order: 2, enteredAt: 0, leftAt: 99 });
  assert.strictEqual(g.pitchers.g.pitches, 0);
  assert.strictEqual(g.pitchers.nested.pitches, 0);
});
test('7e2. numeric counts >= 1e21 clamp to LIVE_MAX_COUNT (not parseInt exponent garbage -> 1)', () => {
  // parseInt(1e21) === 1 because String(1e21) === "1e+21".
  [1e21, 1e300, Number.MAX_VALUE].forEach(v => assert.strictEqual(sanitizeLiveCount(v), LIVE_MAX_COUNT, String(v)));
});
test('7f. "__proto__" pitcher key does not pollute Object.prototype', () => {
  const raw = JSON.parse('{"id":"x","pitchers":{"__proto__":{"pitches":5,"status":"active"},"constructor":{"pitches":3},"a":{"pitches":2,"status":"active"}}}');
  const g = normalizeLiveGame(raw);
  assert.strictEqual(({}).pitches, undefined);
  assert.strictEqual(({}).status, undefined);
  assert.strictEqual(Object.prototype.pitches, undefined);
  const ids = getLiveGamePitcherIds(g);
  assert.ok(ids.includes('a'));
  assert.ok(!ids.includes('__proto__'));
  // Pitcher lookups must still work and not resolve inherited props for normal ids.
  assert.strictEqual(getLivePitcherBudget(pitcher('zz'), g, []).inGame, false);
});
test('7g. raw.__proto__ at top-level is ignored', () => {
  const raw = JSON.parse('{"id":"x","__proto__":{"polluted":1},"pitchers":{}}');
  normalizeLiveGame(raw);
  assert.strictEqual(({}).polluted, undefined);
});
test('7h. startedBy and opponent bounded', () => {
  const g = normalizeLiveGame({ id: 'x', startedBy: 'y'.repeat(10000), opponent: 'z'.repeat(10000) });
  assert.strictEqual(g.startedBy.length, 60);
  assert.strictEqual(g.opponent.length, LIVE_OPPONENT_MAX);
});
test('7i. 5000 pitcher entries normalizes quickly', () => {
  const pitchers = {};
  for (let i = 0; i < 5000; i++) pitchers['p' + i] = { pitches: i, status: i % 2 ? 'left' : 'active', order: 5000 - i };
  const t0 = Date.now();
  const g = normalizeLiveGame({ id: 'x', pitchers });
  const ids = getLiveGamePitcherIds(g);
  assert.strictEqual(ids.length, 5000);
  assert.strictEqual(ids[0], 'p4999');
  assert.ok(Date.now() - t0 < 1000);
});
test('7j. idempotent: normalize(normalize(x)) deep-equals normalize(x)', () => {
  const raw = { id: 'x', date: '2026-10-23', context: 'tA', opponent: ' H ', startedAt: 5, startedBy: 'C',
    pitchers: { a: { pitches: 7, status: 'left', order: 1, enteredAt: 1, leftAt: 2 } } };
  const once = normalizeLiveGame(raw);
  assert.deepStrictEqual(normalizeLiveGame(once), once);
});
test('7k. getLiveGamePitcherIds: order then id tiebreak; null-safe', () => {
  const g = normalizeLiveGame({ id: 'x', pitchers: { b: { order: 1, status: 'active' }, a: { order: 1, status: 'left' }, c: { order: 0, status: 'left' } } });
  assert.deepStrictEqual(getLiveGamePitcherIds(g), ['c', 'a', 'b']);
  assert.deepStrictEqual(getLiveGamePitcherIds(null), []);
  assert.deepStrictEqual(getLiveGamePitcherIds({}), []);
});
test('7l. budget for every hostile normalized game never throws', () => {
  const raws = [{ id: 'x', context: 'tA', date: '2026-10-23', pitchers: { a: { pitches: 'x' } } },
    { id: 'x', context: '__proto__', pitchers: { a: {} } }, { id: 'x', context: 'constructor' }];
  raws.forEach(r => {
    const g = normalizeLiveGame(r);
    const b = getLivePitcherBudget(pitcher('a'), g, TOURNEYS);
    assert.strictEqual(typeof b.pitchesLeft, 'number');
    assert.ok(!isNaN(b.pitchesLeft));
    liveGameToLogEntries(g, TOURNEYS, 'S');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Timezone-sensitive date math (run under several TZs)
// ════════════════════════════════════════════════════════════════════════════
test('8a. tourney day numbers / doubleheader math independent of TZ (' + (process.env.TZ || 'default') + ')', () => {
  assert.strictEqual(getTourneyDayNumber(T, '2026-10-23'), 1);
  assert.strictEqual(getTourneyDayNumber(T, '2026-10-25'), 3);
  assert.strictEqual(getTourneyDayNumber(T, '2026-10-26'), null);
  const p = pitcher('a', [h({ date: '2026-10-19', pitches: 21 })]); // 1 rest -> eligible 10-21
  assert.strictEqual(getLivePitcherBudget(p, game({ date: '2026-10-20' }), []).eligible, false);
  assert.strictEqual(getLivePitcherBudget(p, game({ date: '2026-10-21' }), []).eligible, true);
  // DST boundary (US: Nov 1 2026; NZ: Sep 27 2026 / Apr 5 2026)
  ['2026-11-01', '2026-09-27', '2026-04-05', '2026-03-08'].forEach(d => {
    const q = pitcher('a', [h({ date: d, pitches: 61 })]); // 3 rest -> eligible d+4
    assert.strictEqual(getEligibleDateStr(q, []), addDays(d, 4));
    assert.strictEqual(getLivePitcherBudget(q, game({ date: addDays(d, 3) }), []).eligible, false);
    assert.strictEqual(getLivePitcherBudget(q, game({ date: addDays(d, 4) }), []).eligible, true);
  });
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(normalizeLiveGame({ id: 'x' }).date));
});

console.log('');
console.log(`${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) { console.log('\nFailed tests:'); failures.forEach(f => console.log(`  - ${f.name}`)); }
process.exitCode = failed > 0 ? 1 : 0;
