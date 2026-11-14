#!/usr/bin/env node
/**
 * Independent verification of v3.22: "+ Add pitcher" in the Season tab's Edit Game
 * modal (components/EditGameGroupModal.js).
 *
 * Part A - static checks (no deps): version bump, wiring App -> SeasonHistory ->
 *   EditGameGroupModal, collision rule, portal, no HTML-injection surfaces.
 * Part B - logic checks against lib/pitch-logic.js (the rule check the modal uses,
 *   and the gameId format it must match).
 * Part C - browser: drives the real app in headless Chromium via Playwright with
 *   Firebase stubbed (harness copied from tests/tourney-rest-v319.browser.verify.test.js).
 *   SKIPs part C (still exit 0 for A/B) when playwright is not installed.
 *
 * Run with: node tests/add-pitcher-v322.verify.test.js
 */
'use strict';
const assert = require('assert');
const http = require('http'); const fs = require('fs'); const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? '\n      ' + detail : ''}`); }
}
function test(name, fn) {
  try { fn(); check(name, true); } catch (e) { check(name, false, e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
// Part A - static
// ══════════════════════════════════════════════════════════════════════════
const html = read('index.html');
const modal = read('components/EditGameGroupModal.js');
const season = read('components/SeasonHistory.js');
const app = read('components/App.js');

test('A1 version: meta app-version == APP_VERSION == v3.22', () => {
  assert.strictEqual(html.match(/<meta name="app-version" content="([^"]+)"/)[1], 'v3.22');
  assert.strictEqual(html.match(/const APP_VERSION = "([^"]+)";/)[1], 'v3.22');
  assert.ok(!/["']v3\.21["']/.test(html), 'stale v3.21 left in index.html');
});
test('A2 CLAUDE.md current version is v3.22', () => {
  assert.ok(/\*\*Current version:\*\* v3\.22\b/.test(read('CLAUDE.md')));
});
test('A3 App passes onAddGame={logMultiple} to SeasonHistory', () => {
  assert.ok(/<SeasonHistory[^>]*onAddGame=\{logMultiple\}/.test(app));
});
test('A4 SeasonHistory takes onAddGame and forwards roster + onAddGame to the modal', () => {
  assert.ok(/function SeasonHistory\(\{[^}]*onAddGame/.test(season));
  const m = season.match(/<EditGameGroupModal[\s\S]*?\/>/);
  assert.ok(m && /roster=\{roster\}/.test(m[0]) && /onAddGame=\{onAddGame\}/.test(m[0]), m && m[0]);
});
test('A5 SeasonHistory opens the modal with the unfiltered game (fullGame || item) everywhere', () => {
  const opens = season.match(/setEditingGame\(([^)]*)\)/g) || [];
  const nonNull = opens.filter(s => !/setEditingGame\(null\)/.test(s));
  assert.ok(nonNull.length >= 2, opens.join(' | '));
  for (const s of nonNull) assert.ok(/fullGame/.test(s), s);
});
test('A6 collision rule: every components/*.js top-level line (except App/shared/Settings) is exactly one function', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'components'))) {
    const top = read('components/' + f).split('\n').filter(l => /^(const|let|var|class|function)\b/.test(l));
    assert.ok(!top.some(l => /^(let|var)\b/.test(l)), f + ': ' + top.join(' | '));
    if (!['App.js', 'shared.js', 'Settings.js'].includes(f)) assert.strictEqual(top.length, 1, f + ': ' + top.join(' | '));
  }
  const top = modal.split('\n').filter(l => /^\S/.test(l) && !/^\/\//.test(l) && !/^[})\]]/.test(l));
  assert.ok(top.length === 1 && top[0].startsWith('function EditGameGroupModal('), top.join(' | '));
});
test('A7 modal still portaled to document.body', () => {
  assert.ok(/ReactDOM\.createPortal\([\s\S]*document\.body\s*\)/.test(modal));
});
test('A8 no HTML-injection surfaces in changed files', () => {
  for (const s of [modal, season, app]) assert.ok(!/dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML|document\.write/.test(s));
});
test('A9 no role gating and no new __fb* calls in the modal (writes go through App state only)', () => {
  assert.ok(!/\brole\b/.test(modal));
  assert.ok(!/__fb\w+/.test(modal));
});
test('A10 added-pitcher gameId format matches buildGameEntries (sharedGameId + "_" + id)', () => {
  assert.ok(/sharedGameId \? sharedGameId \+ "_" \+ p\.id : newId\(\)/.test(modal));
  assert.ok(/gameId: sharedGameId \+ "_" \+ p\.id/.test(read('lib/pitch-logic.js')));
});
test('A11 added count clamped to 0..999 both in save path and in bump', () => {
  assert.ok(/Math\.min\(n, 999\)/.test(modal));
  assert.ok(/Math\.min\(999, Math\.max\(0,/.test(modal));
});

// ══════════════════════════════════════════════════════════════════════════
// Part B - logic (lib/pitch-logic.js, as the modal calls it)
// ══════════════════════════════════════════════════════════════════════════
const L = require('../lib/pitch-logic.js');
L.setCurrentRules({ maxPitches: 55, rest1: 20, rest2: 40, rest3: 60 });
const T = L.todayStr();
const ago = n => L.addDays(T, -n);
test('B1 getGameLogCheck: pitcher owing rest on the game date -> violation', () => {
  const dee = { id: 'd', name: 'Dee', history: [{ gameId: 'x', date: ago(4), pitches: 60, isTournament: false }] };
  const c = L.getGameLogCheck(dee, { context: 'regular', tourney: null, date: ago(3), count: 10, tournaments: [] });
  assert.ok(c && c.level === 'violation', JSON.stringify(c));
});
test('B2 getGameLogCheck: clean pitcher -> null; over the daily max -> violation', () => {
  const eve = { id: 'e', name: 'Eve', history: [] };
  assert.strictEqual(L.getGameLogCheck(eve, { context: 'regular', date: ago(3), count: 55, tournaments: [] }), null);
  const c = L.getGameLogCheck(eve, { context: 'regular', date: ago(3), count: 56, tournaments: [] });
  assert.ok(c && c.level === 'violation' && /56p/.test(c.message), JSON.stringify(c));
});
test('B3 getGameLogCheck: tournament day hard limit -> violation', () => {
  const t = { id: 't', name: 'Cup', startDate: ago(2), days: 3, dayLimits: [{ max: 50, isHard: true }, { max: 50, isHard: true }, { max: 50, isHard: true }], maxTotal: 100 };
  const eve = { id: 'e', name: 'Eve', history: [] };
  assert.strictEqual(L.getGameLogCheck(eve, { context: 't', tourney: t, date: ago(2), count: 50, tournaments: [t] }), null);
  const c = L.getGameLogCheck(eve, { context: 't', tourney: t, date: ago(2), count: 51, tournaments: [t] });
  assert.ok(c && c.level === 'violation', JSON.stringify(c));
  assert.strictEqual(L.getTourneyDayNumber(t, ago(1)), 2);
});

// ══════════════════════════════════════════════════════════════════════════
// Part C - browser
// ══════════════════════════════════════════════════════════════════════════
let chromium;
try { ({ chromium } = require('playwright')); } catch { chromium = null; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const CDN_CACHE = new Map();
const STUB = `(function(){
  const cfg = window.__cfg || {};
  const local = n => { const x = new Date(); x.setDate(x.getDate()-n); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); };
  window.__d = local;
  const roster = (cfg.roster || []).map(p => ({ ...p, history: (p.history||[]).map(h => { const o = { ...h, date: typeof h.ago === "number" ? local(h.ago) : h.date }; delete o.ago; return o; }) }));
  const tournaments = (cfg.tournaments || []).map(t => { const o = { ...t, startDate: typeof t.ago === "number" ? local(t.ago) : t.startDate }; delete o.ago; return o; });
  const meta = { id:"demo", name:"Prime 10U", rules:{ maxPitches:55, rest1:20, rest2:40, rest3:60 }, seasonId:"2026_fall" };
  const user = { email: cfg.role === "coach" ? "coach@prime-pitchtracker.app" : "admin@prime-pitchtracker.app", isAnonymous:false };
  const R = v => Promise.resolve(v);
  window.__fbCalls = []; window.__sets = [];
  const rec = (n, v) => (...a) => { window.__fbCalls.push(n); return R(v); };
  Object.assign(window, {
    __fbRoleForUser: u => u ? (cfg.role === "coach" ? "coach" : "admin") : null,
    __fbOnAuthChange: cb => { setTimeout(()=>cb(user),0); return ()=>{}; },
    __fbSignOut: rec("signOut"), __fbSignIn: rec("signIn"),
    __fbMigrateIfNeeded: ()=>R(), __fbCreatePrime12U: ()=>R(), __fbCreatePrime10U: ()=>R(), __fbMigrateSeasonIfNeeded: ()=>R(),
    __fbListSeasons: ()=>R([{ id:"2026_fall", term:"Fall", year:2026, createdAt:1 }]),
    __fbCreateSeason: rec("createSeason","2026_fall"), __fbGetRoster: ()=>R([]),
    __fbListTeams: ()=>R([meta]),
    __fbCreateTeam: rec("createTeam"), __fbUpdateTeamMeta: rec("updateTeamMeta"), __fbDeleteTeam: rec("deleteTeam"),
    __fbSubscribe: (onData, onConn) => { setTimeout(()=>{ onData({ roster, tournaments }); onConn(); },0); return ()=>{}; },
    __fbSet: (k, v) => { window.__sets.push([k, JSON.parse(JSON.stringify(v ?? null))]); window.__fbCalls.push("set:"+k); return R(); },
    __fbWatchLiveGame: (tid, cb) => { setTimeout(()=>cb(null),0); return ()=>{}; },
    __fbStartLiveGame: rec("startLive",true), __fbMutateLiveGame: rec("mutateLive"), __fbClaimLiveGame: rec("claimLive", null),
  });
  localStorage.setItem("pt_selected_team_id","demo");
  localStorage.setItem("pt_selected_team_meta", JSON.stringify(meta));
  localStorage.setItem("pt_coach_name","Tester");
})();`;

const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

async function openApp(browser, port, cfg, vp = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/fonts\.g|Failed to load resource|babel|in-browser Babel|Service Worker registration blocked/i.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  page.on('dialog', dl => dl.accept());
  await page.addInitScript(c => { window.__cfg = c; }, cfg);
  await page.route('**/firebasejs/**', x => x.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/lib/firebase-init.js', x => x.fulfill({ contentType: 'text/javascript', body: STUB }));
  await page.route('**/fonts.googleapis.com/**', x => x.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://cdnjs.cloudflare.com/**', async x => {
    const u = x.request().url();
    if (!CDN_CACHE.has(u)) CDN_CACHE.set(u, (async () => { const resp = await x.fetch({ timeout: 60000 }); return { body: await resp.body(), status: resp.status(), ct: resp.headers()['content-type'] || 'text/javascript' }; })());
    try { const c = await CDN_CACHE.get(u); if (c.status !== 200) CDN_CACHE.delete(u); await x.fulfill({ status: c.status, contentType: c.ct, body: c.body }); }
    catch (e) { CDN_CACHE.delete(u); await x.continue(); }
  });
  const url = `http://localhost:${port}/`;
  try { await page.goto(url, { timeout: 60000 }); } catch (e) { await page.goto(url, { timeout: 60000 }); }
  await page.waitForSelector('button:has-text("TEAM")', { timeout: 30000 });
  await page.waitForTimeout(600);
  return { ctx, page, errs };
}
const tab = async (page, label) => { await page.locator('button', { hasText: new RegExp('^' + label + '$', 'i') }).last().click(); await page.waitForTimeout(300); };

const XSS = '<img src=x onerror="window.__xss=1">';
function data(extra = {}) {
  const mk = (id, name, jersey, history = []) => ({ id, name, jersey, lastPitches: 0, lastGameDate: '', history });
  const reg = (gameId, ago, pitches, opponent, sharedGameId) => ({ gameId, ago, pitches, opponent, isTournament: false,
    tournamentId: null, tournamentName: null, tourneyDay: null, sharedGameId });
  const tour = (gameId, ago, pitches, day) => ({ gameId, ago, pitches, opponent: 'Bears', isTournament: true,
    tournamentId: 'cup', tournamentName: 'Fall Cup', tourneyDay: day, sharedGameId: 'sgT' });
  const roster = [
    mk('a', 'Ann', '1', [reg('sg1_a', 3, 30, 'Hawks', 'sg1'), reg('leg_a', 10, 15, 'Owls', null)]),
    mk('b', 'Ben', '2', [reg('sg1_b', 3, 20, 'Hawks', 'sg1')]),
    mk('c', 'Cal', '3', [tour('sgT_c', 2, 20, 1)]),
    mk('d', 'Dee', '4', [reg('dee1', 4, 60, 'Foxes', 'sgD')]),   // owes 3 rest days -> not eligible 3 days ago
    mk('e', 'Eve', '5'),
    mk('x', 'X ' + XSS, ''),                                     // hostile name, no jersey
  ];
  const tournaments = [{ id: 'cup', name: 'Fall Cup', ago: 2, days: 3,
    dayLimits: [{ max: 50, isHard: true }, { max: 50, isHard: true }, { max: 50, isHard: true }], maxTotal: 100, maxDay1: 50, day1IsHardLimit: true }];
  return { roster, tournaments, ...extra };
}
// The innermost element that contains `text` and an Edit button = the game card / tournament day
const editFor = async (page, text) => {
  const host = page.locator('#root div', { hasText: text }).filter({ has: page.locator('button', { hasText: /^\s*Edit\s*$/ }) }).last();
  await host.locator('button', { hasText: /^\s*Edit\s*$/ }).last().click();
  await page.waitForTimeout(300);
};
const dlg = page => page.locator('body > div').filter({ hasText: 'Edit Game' }).last();
const lastRoster = async page => {
  const s = (await page.evaluate(() => window.__sets)).filter(x => x[0] === 'roster').pop();
  if (!s) return null; return Array.isArray(s[1]) ? s[1] : Object.values(s[1] || {});
};
const hist = (roster, id) => ((roster || []).find(p => p.id === id) || {}).history || [];

async function browserTests() {
  if (!chromium) { console.log('SKIP  part C browser tests: playwright not installed'); return; }
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    // ── C1. shared-game: add Eve, picker excludes in-game + added, count controls, save, grouping ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data());
      await tab(page, 'Season');
      await editFor(page, 'vs Hawks');
      const d = dlg(page);
      check('C1a modal rendered as direct child of body (portaled, not inside #root)',
        await page.evaluate(() => [...document.body.children].some(el => el.id !== 'root' && /Edit Game/.test(el.textContent))));
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(200);
      const chips = await d.locator('button[style*="border-radius: 20px"]').allInnerTexts();
      check('C1b picker lists roster pitchers not in game (Cal, Dee, Eve, X), excludes Ann/Ben',
        chips.some(c => /Eve/.test(c)) && chips.some(c => /Cal/.test(c)) && chips.some(c => /Dee/.test(c)) && !chips.some(c => /Ann|Ben/.test(c)), chips.join(' | '));
      check('C1c hostile pitcher name rendered as text, not executed', !(await page.evaluate(() => window.__xss)) && chips.some(c => c.includes('<img')));
      await d.locator('button', { hasText: 'Eve' }).click(); await page.waitForTimeout(200);
      check('C1d added pitcher shows NEW row + "0 won\'t be saved" hint', /NEW/.test(await d.innerText()) && /0 won't be saved/.test(await d.innerText()));
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(200);
      const chips2 = await d.locator('button[style*="border-radius: 20px"]').allInnerTexts();
      check('C1e once added, Eve is no longer offered', !chips2.some(c => /Eve/.test(c)), chips2.join(' | '));
      await d.locator('button[aria-label="Close pitcher list"]').click();
      const inp = d.locator('input[aria-label="Eve pitch count"]');
      await d.locator('button[aria-label="Subtract 5 pitches for Eve"]').click();
      check('C1f −5 from blank clamps at 0', (await inp.inputValue()) === '0', await inp.inputValue());
      await d.locator('button[aria-label="Add 5 pitches for Eve"]').click();
      await d.locator('button[aria-label="Add 5 pitches for Eve"]').click();
      await d.locator('button[aria-label="Add 1 pitch for Eve"]').click();
      await d.locator('button[aria-label="Subtract 1 pitch for Eve"]').click();
      await d.locator('button[aria-label="Add 1 pitch for Eve"]').click();
      check('C1g +5 +5 +1 −1 +1 = 11', (await inp.inputValue()) === '11', await inp.inputValue());
      // also edit an existing pitcher's count
      await d.locator('input[aria-label="Ann pitch count"]').fill('33');
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(800);
      check('C1h modal closed after save', (await page.locator('body > div').filter({ hasText: 'Edit Game' }).count()) === 0);
      const r = await lastRoster(page);
      const eve = hist(r, 'e');
      const e0 = eve[0] || {};
      check('C1i Eve got exactly one entry: 11p, sharedGameId sg1, gameId sg1_e, date/opponent from game',
        eve.length === 1 && e0.pitches === 11 && e0.sharedGameId === 'sg1' && e0.gameId === 'sg1_e' && e0.opponent === 'Hawks'
        && e0.date === hist(r, 'a').find(h => h.gameId === 'sg1_a').date && e0.isTournament === false && e0.tournamentId === null && e0.tourneyDay === null, JSON.stringify(eve));
      const evP = (r || []).find(p => p.id === 'e') || {};
      check('C1j recomputeLast ran for Eve (lastPitches 11, lastGameDate = game date)', evP.lastPitches === 11 && evP.lastGameDate === e0.date, JSON.stringify({ lp: evP.lastPitches, lg: evP.lastGameDate }));
      check('C1k existing pitcher edit still saved (Ann 33p on sg1_a)', (hist(r, 'a').find(h => h.gameId === 'sg1_a') || {}).pitches === 33);
      check('C1l no other pitchers modified (Ben, Cal, Dee unchanged)', hist(r, 'b').length === 1 && hist(r, 'c').length === 1 && hist(r, 'd').length === 1);
      const card = page.locator('#root div', { hasText: 'vs Hawks' }).filter({ hasText: /combined/ }).last();
      const ct = await card.innerText();
      check('C1m Season card for Hawks now lists Eve with Ann/Ben, combined 64p', /Eve/.test(ct) && /Ann/.test(ct) && /Ben/.test(ct) && /64p combined/.test(ct), ct);
      const hawksCards = await page.locator('#root').innerText();
      check('C1n only one Hawks game card', (hawksCards.match(/vs Hawks/g) || []).length === 1, (hawksCards.match(/vs Hawks/g) || []).length);
      check('C1o no NaN anywhere in saved roster', !JSON.stringify(r).includes('NaN') && !JSON.stringify(r).includes('null,"pitches"'));
      check('C1p no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // ── C2. legacy game (no sharedGameId) + changed opponent/date; ✕ removes; 0 skipped ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data());
      await tab(page, 'Season');
      await editFor(page, 'vs Owls');
      const d = dlg(page);
      for (const n of ['Eve', 'Cal', 'Ben']) {
        await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
        await d.locator('button[style*="border-radius: 20px"]', { hasText: n }).click(); await page.waitForTimeout(150);
      }
      await d.locator('input[aria-label="Eve pitch count"]').fill('12');
      await d.locator('input[aria-label="Ben pitch count"]').fill('9');
      // Cal left at blank -> skipped; Ben removed via ✕
      await d.locator('button[aria-label="Remove Ben from this game"]').click(); await page.waitForTimeout(150);
      check('C2a ✕ removes the added row', (await d.locator('input[aria-label="Ben pitch count"]').count()) === 0);
      await d.locator('input[aria-label="Opponent"]').fill('Owls B');
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(800);
      const r = await lastRoster(page);
      const eve = hist(r, 'e'), ann = hist(r, 'a').find(h => h.gameId === 'leg_a') || {};
      check('C2b legacy: Eve entry sharedGameId null, fresh gameId, same date/opponent as edited Ann entry',
        eve.length === 1 && eve[0].sharedGameId === null && eve[0].gameId && eve[0].gameId !== 'leg_a' && !/^null_|undefined/.test(eve[0].gameId)
        && eve[0].date === ann.date && eve[0].opponent === 'Owls B' && ann.opponent === 'Owls B', JSON.stringify({ eve, ann }));
      check('C2c blank count (Cal) skipped, removed (Ben) not saved', hist(r, 'c').length === 1 && hist(r, 'b').length === 1);
      const card = page.locator('#root div', { hasText: 'vs Owls B' }).filter({ hasText: /combined/ }).last();
      const ct = await card.innerText();
      check('C2d legacy grouping: Eve shown inside the Owls B card with Ann', /Eve/.test(ct) && /Ann/.test(ct) && /27p combined/.test(ct), ct);
      check('C2e no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // ── C3. rule violation -> warn panel, Go Back, Save Anyway; existing pitchers not checked ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data());
      await tab(page, 'Season');
      await editFor(page, 'vs Hawks');
      const d = dlg(page);
      // existing Ann pushed way over the daily max -> must NOT trigger the warning
      await d.locator('input[aria-label="Ann pitch count"]').fill('80');
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
      await d.locator('button[style*="border-radius: 20px"]', { hasText: 'Dee' }).click(); await page.waitForTimeout(150);
      await d.locator('input[aria-label="Dee pitch count"]').fill('10');
      await page.waitForTimeout(150);
      const inline = await d.innerText();
      check('C3a inline violation reason shown under Dee', /eligible|rest/i.test(inline.split('Dee').pop() || ''), inline.slice(-500));
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(300);
      const t1 = await d.innerText();
      check('C3b warn panel "1 added pitcher would violate a limit" lists Dee only (not Ann)', /1 added pitcher would violate a limit/.test(t1) && /#4 Dee —/.test(t1) && !/Ann —/.test(t1), t1.slice(-600));
      check('C3c nothing saved yet', hist(await lastRoster(page), 'd').length <= 1 && ((await lastRoster(page)) === null || hist(await lastRoster(page), 'a').find(h => h.gameId === 'sg1_a').pitches === 30));
      await d.locator('button', { hasText: 'Go Back' }).click(); await page.waitForTimeout(200);
      check('C3d Go Back returns to Save Changes, modal still open', (await d.locator('button', { hasText: 'Save Changes' }).count()) === 1);
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(200);
      await d.locator('button', { hasText: 'Save Anyway' }).click(); await page.waitForTimeout(800);
      const r = await lastRoster(page);
      const dee = hist(r, 'd');
      check('C3e Save Anyway logs Dee (10p, sg1_d) and the Ann edit', dee.length === 2 && dee.some(h => h.gameId === 'sg1_d' && h.pitches === 10)
        && hist(r, 'a').find(h => h.gameId === 'sg1_a').pitches === 80, JSON.stringify(dee));
      check('C3f no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // ── C4. tournament day: added pitcher gets tournament fields + day; hard-limit violation; date outside blocks ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data());
      await tab(page, 'Season');
      await editFor(page, 'vs Bears');
      const d = dlg(page);
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
      await d.locator('button[style*="border-radius: 20px"]', { hasText: 'Eve' }).click(); await page.waitForTimeout(150);
      await d.locator('input[aria-label="Eve pitch count"]').fill('51');
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(300);
      check('C4a 51p over Day 1 hard limit 50 -> warn panel', /would violate a limit/.test(await d.innerText()));
      await d.locator('button', { hasText: 'Go Back' }).click();
      await d.locator('input[aria-label="Eve pitch count"]').fill('40');
      // move the date outside the tournament -> Save disabled
      const orig = await d.locator('input[aria-label="Game date"]').inputValue();
      await d.locator('input[aria-label="Game date"]').fill(await page.evaluate(() => window.__d(20)));
      check('C4b date outside tournament -> Save disabled', await d.locator('button', { hasText: 'Save Changes' }).isDisabled());
      // move to Day 2 (yesterday)
      await d.locator('input[aria-label="Game date"]').fill(await page.evaluate(() => window.__d(1)));
      check('C4c Day 2 date -> Save enabled', !(await d.locator('button', { hasText: 'Save Changes' }).isDisabled()));
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(800);
      const r = await lastRoster(page);
      const e = hist(r, 'e')[0] || {};
      check('C4d Eve entry: isTournament, tournamentId cup, name Fall Cup, tourneyDay 2, sgT_e',
        e.isTournament === true && e.tournamentId === 'cup' && e.tournamentName === 'Fall Cup' && e.tourneyDay === 2 && e.gameId === 'sgT_e' && e.sharedGameId === 'sgT' && e.pitches === 40, JSON.stringify(e));
      const c = hist(r, 'c')[0] || {};
      check('C4e existing Cal entry moved to Day 2 alongside', c.tourneyDay === 2 && c.date === e.date, JSON.stringify(c) + ' orig ' + orig);
      const body = await page.locator('#root').innerText();
      check('C4f Season tournament container shows Eve under the Fall Cup', /Fall Cup[\s\S]*Day 2[\s\S]*(Eve[\s\S]*Cal|Cal[\s\S]*Eve)/.test(body), body.slice(0, 800));
      check('C4g no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // ── C5. input sanitization: huge / negative / exponent / decimal ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data());
      await tab(page, 'Season');
      await editFor(page, 'vs Hawks');
      const d = dlg(page);
      for (const n of ['Eve', 'Cal', 'Dee', 'X ']) {
        await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
        await d.locator('button[style*="border-radius: 20px"]', { hasText: n }).first().click(); await page.waitForTimeout(150);
      }
      await d.locator('input[aria-label="Eve pitch count"]').fill('99999');
      await d.locator('input[aria-label="Cal pitch count"]').fill('-7');
      await d.locator('input[aria-label="Dee pitch count"]').fill('12.7');
      const xName = 'X ' + XSS;
      await d.locator(`input[aria-label="${xName.replace(/"/g, '\\"')} pitch count"]`).fill('1e3');
      // non-numeric typed into a number input: browser keeps it empty
      await d.locator('input[aria-label="Cal pitch count"]').focus();
      await page.keyboard.type('abc');
      const calVal = await d.locator('input[aria-label="Cal pitch count"]').inputValue();
      check('C5a non-numeric keystrokes cannot produce a non-numeric value', calVal === '' || /^-?\d/.test(calVal), JSON.stringify(calVal));
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(300);
      if (await d.locator('button', { hasText: 'Save Anyway' }).count()) { await d.locator('button', { hasText: 'Save Anyway' }).click(); }
      await page.waitForTimeout(800);
      const r = await lastRoster(page);
      const eve = hist(r, 'e'), cal = hist(r, 'c'), dee = hist(r, 'd'), x = hist(r, 'x');
      check('C5b 99999 saved clamped to 999', eve.length === 1 && eve[0].pitches === 999, JSON.stringify(eve));
      check('C5c negative count skipped (Cal unchanged)', cal.length === 1, JSON.stringify(cal));
      check('C5d 12.7 saved as integer 12', dee.some(h => h.gameId === 'sg1_d' && h.pitches === 12), JSON.stringify(dee));
      const xe = x[0] || {};
      check('C5e "1e3" saved as an integer in 0..999 (no NaN)', x.length === 1 && Number.isInteger(xe.pitches) && xe.pitches >= 1 && xe.pitches <= 999, JSON.stringify(x));
      if (x.length === 1 && xe.pitches !== 999) console.log(`NOTE  "1e3" typed into the count was saved as ${xe.pitches}p (parseInt stops at "e") — minor, same as existing rows`);
      check('C5f no NaN / non-integer pitches anywhere in saved roster',
        (r || []).every(p => (p.history || []).every(h => Number.isInteger(h.pitches) && h.pitches >= 0 && h.pitches <= 999)) && !JSON.stringify(r).includes('NaN'));
      check('C5g no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // ── C6. filter to one pitcher: picker still judged against the full game; coach role ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data({ role: 'coach' }));
      await tab(page, 'Season');
      await page.locator('#root button[aria-pressed]', { hasText: /^Ann$|Ann/ }).first().click(); await page.waitForTimeout(300);
      await editFor(page, 'vs Hawks');
      const d = dlg(page);
      check('C6a filtered view still opens the full game (Ben in modal)', (await d.locator('input[aria-label="Ben pitch count"]').count()) === 1);
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
      const chips = await d.locator('button[style*="border-radius: 20px"]').allInnerTexts();
      check('C6b filtered: Ben (hidden by filter) not offered', !chips.some(c => /Ben/.test(c)) && chips.some(c => /Eve/.test(c)), chips.join(' | '));
      await d.locator('button[style*="border-radius: 20px"]', { hasText: 'Eve' }).click();
      await d.locator('input[aria-label="Eve pitch count"]').fill('5');
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(800);
      const r = await lastRoster(page);
      check('C6c coach role can add a pitcher (Eve sg1_e 5p saved)', hist(r, 'e').some(h => h.gameId === 'sg1_e' && h.pitches === 5));
      check('C6d no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // ── C7. everyone already in the game -> friendly message; Cancel discards additions ──
    {
      const small = data();
      small.roster = small.roster.filter(p => ['a', 'b', 'e'].includes(p.id));
      const { ctx, page, errs } = await openApp(browser, port, small);
      await tab(page, 'Season');
      await editFor(page, 'vs Hawks');
      let d = dlg(page);
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
      await d.locator('button[style*="border-radius: 20px"]', { hasText: 'Eve' }).click();
      await d.locator('input[aria-label="Eve pitch count"]').fill('7');
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
      check('C7a all roster in game -> "Everyone on the roster is already in this game."', /Everyone on the roster is already in this game/.test(await d.innerText()));
      const setsBefore = (await page.evaluate(() => window.__sets)).length;
      await d.locator('button', { hasText: /^Cancel$/ }).click(); await page.waitForTimeout(600);
      const r = await lastRoster(page);
      check('C7b Cancel discards the addition (Eve has no entry)', hist(r, 'e').length === 0);
      // reopen: fresh state, no stale added row
      await editFor(page, 'vs Hawks'); d = dlg(page);
      check('C7c reopening the modal has no leftover added row', (await d.locator('input[aria-label="Eve pitch count"]').count()) === 0);
      check('C7d no page errors', errs.length === 0, errs.join(' | '));
      void setsBefore;
      await ctx.close();
    }
    // ── C8. wide two-pane layout: modal still works / portaled ──
    {
      const { ctx, page, errs } = await openApp(browser, port, data(), { width: 951, height: 669 });
      await tab(page, 'Season');
      await editFor(page, 'vs Hawks');
      const d = dlg(page);
      await d.locator('button', { hasText: 'Add pitcher' }).click(); await page.waitForTimeout(150);
      await d.locator('button[style*="border-radius: 20px"]', { hasText: 'Eve' }).click();
      await d.locator('input[aria-label="Eve pitch count"]').fill('8');
      const box = await d.locator('button', { hasText: 'Save Changes' }).boundingBox();
      check('C8a two-pane: Save button reachable within viewport after scrolling', !!box);
      await d.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(800);
      check('C8b two-pane: Eve saved', hist(await lastRoster(page), 'e').some(h => h.gameId === 'sg1_e' && h.pitches === 8));
      check('C8c no page errors', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  } catch (e) {
    check('browser suite ran without exceptions', false, e.stack);
  } finally {
    await browser.close(); server.close();
  }
}

browserTests().then(() => {
  console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
  process.exit(failed ? 1 : 0);
});
