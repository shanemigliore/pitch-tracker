#!/usr/bin/env node
/**
 * Independent browser verification of v3.19 (tournament hold + rest tiers). Playwright +
 * headless Chromium; SKIP (exit 0) without playwright. Harness copied from
 * tests/duo-fixes-v318.browser.verify.test.js (Firebase stubbed, data from window.__cfg).
 * Run with: node tests/tourney-rest-v319.browser.verify.test.js
 */
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('SKIP  duo-fixes-v318 browser tests: playwright not installed'); process.exit(0); }
const http = require('http'); const fs = require('fs'); const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const CDN_CACHE = new Map();

// ── Firebase stub, data from window.__cfg (set by an init script) ──
const STUB = `(function(){
  const cfg = window.__cfg || {};
  const today = new Date(); const d = n => { const x = new Date(today); x.setDate(x.getDate()-n); return x.toISOString().slice(0,10); };
  const local = n => { const x = new Date(); x.setDate(x.getDate()-n); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); };
  window.__d = local;
  const roster = (cfg.roster || []).map(p => ({ ...p, history: (p.history||[]).map(h => ({ ...h, date: typeof h.ago === "number" ? local(h.ago) : h.date })) }));
  const tournaments = (cfg.tournaments || []).map(t => ({ ...t, startDate: typeof t.ago === "number" ? local(t.ago) : t.startDate }));
  const meta = { id:"demo", name:"Prime 10U", rules:{ maxPitches:55, rest1:20, rest2:40, rest3:60 }, seasonId:"2026_fall" };
  const user = { email:"admin@prime-pitchtracker.app", isAnonymous:false };
  const R = v => Promise.resolve(v);
  window.__fbCalls = [];
  const rec = (n, v) => (...a) => { window.__fbCalls.push(n); return R(v); };
  window.__sets = [];
  Object.assign(window, {
    __fbRoleForUser: u => u ? "admin" : null,
    __fbOnAuthChange: cb => { setTimeout(()=>cb(user),0); return ()=>{}; },
    __fbSignOut: rec("signOut"), __fbSignIn: rec("signIn"),
    __fbMigrateIfNeeded: ()=>R(), __fbCreatePrime12U: ()=>R(), __fbCreatePrime10U: ()=>R(), __fbMigrateSeasonIfNeeded: ()=>R(),
    __fbListSeasons: ()=>R([{ id:"2026_fall", term:"Fall", year:2026, createdAt:1 }]),
    __fbCreateSeason: rec("createSeason","2026_fall"), __fbGetRoster: ()=>R([]),
    __fbListTeams: ()=>R([meta]),
    __fbCreateTeam: rec("createTeam"), __fbUpdateTeamMeta: rec("updateTeamMeta"), __fbDeleteTeam: rec("deleteTeam"),
    __fbSubscribe: (onData, onConn) => { setTimeout(()=>{ onData({ roster, tournaments }); onConn(); },0); return ()=>{}; },
    __fbSet: (k, v) => { window.__sets.push([k, JSON.parse(JSON.stringify(v ?? null))]); window.__fbCalls.push("set:"+k); return R(); },
    __fbWatchLiveGame: (tid, cb) => { window.__setLive = v => { window.__liveCur = v; cb(v); };
      setTimeout(()=>window.__setLive(cfg.live ? { ...cfg.live, date: local(0) } : null),0); return ()=>{}; },
    __fbStartLiveGame: rec("startLive",true),
    __fbMutateLiveGame: (t, gid, mutate) => { window.__fbCalls.push("mutateLive");
      const next = mutate(window.__liveCur ? JSON.parse(JSON.stringify(window.__liveCur)) : null);
      if (next !== undefined) setTimeout(() => window.__setLive(next), 0); return R(); },
    __fbClaimLiveGame: () => { window.__fbCalls.push("claimLive"); const c = window.__liveCur; window.__setLive(null); return R(c); },
  });
  localStorage.setItem("pt_selected_team_id","demo");
  localStorage.setItem("pt_selected_team_meta", JSON.stringify(meta));
  localStorage.setItem("pt_coach_name","Tester");
})();`;
let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? '\n      ' + detail : ''}`); }
}

function renderIndex(query) {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sim = query.get('sim'); const sa = query.get('sa') === '1';
  const a = html.indexOf('<style>'), b = html.indexOf('</style>');
  let css = html.slice(a, b);
  if (sim) {
    const [t, r, bo, l] = sim.split(',').map(Number);
    css = css.replace(/env\(safe-area-inset-top,\s*0px\)/g, t + 'px').replace(/env\(safe-area-inset-right,\s*0px\)/g, r + 'px')
      .replace(/env\(safe-area-inset-bottom,\s*0px\)/g, bo + 'px').replace(/env\(safe-area-inset-left,\s*0px\)/g, l + 'px');
  }
  if (sa) css = css.replace(/\(display-mode: standalone\)/g, '(min-width: 0px)');
  return html.slice(0, a) + css + html.slice(b);
}
const server = http.createServer((q, r) => {
  const u = new URL(q.url, 'http://x');
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  if (p === '/index.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(renderIndex(u.searchParams)); }
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

async function openApp(browser, port, { w, h, t = 0, l = 0, r = 0, b = 0, sa = false }, cfg) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
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
  const url = `http://localhost:${port}/?sim=${t},${r},${b},${l}${sa ? '&sa=1' : ''}`;
  try { await page.goto(url, { timeout: 60000 }); } catch (e) { await page.goto(url, { timeout: 60000 }); }
  await page.waitForSelector('button:has-text("TEAM")', { timeout: 30000 });
  await page.waitForTimeout(600);
  return { ctx, page, errs };
}

const tab = async (page, label) => { await page.locator('button', { hasText: new RegExp('^' + label + '$', 'i') }).last().click(); await page.waitForTimeout(300); };

const rowFor = (page, name) => page.locator('#root div[style*="cursor: pointer"]', { hasText: name }).first();
const XSS = '<img src=x onerror="window.__xss=1">';
function data(live) {
  const mk = (id, name, jersey) => ({ id, name, jersey, lastPitches: 0, lastGameDate: '', history: [] });
  const wyatt = mk('w', 'Wyatt', '7'), cooper = mk('c', 'Cooper', '8'), dana = mk('d', 'Dana', '9'), rex = mk('r', 'Rex', '10');
  const H = (p, ago, pitches, t, tname) => p.history.push({ gameId: 'g' + p.id + ago + t, ago, pitches, opponent: 'Opp',
    isTournament: true, tournamentId: t, tournamentName: tname, tourneyDay: null, sharedGameId: null });
  // "5 Tool - Texas 20": started yesterday, 2 days (today = Day 2). Wyatt 15p yesterday.
  H(wyatt, 1, 15, 'tx', '5 Tool - Texas 20');
  // "Tiered <xss>": started yesterday, 3 days, >30 = 1 rest day. Cooper 31p yesterday, Rex 30p yesterday.
  H(cooper, 1, 31, 'tier', 'Tiered'); H(rex, 1, 30, 'tier', 'Tiered');
  const tournaments = [
    { id: 'tx', name: '5 Tool - Texas 20', ago: 1, days: 2, dayLimits: [{ max: 30, isHard: false }, { max: 45, isHard: false }], maxTotal: 75, maxDay1: 30, day1IsHardLimit: false },
    { id: 'tier', name: 'Tiered ' + XSS, ago: 1, days: 3, dayLimits: { 0: { max: 50, isHard: false }, 1: { max: 50, isHard: false }, 2: { max: 50, isHard: false } },
      maxTotal: 100, maxDay1: 50, day1IsHardLimit: false, restTiers: { rest1: 30, rest2: 0, rest3: 0 } },
  ];
  return { roster: [wyatt, cooper, dana, rex], tournaments, live };
}

(async () => {
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const browser = await chromium.launch();
  const PH = { w: 390, h: 844 };
  try {
    // 1. Roster tab, regular-season view: Wyatt is "In Tourney", not "2 Days"
    {
      const { ctx, page, errs } = await openApp(browser, port, PH, data(null));
      await tab(page, 'Roster');
      await page.locator('button', { hasText: 'Regular Season' }).first().click(); await page.waitForTimeout(300);
      const row = rowFor(page, 'Wyatt'); const txt = await row.innerText();
      check('roster regular: Wyatt chip "In Tourney"', /In Tourney/.test(txt), txt);
      check('roster regular: Wyatt row names the tournament + "regular season from"', /In 5 Tool - Texas 20/.test(txt) && /regular season from/i.test(txt), txt);
      check('roster regular: no "2 Days" / "rest remaining" for Wyatt', !/2 Days|rest remaining/.test(txt), txt);
      // Cooper 31p in 3-day tiered tourney -> total-based 1 rest day, but floor (day after end) binds -> hold
      const ctxt = await rowFor(page, 'Cooper').innerText();
      check('roster regular: Cooper (31p, floor binds) also In Tourney', /In Tourney/.test(ctxt), ctxt);
      // drill into PitcherDetail
      await row.click(); await page.waitForTimeout(400);
      const body = await page.locator('#root').innerText();
      check('PitcherDetail: "🏆 In 5 Tool - Texas 20" + "Regular season from" (no rest wording)', /🏆 In 5 Tool - Texas 20/.test(body) && /Regular season from/.test(body) && !/rest remaining/.test(body), body.slice(0, 400));
      // 2. tiered tourney view: Cooper "Rest Day", Rex eligible
      await page.reload(); await page.waitForSelector('button:has-text("TEAM")', { timeout: 30000 }); await page.waitForTimeout(600);
      await tab(page, 'Roster');
      await page.locator('button', { hasText: 'Tiered' }).first().click(); await page.waitForTimeout(300);
      const ctxt2 = await rowFor(page, 'Cooper').innerText();
      check('roster tiered tourney: Cooper "Rest Day" + reason Day 1', /Rest Day/.test(ctxt2) && /31p on Day 1/.test(ctxt2), ctxt2);
      const elig = await page.locator('#root').innerText();
      check('roster tiered tourney: Rex (exactly 30) not on a rest day', !/Rex[\s\S]{0,80}Rest Day/.test(elig));
      const xss = await page.evaluate(() => window.__xss);
      check('XSS tournament name not executed', !xss);
      check('no page errors (roster)', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // 3. Live tab: tiered tourney Day 2, Dana in the game at 30 -> "Next pitch = out Day 3"; Cooper not available
    {
      const live = { id: 'live1', context: 'tier', opponent: 'Yanks', startedAt: 1, startedBy: 'Tester', pitchers: {
        d: { pitches: 30, status: 'active', order: 0, enteredAt: 1, leftAt: null } } };
      const { ctx, page, errs } = await openApp(browser, port, PH, data(live));
      await tab(page, 'Live');
      const body = await page.locator('#root').innerText();
      check('live: Dana warns "Next pitch = out Day 3"', /Next pitch = out Day 3/.test(body), body.slice(0, 600));
      check('live: Cooper listed with rest-day reason', /Cooper[\s\S]{0,200}31p on Day 1/.test(body));
      // +1 -> crossed: status box shows SITS / DAY 3
      await page.locator('button', { hasText: /^\+1$/ }).first().click(); await page.waitForTimeout(500);
      const body2 = await page.locator('#root').innerText();
      check('live: after +1 status box shows SITS DAY 3', /SITS/.test(body2) && /DAY 3/.test(body2), body2.slice(0, 600));
      check('no page errors (live)', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
    // 4. Settings -> Tournaments form validation
    {
      const { ctx, page, errs } = await openApp(browser, port, PH, data(null));
      await tab(page, 'Settings');
      await page.locator('button', { hasText: /^Tournaments$/ }).first().click(); await page.waitForTimeout(300);
      await page.locator('button', { hasText: /New$/ }).first().click(); await page.waitForTimeout(300);
      await page.fill('input[aria-label="Tournament name"]', 'Verify Cup');
      const create = page.locator('button', { hasText: 'Create Tournament' });
      await page.fill('input[aria-label="2 rest days if more than"]', '45');
      check('form: 2-day tier without 1-day -> error + disabled', await create.isDisabled() && /Fill the 1-day threshold first/.test(await page.locator('#root').innerText()));
      await page.fill('input[aria-label="1 rest day if more than"]', '50');
      check('form: non-increasing tiers -> error + disabled', await create.isDisabled() && /higher than the one before/.test(await page.locator('#root').innerText()));
      await page.fill('input[aria-label="1 rest day if more than"]', '30');
      check('form: valid tiers -> enabled', !(await create.isDisabled()));
      await create.click(); await page.waitForTimeout(800);
      const set = (await page.evaluate(() => window.__sets)).filter(s => s[0] === 'tournaments').pop();
      const t = set && set[1].find(x => x.name === 'Verify Cup');
      check('form: saved restTiers {30,45,0}', t && t.restTiers && t.restTiers.rest1 === 30 && t.restTiers.rest2 === 45 && t.restTiers.rest3 === 0, JSON.stringify(t && t.restTiers));
      const listTxt = await page.locator('#root').innerText();
      check('form: list shows "Rest between days: >30=1d, >45=2d"', /Rest between days: >30=1d, >45=2d/.test(listTxt));
      // Edit an existing tourney without tiers: blank fields, saving keeps no tiers
      await page.locator('div[style*="cursor: pointer"]', { hasText: '5 Tool - Texas 20' }).first().click(); await page.waitForTimeout(300);
      const vals = await page.$$eval('input[aria-label*="rest day"]', es => es.map(e => e.value));
      check('edit legacy tourney: tier fields blank', vals.every(v => v === ''), JSON.stringify(vals));
      check('no page errors (settings)', errs.length === 0, errs.join(' | '));
      await ctx.close();
    }
  } catch (e) { failed++; console.log('FAIL  harness: ' + (e && e.stack)); }
  await browser.close(); server.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
