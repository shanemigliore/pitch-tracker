#!/usr/bin/env node
/**
 * Independent verification suite for v3.7 tournament eligibility:
 * per-day tournament limits (hard / guideline), tournament total, no rest
 * between tournament days, pre-tournament rest carry-in, CPYL post-tournament
 * rest, and robustness against malformed / RTDB-shaped data.
 *
 * Run with: node tests/eligibility-v37.test.js
 * Also worth running under several time zones, e.g.
 *   TZ=America/New_York node tests/eligibility-v37.test.js
 *   TZ=Pacific/Auckland node tests/eligibility-v37.test.js
 */

'use strict';

const assert = require('assert');
const L = require('../lib/pitch-logic.js');

// ── Minimal test harness ────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  try {
    L.setCurrentRules(null); // reset to DEFAULT_RULES (10U: 20/40/60) for every test
    fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`FAIL  ${name}`);
    console.log(`      ${String(e.message).split('\n').join('\n      ')}`);
  }
}

// ── Fixtures ────────────────────────────────────────────────────────────
let gid = 0;
function tg(tourney, date, pitches, extra) {
  return Object.assign({
    gameId: 'g' + (++gid), date, pitches, opponent: 'X',
    isTournament: true, tournamentId: tourney.id, tournamentName: tourney.name,
    tourneyDay: L.getTourneyDayNumber(tourney, date), sharedGameId: null,
  }, extra || {});
}
function rg(date, pitches, extra) {
  return Object.assign({
    gameId: 'g' + (++gid), date, pitches, opponent: 'Y',
    isTournament: false, tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null,
  }, extra || {});
}
function pitcher(history) {
  const last = L.recomputeLast(history);
  return { id: 'p' + (++gid), name: 'P', jersey: '1', history, ...last };
}
function tourney(over) {
  return Object.assign({
    id: 't1', name: 'T', startDate: '2026-10-23', days: 3, // Fri–Sun
    dayLimits: [{ max: 50, isHard: true }, { max: 50, isHard: true }, { max: 50, isHard: true }],
    maxTotal: 100,
  }, over || {});
}
// Fri/Sat/Sun pitches -> eligible-date string for regular season
function cpyl(fri, sat, sun, t) {
  t = t || tourney();
  const days = [fri, sat, sun];
  const hist = [];
  days.forEach((n, i) => { if (n > 0) hist.push(tg(t, L.addDays(t.startDate, i), n)); });
  return L.getEligibleDateStr(pitcher(hist), [t]);
}
const FRI = '2026-10-23', SAT = '2026-10-24', SUN = '2026-10-25',
      MON = '2026-10-26', TUE = '2026-10-27', WED = '2026-10-28', THU = '2026-10-29';

console.log(`TZ=${process.env.TZ || '(system)'}  offset(min)=${new Date('2026-10-20T12:00:00').getTimezoneOffset()}`);

// ── 1. Date math ────────────────────────────────────────────────────────
test('1a. addDays crosses month/year boundaries', () => {
  assert.strictEqual(L.addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(L.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(L.addDays('2028-02-28', 1), '2028-02-29');
});
test('1b. addDays across US DST (Mar 8 / Nov 1 2026) and NZ DST (Apr 5 / Sep 27 2026)', () => {
  assert.strictEqual(L.addDays('2026-03-07', 1), '2026-03-08');
  assert.strictEqual(L.addDays('2026-03-08', 1), '2026-03-09');
  assert.strictEqual(L.addDays('2026-10-31', 2), '2026-11-02');
  assert.strictEqual(L.addDays('2026-04-04', 2), '2026-04-06');
  assert.strictEqual(L.addDays('2026-09-26', 2), '2026-09-28');
});
test('1c. addDays(x, 1) is the next calendar day for every day of 2026', () => {
  let d = new Date(Date.UTC(2026, 0, 1));
  for (let i = 0; i < 365; i++) {
    const s = d.toISOString().slice(0, 10);
    const n = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
    assert.strictEqual(L.addDays(s, 1), n, `addDays(${s},1)`);
    d = new Date(d.getTime() + 86400000);
  }
});
test('1d. getTourneyDayNumber across DST weekend (Oct 30–Nov 1 2026)', () => {
  const t = tourney({ startDate: '2026-10-30' });
  assert.strictEqual(L.getTourneyDayNumber(t, '2026-10-30'), 1);
  assert.strictEqual(L.getTourneyDayNumber(t, '2026-10-31'), 2);
  assert.strictEqual(L.getTourneyDayNumber(t, '2026-11-01'), 3);
  assert.strictEqual(L.getTourneyDayNumber(t, '2026-11-02'), null);
  assert.strictEqual(L.getTourneyDayNumber(t, '2026-10-29'), null);
  assert.strictEqual(L.getTourneyEndDate(t), '2026-11-01');
});
test('1e. getEligibleDateStr across US DST start (Fri Mar 6–Sun Mar 8): 33/0/0 -> Mon Mar 9', () => {
  const t = tourney({ startDate: '2026-03-06' });
  assert.strictEqual(cpyl(33, 0, 0, t), '2026-03-09');
  assert.strictEqual(cpyl(4, 20, 42, t), '2026-03-12');
});

// ── 2. CPYL examples (Fri–Sun) ──────────────────────────────────────────
test('2a. CPYL 33/0/0 -> Monday', () => assert.strictEqual(cpyl(33, 0, 0), MON));
test('2b. CPYL 28/0/2 -> Tuesday', () => assert.strictEqual(cpyl(28, 0, 2), TUE));
test('2c. CPYL 10/15/19 -> Wednesday', () => assert.strictEqual(cpyl(10, 15, 19), WED));
test('2d. CPYL 4/20/42 -> Thursday', () => assert.strictEqual(cpyl(4, 20, 42), THU));

// ── 3. Owner examples (3-day) ───────────────────────────────────────────
test('3a. 20/0/5 = 25 -> first rest day is day after tournament (Mon), eligible Tue', () =>
  assert.strictEqual(cpyl(20, 0, 5), TUE));
test('3b. 25/0/0 -> 1 rest day served on day 2; eligible day after tournament ends (Mon)', () =>
  assert.strictEqual(cpyl(25, 0, 0), MON));
test('3c. 25/45/0 = 70 -> 3 rest days starting day 3, eligible day 6 (Wed)', () =>
  assert.strictEqual(cpyl(25, 45, 0), WED));

// ── 4. Rest thresholds boundaries (sum of tournament pitches) ───────────
// Single Sunday outing so the "day after tournament" floor doesn't hide anything.
// (<=threshold totals still owe the floor - eligible Mon - per the CPYL
// "can't pitch until after the tournament" rule; see test 5a.)
function sunOnly(n) { return cpyl(0, 0, n); }
test('4a. 10U boundary 20 vs 21 (Sun-only outing)', () => {
  assert.strictEqual(sunOnly(20), MON, '20 -> no rest days, floor only');
  assert.strictEqual(sunOnly(21), TUE, '21 -> 1 rest (Mon) -> Tue');
});
test('4b. 10U boundary 40 vs 41', () => {
  assert.strictEqual(sunOnly(40), TUE);
  assert.strictEqual(sunOnly(41), WED);
});
test('4c. 10U boundary 60 vs 61', () => {
  assert.strictEqual(sunOnly(60), WED);
  assert.strictEqual(sunOnly(61), THU);
});
test('4d. Sum across days crosses boundary: 10/10/0 (=20) none, 10/11/0 (=21) -> Mon', () => {
  assert.strictEqual(cpyl(10, 10, 0), MON);
  assert.strictEqual(cpyl(10, 11, 0), MON);
});
test('4e. 12U thresholds 25/45/65 (Sun-only outing)', () => {
  L.setCurrentRules({ maxPitches: 85, rest1: 25, rest2: 45, rest3: 65 });
  assert.strictEqual(sunOnly(25), MON);
  assert.strictEqual(sunOnly(26), TUE);
  assert.strictEqual(sunOnly(45), TUE);
  assert.strictEqual(sunOnly(46), WED);
  assert.strictEqual(sunOnly(65), WED);
  assert.strictEqual(sunOnly(66), THU);
  // 33/0/0 under 12U -> 1 rest (Sat), floor Mon
  assert.strictEqual(cpyl(33, 0, 0), MON);
});

// ── 5. Floor: never eligible for regular season before day after tournament ends
test('5a. REQ: <=20 total still cannot pitch a regular-season game mid-tournament (Sat)', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 10)]);
  // Regular-season eligibility "can never begin before the day after the tournament ends".
  const status = L.getAvailabilityStatus(p, SAT, [t]);
  assert.notStrictEqual(status, 'available', `status on Sat = ${status}; eligible str = ${L.getEligibleDateStr(p, [t])}`);
});
test('5b. >20 total mid-tournament: regular-season view shows not available Sat, available Mon', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 33)]);
  assert.notStrictEqual(L.getAvailabilityStatus(p, SAT, [t]), 'available');
  assert.strictEqual(L.getAvailabilityStatus(p, MON, [t]), 'available');
  assert.strictEqual(L.daysUntilEligible(p, SAT, [t]), 2);
});

// ── 6. Regular-season games during post-tournament rest don't shorten it ─
test('6a. regular game on Mon during rest (from 4/20/42) does not shorten Thursday', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 4), tg(t, SAT, 20), tg(t, SUN, 42), rg(MON, 5)]);
  assert.strictEqual(L.getEligibleDateStr(p, [t]), THU);
});
test('6b. regular game whose own rest ends later extends eligibility', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 33), rg(TUE, 50)]); // 50 -> 2 rest (Wed,Thu) -> Fri
  assert.strictEqual(L.getEligibleDateStr(p, [t]), '2026-10-30');
});
test('6c. before option: excludes outings on/after the date', () => {
  const t = tourney();
  const p = pitcher([rg('2026-10-20', 45), tg(t, FRI, 60)]);
  // 45 on Tue -> 2 rest (Wed, Thu) -> Fri
  assert.strictEqual(L.getEligibleDateStr(p, [t], { before: FRI }), FRI);
  assert.strictEqual(L.getEligibleDateStr(p, [t], { before: '2026-10-20' }), null);
  assert.strictEqual(L.getEligibleDateStr(p, [t]), MON); // 60 on Fri -> 2 rest (Sat, Sun) -> Mon; floor Mon
});

// ── 7. In-tournament eligibility ────────────────────────────────────────
test('7a. no rest between tournament days: 49 Fri (hard 50) -> eligible Sat', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 49)]);
  const e = L.getTourneyEligibility(p, t, SAT, [t]);
  assert.strictEqual(e.eligible, true, e.reason);
  assert.strictEqual(e.dayNum, 2);
  assert.strictEqual(e.dayPitches, 0);
  assert.strictEqual(e.remainingTotal, 51);
  assert.strictEqual(e.pitchesLeft, 50);
});
test('7b. hard daily limit: 49 -> still eligible today, 50 (exact) -> done today, back tomorrow', () => {
  const t = tourney();
  let e = L.getTourneyEligibility(pitcher([tg(t, FRI, 49)]), t, FRI, [t]);
  assert.strictEqual(e.eligible, true);
  assert.strictEqual(e.pitchesLeft, 1);
  const p = pitcher([tg(t, FRI, 50)]);
  e = L.getTourneyEligibility(p, t, FRI, [t]);
  assert.strictEqual(e.eligible, false);
  assert.ok(/Day 1 limit/.test(e.reason), e.reason);
  assert.strictEqual(L.getTourneyEligibility(p, t, SAT, [t]).eligible, true);
});
test('7c. multiple games on the same tournament day sum toward the daily limit', () => {
  const t = tourney();
  const p = pitcher([tg(t, SAT, 30), tg(t, SAT, 20)]);
  const e = L.getTourneyEligibility(p, t, SAT, [t]);
  assert.strictEqual(e.dayPitches, 50);
  assert.strictEqual(e.eligible, false);
  const v = L.getTourneyLimitViolation(pitcher([tg(t, SAT, 30)]), t, SAT, 20, [t]);
  assert.strictEqual(v, null, 'reaching exactly 50 across two games is allowed');
  const v2 = L.getTourneyLimitViolation(pitcher([tg(t, SAT, 30)]), t, SAT, 21, [t]);
  assert.strictEqual(v2 && v2.level, 'violation');
  assert.ok(/finishing a batter/.test(v2.message), v2.message);
});
test('7d. total limit: 99 -> eligible (1 left); 100 exact -> out for the rest of the tournament', () => {
  const t = tourney();
  let e = L.getTourneyEligibility(pitcher([tg(t, FRI, 50), tg(t, SAT, 49)]), t, SUN, [t]);
  assert.strictEqual(e.eligible, true);
  assert.strictEqual(e.pitchesLeft, 1);
  const p = pitcher([tg(t, FRI, 50), tg(t, SAT, 50)]);
  e = L.getTourneyEligibility(p, t, SUN, [t]);
  assert.strictEqual(e.eligible, false);
  assert.ok(/tournament limit/.test(e.reason), e.reason);
});
test('7e. guideline day never affects eligibility, even well over', () => {
  const t = tourney({ dayLimits: [{ max: 30, isHard: false }, { max: 30, isHard: true }, { max: 30, isHard: true }] });
  const p = pitcher([tg(t, FRI, 45)]);
  const e = L.getTourneyEligibility(p, t, FRI, [t]);
  assert.strictEqual(e.eligible, true, e.reason);
  assert.strictEqual(e.remainingToday, null);
  assert.strictEqual(e.atGuideline, true);
  const v = L.getTourneyLimitViolation(pitcher([]), t, FRI, 45, [t]);
  assert.strictEqual(v && v.level, 'note');
  assert.strictEqual(L.getTourneyLimitViolation(pitcher([]), t, FRI, 30, [t]), null, 'exactly at guideline: no note');
});
test('7f. daily limits may sum above total; total still enforced on day 3', () => {
  const t = tourney(); // 50+50+50 > 100
  const p = pitcher([tg(t, FRI, 50), tg(t, SAT, 40)]);
  const e = L.getTourneyEligibility(p, t, SUN, [t]);
  assert.strictEqual(e.eligible, true);
  assert.strictEqual(e.pitchesLeft, 10, 'min(day 50, total 10)');
  assert.strictEqual(L.getTourneyLimitViolation(p, t, SUN, 10, [t]), null);
  const v = L.getTourneyLimitViolation(p, t, SUN, 11, [t]);
  assert.strictEqual(v && v.level, 'violation');
  assert.ok(/tournament limit/.test(v.message) && /finishing a batter/.test(v.message), v.message);
});
test('7g. violation when already at a limit before this game', () => {
  const t = tourney();
  const v = L.getTourneyLimitViolation(pitcher([tg(t, FRI, 50)]), t, FRI, 1, [t]);
  assert.strictEqual(v && v.level, 'violation');
  assert.ok(/Already at Day 1/.test(v.message), v.message);
  const v2 = L.getTourneyLimitViolation(pitcher([tg(t, FRI, 50), tg(t, SAT, 50)]), t, SUN, 1, [t]);
  assert.ok(v2 && /Already at tournament limit/.test(v2.message));
});
test('7h. out-of-range game date is a violation', () => {
  const t = tourney();
  const v = L.getTourneyLimitViolation(pitcher([]), t, MON, 10, [t]);
  assert.strictEqual(v && v.level, 'violation');
  assert.strictEqual(L.getTourneyEligibility(pitcher([]), t, MON, [t]).eligible, false);
});
test('7i. date before tournament is evaluated as Day 1', () => {
  const t = tourney();
  const e = L.getTourneyEligibility(pitcher([]), t, '2026-10-20', [t]);
  assert.strictEqual(e.eligible, true);
  assert.strictEqual(e.dayNum, 1);
});

// ── 8. Pre-tournament rest carry-in ─────────────────────────────────────
test('8a. 61 on Wed before Fri tournament -> 3 rest (Thu,Fri,Sat) -> not eligible Fri/Sat, eligible Sun', () => {
  const t = tourney();
  const p = pitcher([rg('2026-10-21', 61)]);
  assert.strictEqual(L.getTourneyEligibility(p, t, FRI, [t]).eligible, false);
  assert.strictEqual(L.getTourneyEligibility(p, t, SAT, [t]).eligible, false);
  assert.strictEqual(L.getTourneyEligibility(p, t, SUN, [t]).eligible, true);
  const v = L.getTourneyLimitViolation(p, t, SAT, 10, [t]);
  assert.ok(v && v.level === 'violation' && /before the tournament/.test(v.message));
  assert.strictEqual(L.getTourneyLimitViolation(p, t, SUN, 10, [t]), null);
});
test('8b. tournament-day pitches never create rest within the tournament (70 Fri guideline -> eligible Sat)', () => {
  const t = tourney({ dayLimits: [{ max: 50, isHard: false }, { max: 50, isHard: true }, { max: 50, isHard: true }] });
  const p = pitcher([tg(t, FRI, 70)]);
  assert.strictEqual(L.getTourneyEligibility(p, t, SAT, [t]).eligible, true);
  assert.strictEqual(L.getTourneyLimitViolation(p, t, SAT, 20, [t]), null);
});
test('8c. rest from a previous tournament carries into the next one', () => {
  const a = tourney({ id: 'a', startDate: '2026-10-16', days: 3 }); // Fri-Sun before
  const b = tourney({ id: 'b', startDate: '2026-10-19', days: 2 }); // Mon-Tue
  const p = pitcher([tg(a, '2026-10-18', 61)]); // Sun, 3 rest Mon-Wed
  assert.strictEqual(L.getTourneyEligibility(p, b, '2026-10-19', [a, b]).eligible, false);
});

// ── 9. Legacy & RTDB shapes ─────────────────────────────────────────────
test('9a. legacy {maxDay1, day1IsHardLimit:true, maxTotal}', () => {
  const t = { id: 'L', name: 'Legacy', startDate: FRI, days: 3, maxDay1: 55, day1IsHardLimit: true, maxTotal: 115 };
  assert.deepStrictEqual(L.getTourneyDayLimits(t), [
    { max: 55, isHard: true }, { max: 55, isHard: false }, { max: 55, isHard: false }]);
  assert.strictEqual(L.getTourneyMaxTotal(t), 115);
  // Day 2 is a guideline: 60 on Sat is only a note.
  const v = L.getTourneyLimitViolation(pitcher([tg(t, FRI, 20)]), t, SAT, 60, [t]);
  assert.strictEqual(v && v.level, 'note');
});
test('9b. legacy day1IsHardLimit:false -> all guideline', () => {
  const t = { id: 'L', startDate: FRI, days: 2, maxDay1: 40, day1IsHardLimit: false, maxTotal: 90 };
  assert.deepStrictEqual(L.getTourneyDayLimits(t), [{ max: 40, isHard: false }, { max: 40, isHard: false }]);
});
test('9c. legacy with missing maxDay1/maxTotal falls back to defaults', () => {
  const t = { id: 'L', startDate: FRI, days: 2 };
  assert.deepStrictEqual(L.getTourneyDayLimits(t), [{ max: 50, isHard: false }, { max: 50, isHard: false }]);
  assert.strictEqual(L.getTourneyMaxTotal(t), 100);
});
test('9d. RTDB object-shaped dayLimits {"0":..,"1":..,"2":..}', () => {
  const t = tourney({ dayLimits: { 0: { max: 40, isHard: true }, 1: { max: 45, isHard: false }, 2: { max: 30, isHard: true } } });
  assert.deepStrictEqual(L.getTourneyDayLimits(t), [
    { max: 40, isHard: true }, { max: 45, isHard: false }, { max: 30, isHard: true }]);
});
test('9e. RTDB sparse object (missing key "1") pads with default hard 50', () => {
  const t = tourney({ dayLimits: { 0: { max: 40, isHard: true }, 2: { max: 30, isHard: false } } });
  assert.deepStrictEqual(L.getTourneyDayLimits(t), [
    { max: 40, isHard: true }, { max: 50, isHard: true }, { max: 30, isHard: false }]);
});
test('9f. dayLimits longer than days is truncated; string values parsed', () => {
  const t = tourney({ days: '2', dayLimits: [{ max: '45', isHard: true }, { max: 35, isHard: 0 }, { max: 99, isHard: true }] });
  assert.deepStrictEqual(L.getTourneyDayLimits(t), [{ max: 45, isHard: true }, { max: 35, isHard: false }]);
});
test('9g. dayLimits with junk entries (null, max 0, negative, NaN) -> default hard 50', () => {
  const t = tourney({ days: 4, dayLimits: [null, { max: 0 }, { max: -5, isHard: false }, { max: 'abc' }] });
  L.getTourneyDayLimits(t).forEach(l => assert.deepStrictEqual(l, { max: 50, isHard: true }));
});

// ── 10. Malformed / missing data stability ──────────────────────────────
test('10a. getTourneyDays: 0/undefined/string/garbage -> >=1', () => {
  assert.strictEqual(L.getTourneyDays({ days: 0 }), 1);
  assert.strictEqual(L.getTourneyDays({}), 1);
  assert.strictEqual(L.getTourneyDays({ days: '3' }), 3);
  assert.strictEqual(L.getTourneyDays({ days: 'x' }), 1);
  assert.strictEqual(L.getTourneyDays(null), 1);
  assert.strictEqual(L.getTourneyDays({ days: -2 }), 1);
});
test('10b. tournament with no startDate: helpers return null / do not throw', () => {
  const t = tourney({ startDate: '' });
  assert.strictEqual(L.getTourneyEndDate(t), null);
  assert.strictEqual(L.getTourneyDayNumber(t, FRI), null);
  const p = pitcher([tg(t, FRI, 30)]);
  assert.doesNotThrow(() => L.getTourneyEligibility(p, t, FRI, [t]));
  assert.doesNotThrow(() => L.getAvailabilityStatus(p, SAT, [t]));
  assert.doesNotThrow(() => L.getTourneyLimitViolation(p, t, FRI, 10, [t]));
  // No start date = can't place a game on a tournament day: ineligible with a
  // clear reason (start dates are now required when creating/editing).
  const e = L.getTourneyEligibility(p, t, FRI, [t]);
  assert.strictEqual(e.dayNum, null);
  assert.strictEqual(e.eligible, false);
  assert.ok(/no start date/.test(e.reason), e.reason);
});
test('10c. days=0/undefined/string tournament behaves as 1 day / N days', () => {
  assert.strictEqual(L.getTourneyEndDate(tourney({ days: 0 })), FRI);
  assert.strictEqual(L.getTourneyEndDate(tourney({ days: undefined })), FRI);
  assert.strictEqual(L.getTourneyEndDate(tourney({ days: '3' })), SUN);
  assert.strictEqual(L.getTourneyDayNumber(tourney({ days: '3' }), SUN), 3);
});
test('10d. empty / missing history', () => {
  const t = tourney();
  for (const p of [{ id: 'a', history: [] }, { id: 'b' }, { id: 'c', history: [], lastPitches: 0, lastGameDate: '' }]) {
    assert.strictEqual(L.getAvailabilityStatus(p, SAT, [t]), 'available');
    assert.strictEqual(L.daysUntilEligible(p, SAT, [t]), 0);
    assert.strictEqual(L.getEligibleDateStr(p, [t]), null);
    assert.strictEqual(L.getTourneyEligibility(p, t, SAT, [t]).eligible, true);
    assert.strictEqual(L.getTourneyLimitViolation(p, t, SAT, 10, [t]), null);
  }
});
test('10e. entries with no date are ignored, not crashing', () => {
  const t = tourney();
  const p = { id: 'x', history: [rg('', 50), rg(undefined, 50), tg(t, undefined, 30, { tourneyDay: 2 })] };
  assert.doesNotThrow(() => L.getEligibleDateStr(p, [t]));
  assert.strictEqual(L.getEligibleDateStr(p, [t]), null);
  const st = L.getPitcherTourneyStats(p, t);
  assert.strictEqual(st.total, 30);
  assert.strictEqual(st.byDay[1], 30, 'falls back to stored tourneyDay');
});
test('10f. history references a deleted tournament', () => {
  const ghost = tourney({ id: 'gone' });
  const p = pitcher([tg(ghost, FRI, 4), tg(ghost, SAT, 20), tg(ghost, SUN, 42)]);
  assert.doesNotThrow(() => L.getEligibleDateStr(p, []));
  // 66 -> 3 rest starting Mon -> Thu (no floor available, but rest still enforced)
  assert.strictEqual(L.getEligibleDateStr(p, []), THU);
  assert.strictEqual(L.getEligibleDateStr(p, undefined), THU);
});
test('10g. NaN / null / undefined pitches treated as 0', () => {
  const t = tourney();
  const p = { id: 'n', history: [tg(t, FRI, NaN), tg(t, SAT, null), tg(t, SUN, undefined), rg(MON, NaN)] };
  assert.strictEqual(L.getEligibleDateStr(p, [t]), null);
  const st = L.getPitcherTourneyStats(p, t);
  assert.strictEqual(st.total, 0);
  assert.ok(!Number.isNaN(L.getTourneyEligibility(p, t, SUN, [t]).remainingTotal));
});
test('10h. NaN count passed to getTourneyLimitViolation does not throw', () => {
  const t = tourney();
  assert.doesNotThrow(() => L.getTourneyLimitViolation(pitcher([]), t, FRI, NaN, [t]));
});
test('10i. null tournament inputs', () => {
  assert.deepStrictEqual(L.getTourneyEligibility(pitcher([]), null, FRI, []), { eligible: true, reason: '' });
  assert.strictEqual(L.getTourneyLimitViolation(pitcher([]), null, FRI, 10, []), null);
  assert.strictEqual(L.getTourneyEndDate(null), null);
  assert.strictEqual(L.getTourneyDayNumber(null, FRI), null);
});
test('10j. pitcher with lastPitches/lastGameDate but no history still rests (defensive path)', () => {
  const p = { id: 'd', lastPitches: 45, lastGameDate: FRI };
  assert.strictEqual(L.getEligibleDateStr(p, []), MON);
});
test('10k. tournament entry whose date is outside the tournament range still counts toward totals', () => {
  const t = tourney();
  const p = { id: 'o', history: [tg(t, '2026-10-30', 40, { tourneyDay: 1 })] };
  const st = L.getPitcherTourneyStats(p, t);
  assert.strictEqual(st.total, 40);
  assert.strictEqual(st.byDay[0], 40, 'stored tourneyDay fallback');
});

// ── 11. Regular-season view after tournament ────────────────────────────
test('11a. regular-season status counts down Mon..Thu after 4/20/42', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 4), tg(t, SAT, 20), tg(t, SUN, 42)]);
  assert.strictEqual(L.daysUntilEligible(p, MON, [t]), 3);
  assert.strictEqual(L.getAvailabilityStatus(p, MON, [t]), 'resting');
  assert.strictEqual(L.getAvailabilityStatus(p, WED, [t]), 'tomorrow');
  assert.strictEqual(L.getAvailabilityStatus(p, THU, [t]), 'available');
});
test('11b. getTourneyAdjustedRestInfo reports tournament as binding outing', () => {
  const t = tourney();
  const p = pitcher([tg(t, FRI, 4), tg(t, SAT, 20), tg(t, SUN, 42)]);
  const info = L.getTourneyAdjustedRestInfo(p, [t]);
  assert.strictEqual(info.isTourney, true);
  assert.strictEqual(info.totalPitches, 66);
  assert.strictEqual(info.restDays, 3);
  assert.strictEqual(info.lastPitchDate, SUN);
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log('');
console.log(`${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - ${f.name}`));
  process.exitCode = 1;
}
