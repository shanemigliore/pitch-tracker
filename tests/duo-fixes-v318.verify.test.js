#!/usr/bin/env node
// Independent verification of v3.18 (Duo fixes) - logic + static checks.
// Written against the user's stated requirements, not the implementation:
//  6. Log Game / Live "Log Complete Game" warn (warn-and-override) when a
//     pitcher's REGULAR-season total for the day (already logged that date +
//     this game) goes over maxPitches. Exactly maxPitches is allowed.
//     Tournament games keep their own rules. Edit modals don't warn.
//  2. Live display order is display-only: the logged entry order is unchanged.
//  + static: version bump, pane helpers, no stickyPane leftovers, no new XSS
//    surfaces, Firebase write paths untouched, collision rule.
// Run: node tests/duo-fixes-v318.verify.test.js
'use strict';
const assert = require('assert');
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const L = require('../lib/pitch-logic.js');
const { getGameLogCheck, setCurrentRules, DEFAULT_RULES, todayStr, addDays, formatDate,
  liveGameToLogEntries, getLiveGamePitcherIds, getLivePitcherBudget } = L;
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  setCurrentRules({ ...DEFAULT_RULES });
  try { fn(); passed++; console.log('PASS  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + (e && e.message)); }
}

const T = todayStr(), Y = addDays(T, -1), PAST = '2026-03-14';
const h = (date, pitches, extra = {}) => ({ gameId: 'g' + Math.random(), date, pitches, opponent: 'X', isTournament: false,
  tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId: null, ...extra });
const P = history => ({ id: 'p1', name: 'P', jersey: '1', lastPitches: 0, lastGameDate: '', history });
const reg = (p, date, count, tournaments = []) => getGameLogCheck(p, { context: 'regular', tourney: null, date, count, tournaments });

// ── 6. daily max: functionality ──────────────────────────────────────────────
test('6a. 20 earlier today + 50 now = 70 -> violation mentioning 70 and the 55p max', () => {
  const c = reg(P([h(T, 20)]), T, 50);
  assert.ok(c && c.level === 'violation', JSON.stringify(c));
  assert.ok(/70p/.test(c.message) && /55p daily max/.test(c.message) && /earlier today/.test(c.message), c.message);
});
test('6b. boundary: 20 + 35 = 55 -> allowed (null); 20 + 36 = 56 -> violation', () => {
  assert.strictEqual(reg(P([h(T, 20)]), T, 35), null);
  const c = reg(P([h(T, 20)]), T, 36);
  assert.ok(c && c.level === 'violation' && /56p/.test(c.message), JSON.stringify(c));
});
test('6c. single game, no prior: 55 allowed, 56 violation ("56p — over the 55p daily max")', () => {
  assert.strictEqual(reg(P([]), T, 55), null);
  const c = reg(P([]), T, 56);
  assert.ok(c && c.level === 'violation' && /^56p/.test(c.message) && /55p daily max/.test(c.message), JSON.stringify(c));
});
test('6d. past date: message says "earlier on <date>" not "earlier today"', () => {
  const c = reg(P([h(PAST, 10)]), PAST, 50);
  assert.ok(c && c.message.includes('earlier on ' + formatDate(PAST)) && !/today/.test(c.message), c && c.message);
});
test('6e. only same-date regular games count: yesterday 20 + today 50 -> fine (rest from yesterday is 0)', () => {
  assert.strictEqual(reg(P([h(addDays(T, -5), 20)]), T, 50), null);
});
test('6f. same-date TOURNAMENT outings are not added to the regular-season day total', () => {
  const tour = { id: 'tt', name: 'T', startDate: T, days: 1, dayLimits: [{ max: 50, isHard: true }], maxTotal: 100 };
  const p = P([h(T, 15, { isTournament: true, tournamentId: 'tt', tournamentName: 'T', tourneyDay: 1 })]);
  // 15 (tourney) is not counted: 50 alone <= 55. (Rest from a tournament starts after it ends.)
  const c = reg(p, T, 50, [tour]);
  assert.ok(!c || !/daily max/.test(c.message), JSON.stringify(c));
});
test('6g. rest owed (21+ earlier today) still reports the rest message, not the daily-max one', () => {
  const c = reg(P([h(T, 30)]), T, 40);
  assert.ok(c && c.level === 'violation' && /eligible/.test(c.message) && !/daily max/.test(c.message), JSON.stringify(c));
});
test('6h. custom team rules: maxPitches 75 -> 20 + 55 = 75 ok, 20 + 56 violation "over the 75p daily max"', () => {
  setCurrentRules({ maxPitches: 75, rest1: 20, rest2: 40, rest3: 60 });
  assert.strictEqual(reg(P([h(T, 20)]), T, 55), null);
  const c = reg(P([h(T, 20)]), T, 56);
  assert.ok(c && /over the 75p daily max/.test(c.message), JSON.stringify(c));
});
test('6i. tournament context unaffected: 60 in a tournament day with limits 70/hard, 100 total -> no daily-max violation', () => {
  const tour = { id: 'tt', name: 'T', startDate: T, days: 2, dayLimits: [{ max: 70, isHard: true }, { max: 70, isHard: true }], maxTotal: 100 };
  const c = getGameLogCheck(P([]), { context: 'tt', tourney: tour, date: T, count: 60, tournaments: [tour] });
  assert.strictEqual(c, null, JSON.stringify(c));
  // and the tournament's own rules still apply
  const c2 = getGameLogCheck(P([]), { context: 'tt', tourney: tour, date: T, count: 71, tournaments: [tour] });
  assert.ok(c2 && c2.level === 'violation' && /Day 1 limit/.test(c2.message), JSON.stringify(c2));
});
test('6j. Live budget and Log check agree on the boundary: pitchesLeft 0 at 20+35 -> check null; -1 -> violation', () => {
  const p = P([h(T, 20)]);
  const live = n => ({ id: 'L', date: T, context: 'regular', opponent: 'X', pitchers: { p1: { pitches: n, status: 'active', order: 0, enteredAt: 1, leftAt: null } } });
  assert.strictEqual(getLivePitcherBudget(p, live(35), []).pitchesLeft, 0);
  assert.strictEqual(reg(p, T, 35), null);
  assert.strictEqual(getLivePitcherBudget(p, live(36), []).pitchesLeft, -1);
  assert.ok(reg(p, T, 36));
});

// ── 6. daily max: security / hostile input ──────────────────────────────────
const noNaN = c => { if (c) { assert.ok(!/NaN|undefined|Infinity/.test(c.message), c.message); } };
test('6s1. string pitches in history ("20") are numeric-summed, not concatenated', () => {
  const c = reg(P([h(T, '20')]), T, 36);
  assert.ok(c && /56p/.test(c.message) && /20p earlier today/.test(c.message), JSON.stringify(c));
  noNaN(c);
});
test('6s2. NaN / garbage / null pitches in history do not throw or leak NaN', () => {
  for (const bad of [NaN, 'abc', null, undefined, {}, [], '']) {
    const c = reg(P([h(T, bad)]), T, 56); assert.ok(c && c.level === 'violation'); noNaN(c);
    assert.strictEqual(reg(P([h(T, bad)]), T, 10), null);
  }
});
test('6s3. missing history / null history -> no throw, single-game cap still applies', () => {
  const p = { id: 'x', name: 'x', jersey: '1' };
  assert.strictEqual(reg(p, T, 55), null);
  assert.ok(reg(p, T, 56));
  assert.ok(reg({ ...p, history: null }, T, 56));
});
test('6s4. hostile count (string, NaN, negative, huge) -> no throw, no NaN in message', () => {
  // (Infinity is excluded: both callers sanitize first - GameLogScreen parseInt, Live sanitizeLiveCount;
  //  passed directly it yields "Infinityp" in the message, see 6s8.)
  for (const cnt of ['56', 'abc', NaN, -5, 1e9, null, undefined]) {
    let c; assert.doesNotThrow(() => { c = reg(P([h(T, 10)]), T, cnt); }); noNaN(c);
  }
  assert.ok(reg(P([]), T, 1e9), 'huge count must warn');
  assert.ok(/1000000000p/.test(reg(P([]), T, 1e9).message));
});
test('6s5. huge prior history counts (1e9) -> warns, finite number in message', () => {
  const c = reg(P([h(T, 1e9)]), T, 1); // >rest3 -> rest block wins, still must not throw
  assert.ok(c && c.level === 'violation'); noNaN(c);
});
test('6s6. history entries with missing/invalid date are ignored for the day total', () => {
  assert.strictEqual(reg(P([h('', 50), h('garbage', 50), h(null, 50)]), T, 55), null);
});
test('6s7. INFO: negative pitches in history lower the day total (same as getOutings / Live budget)', () => {
  // Not a hard requirement - documents behaviour: -30 logged + 60 now = 30 -> no daily-max warning,
  // although this game alone is 60 > 55. Only reachable via a hostile direct DB write.
  const c = reg(P([h(T, -30)]), T, 60);
  console.log('      (info) -30 earlier + 60 now ->', c ? c.message : 'null (no warning)');
});

test('6s8. INFO: Infinity count passed directly (unreachable from the UI)', () => {
  const c = reg(P([h(T, 10)]), T, Infinity);
  console.log('      (info) Infinity count ->', c ? c.message : 'null');
});

// ── 2. Live: logged entry order unchanged ────────────────────────────────────
test('2a. liveGameToLogEntries keeps entry (order) order regardless of status/display order', () => {
  const lg = { id: 'L', date: T, context: 'regular', opponent: 'X', pitchers: {
    c: { pitches: 5, status: 'active', order: 2, enteredAt: 3, leftAt: null },
    a: { pitches: 10, status: 'left', order: 0, enteredAt: 1, leftAt: 2 },
    b: { pitches: 7, status: 'left', order: 1, enteredAt: 2, leftAt: 3 } } };
  const { entries } = liveGameToLogEntries(lg, [], 'sg');
  assert.deepStrictEqual(entries.map(e => e.playerId), ['a', 'b', 'c']);
  assert.deepStrictEqual(getLiveGamePitcherIds(lg), ['a', 'b', 'c']);
});

// ── static checks ────────────────────────────────────────────────────────────
test('S1. version bumped to v3.18 in both places (and they match)', () => {
  const html = read('index.html');
  const meta = (html.match(/<meta name="app-version" content="([^"]+)"/) || [])[1];
  const cst = (html.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
  assert.strictEqual(meta, 'v3.18'); assert.strictEqual(cst, 'v3.18');
});
test('S2. stickyPane fully removed (no stale references), pane helpers exported + destructured', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'components'))) assert.ok(!/stickyPane/.test(read('components/' + f)), f);
  assert.ok(!/stickyPane/.test(read('index.html')) && !/stickyPane/.test(read('lib/ui-constants.js')));
  const uc = read('lib/ui-constants.js');
  assert.ok(/window\.UIConstants = \{[^}]*paneScreen[^}]*paneGrid[^}]*paneScroll/.test(uc));
  assert.ok(/const \{[^}]*paneScreen, paneGrid, paneScroll \} = window\.UIConstants/.test(read('index.html')));
});
test('S3. every component using a pane helper / rail prop gets it (rail passed to Live, Settings)', () => {
  const app = read('components/App.js');
  assert.ok(/<LiveGameScreen[^>]*rail=\{layout\.rail\}/.test(app));
  assert.ok(/<Settings[\s\S]*?rail=\{layout\.rail\}/.test(app));
  for (const f of ['LiveGameScreen', 'Settings', 'SeasonHistory', 'GameLogScreen']) {
    const s = read(`components/${f}.js`);
    if (/paneScroll\(rail\)/.test(s)) assert.ok(new RegExp(`function ${f}\\([^)]*rail`).test(s), f + ' uses rail but does not take it');
  }
});
test('S4. collision rule: components/*.js have exactly one top-level declaration', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'components'))) {
    const src = read('components/' + f);
    const top = src.split('\n').filter(l => /^(const|let|var|class|function)\b/.test(l));
    const allowed = f === 'App.js' || f === 'shared.js' || f === 'Settings.js' ? null : 1;
    assert.ok(!top.some(l => /^(let|var)\b/.test(l)), f + ': ' + top.join(' | '));
    if (allowed) assert.strictEqual(top.length, allowed, f + ': ' + top.join(' | '));
  }
});
test('S5. no new HTML-injection surfaces (no dangerouslySetInnerHTML / innerHTML in changed files)', () => {
  for (const f of ['components/App.js', 'components/LiveGameScreen.js', 'components/SeasonHistory.js', 'components/Settings.js',
    'components/GameLogScreen.js', 'components/EligibilityScreen.js', 'components/PitcherDetail.js', 'lib/ui-constants.js', 'lib/pitch-logic.js'])
    assert.ok(!/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(read(f)), f);
});
test('S6. Firebase write paths untouched by v3.18 (lib/firebase-init.js unchanged vs v3.17)', () => {
  let base;
  try { base = cp.execSync('git log --format=%H -1 --grep="v3.17" -- index.html', { cwd: ROOT }).toString().trim(); } catch { base = ''; }
  const diff = cp.execSync(`git diff ${base || 'HEAD~1'} -- lib/firebase-init.js`, { cwd: ROOT }).toString();
  assert.strictEqual(diff, '', diff.slice(0, 300));
  // and no component started calling a new __fb* write function
  const used = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'components'))) for (const m of read('components/' + f).matchAll(/__fb\w+/g)) used.add(m[0]);
  const known = ['__fbMigrateIfNeeded', '__fbCreatePrime12U', '__fbCreatePrime10U', '__fbListTeams', '__fbCreateTeam', '__fbUpdateTeamMeta',
    '__fbDeleteTeam', '__fbSubscribe', '__fbSet', '__fbMigrateSeasonIfNeeded', '__fbListSeasons', '__fbCreateSeason', '__fbWatchLiveGame',
    '__fbStartLiveGame', '__fbMutateLiveGame', '__fbClaimLiveGame', '__fbGetRoster', '__fbSignIn', '__fbOnAuthChange', '__fbRoleForUser', '__fbSignOut'];
  for (const u of used) assert.ok(known.includes(u), 'unknown firebase call ' + u);
});
test('S7. edit modals do not call the new daily-max check (getGameLogCheck)', () => {
  for (const f of ['EditGameModal', 'EditGameGroupModal', 'PitcherDetail', 'SeasonHistory'])
    assert.ok(!/getGameLogCheck/.test(read(`components/${f}.js`)), f);
  assert.ok(/getGameLogCheck/.test(read('components/GameLogScreen.js')) && /getGameLogCheck/.test(read('components/LiveGameScreen.js')));
});
test('S8. Live log path uses getLiveGamePitcherIds order (completeLiveGame -> liveGameToLogEntries), not display order', () => {
  const app = read('components/App.js');
  assert.ok(/liveGameToLogEntries\(/.test(app));
  assert.ok(!/inGameIds/.test(app));
});
test('S9. CLAUDE.md current version updated to v3.18', () => {
  assert.ok(/\*\*Current version:\*\* v3\.18/.test(read('CLAUDE.md')));
});

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
process.exit(failed ? 1 : 0);
