#!/usr/bin/env node
/**
 * Independent browser verification of v3.18 (iPhone Duo fixes). Playwright + headless
 * Chromium; prints SKIP and exits 0 if playwright isn't installed.
 *
 * Same harness approach as tests/duo-layout.browser.verify.test.js:
 *  - env(safe-area-inset-*) inside index.html's <style> is rewritten to the measured px
 *    values (env() used inline in components, e.g. paneScroll's bottom padding, stays 0 -
 *    NOT simulated), `(display-mode: standalone)` rewritten to always match for `sa` views.
 *  - Firebase is stubbed; the roster/tournaments/live game come from window.__cfg so each
 *    scenario can use its own data. __fbSet payloads are recorded in window.__sets.
 *  - A fold/unfold is simulated with setViewportSize (the injected insets stay those of
 *    the view the page was opened with).
 * Run with: node tests/duo-fixes-v318.browser.verify.test.js
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

const XSS = '<img src=x onerror="window.__xss=1">';
// 14 pitchers, ~10 shared regular games each, one 2-day tournament, Delta threw 20 today,
// Mike threw 50 yesterday (resting). Enough content that every pane overflows.
function bigData() {
  const names = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November'];
  const roster = names.map((name, i) => ({ id: 'p' + i, name, jersey: String(10 + i), lastPitches: 0, lastGameDate: '', history: [] }));
  const H = (p, ago, pitches, sg, extra = {}) => p.history.push({ gameId: sg + '_' + p.id, ago, pitches, opponent: extra.opponent || 'Rockies',
    isTournament: !!extra.t, tournamentId: extra.t || null, tournamentName: extra.t ? 'Fall Classic' : null, tourneyDay: extra.day || null, sharedGameId: sg });
  for (let k = 0; k < 12; k++) {
    const ago = 3 + k * 3;
    roster.forEach((p, i) => { if ((i + k) % 3 === 0) H(p, ago, 12 + (i % 6), 'sg' + k, { opponent: k === 2 ? XSS : 'Team ' + k }); });
  }
  // the shared 3-pitcher game used by the filter/edit tests: Alpha, Bravo, Charlie, 5 days ago
  H(roster[0], 5, 11, 'sgX', { opponent: 'Trio' }); H(roster[1], 5, 12, 'sgX', { opponent: 'Trio' }); H(roster[2], 5, 13, 'sgX', { opponent: 'Trio' });
  // tournament 50..49 days ago: day 1 Alpha+Bravo, day 2 Alpha+Charlie
  H(roster[0], 50, 20, 'tg1', { t: 'tour1', day: 1 }); H(roster[1], 50, 25, 'tg1', { t: 'tour1', day: 1 });
  H(roster[0], 49, 15, 'tg2', { t: 'tour1', day: 2 }); H(roster[2], 49, 30, 'tg2', { t: 'tour1', day: 2 });
  H(roster[3], 0, 20, 'sgToday', { opponent: 'Morning' });   // Delta: 20 earlier today
  H(roster[12], 1, 50, 'sgY', { opponent: 'Yday' });         // Mike: resting
  const tournaments = [{ id: 'tour1', name: 'Fall Classic', ago: 50, days: 2, dayLimits: [{ max: 50, isHard: true }, { max: 50, isHard: true }], maxTotal: 100, maxDay1: 50, day1IsHardLimit: true }];
  const live = { id: 'live1', context: 'regular', opponent: XSS, startedAt: 1, startedBy: 'Tester', pitchers: {
    p0: { pitches: 22, status: 'left', order: 0, enteredAt: 1, leftAt: 2 },
    p1: { pitches: 17, status: 'active', order: 1, enteredAt: 2, leftAt: null },
    ghost: { pitches: 9, status: 'left', order: 2, enteredAt: 3, leftAt: 4 } } };
  return { roster, tournaments, live };
}

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
const hScroll = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const pageScrollable = page => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const resize = async (page, w, h) => { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1200); };
const rowFor = (page, name) => page.locator('#root div[style*="cursor: pointer"]', { hasText: name }).first();

// Scrolling panes of a two-pane screen: overflow-y auto/scroll children of a grid, not fixed.
const PANES_JS = `(() => [...document.querySelectorAll('#root *')].filter(e => { const cs = getComputedStyle(e);
  return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && cs.position !== 'fixed' && e.parentElement &&
    getComputedStyle(e.parentElement).display === 'grid' && e.getBoundingClientRect().width > 100; }))()`;
async function paneInfo(page) {
  return page.evaluate(js => {
    const panes = eval(js);
    const bar = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).bottom === '0px' && d.querySelector('button'));
    const barTop = bar ? bar.firstElementChild.getBoundingClientRect().top : null;
    return { barTop, ih: innerHeight, panes: panes.map(p => { const b = p.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), sh: p.scrollHeight, ch: p.clientHeight, st: p.scrollTop }; }) };
  }, PANES_JS);
}
// Bottom of the last visible content inside pane i after scrolling it to the end.
async function endOfPane(page, i) {
  return page.evaluate(([js, i]) => {
    const p = eval(js)[i]; p.scrollTop = p.scrollHeight; let max = -Infinity;
    for (const e of p.querySelectorAll('*')) { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue; max = Math.max(max, b.bottom); }
    return { contentBottom: Math.round(max), paneBottom: Math.round(p.getBoundingClientRect().bottom) };
  }, [PANES_JS, i]);
}
// Wheel over pane i; returns scrollTops of all panes + window.scrollY before/after.
async function wheelPane(page, i, dy) {
  const before = await page.evaluate(js => ({ st: eval(js).map(p => p.scrollTop), y: scrollY }), PANES_JS);
  const box = await page.evaluate(([js, i]) => { const b = eval(js)[i].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 200) }; }, [PANES_JS, i]);
  await page.mouse.move(box.x, box.y); await page.mouse.wheel(0, dy); await page.waitForTimeout(400);
  const after = await page.evaluate(js => ({ st: eval(js).map(p => p.scrollTop), y: scrollY }), PANES_JS);
  return { before, after };
}
async function resetPanes(page) { await page.evaluate(js => { eval(js).forEach(p => { p.scrollTop = 0; }); scrollTo(0, 0); }, PANES_JS); }

// The IN THE GAME card's pitcher order (by name position in its text).
async function inGameOrder(page, names) {
  return page.evaluate(names => {
    const p = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'IN THE GAME'); if (!p) return null;
    const txt = p.parentElement.innerText;
    return names.map(n => [n, txt.indexOf(n)]).filter(x => x[1] >= 0).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  }, names);
}

(async () => {
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const browser = await chromium.launch();
  const UL = { n: 'unfolded landscape 951x669', w: 951, h: 669, r: 84, b: 34, sa: true, rail: true };
  const UP = { n: 'unfolded portrait 669x951', w: 669, h: 951, t: 82, b: 34, sa: true, rail: false };
  const FP = { n: 'folded portrait 457x678', w: 457, h: 678, r: 84, b: 34, sa: true };
  const FL = { n: 'folded landscape 678x457', w: 678, h: 457, r: 84, b: 34, sa: true };
  const PH = { n: 'phone 390x844', w: 390, h: 844 };
  const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima', 'Mike', 'November'];
  try {
    // ════ 1/2/4: two-pane screens reach the bottom, scroll independently, nothing under the bar ════
    for (const v of [UL, UP]) {
      const { ctx, page, errs } = await openApp(browser, port, v, bigData());
      const tag = `[${v.n}]`;
      const screens = [
        ['Roster+detail', async () => { await tab(page, 'Roster'); await rowFor(page, 'Alpha').click(); await page.waitForTimeout(300); }],
        ['Live', async () => { await tab(page, 'Live'); }],
        ['Log Game', async () => { await tab(page, 'Log Game');
          for (const n of NAMES.slice(0, 8)) { const b = page.locator(`button[aria-pressed="false"][aria-label="${n}"]`); if (await b.count()) await b.click(); } await page.waitForTimeout(200); }],
        ['Season', async () => { await tab(page, 'Season'); }],
        ['Settings/Tournaments', async () => { await tab(page, 'Settings'); await page.locator('button', { hasText: /^Tournaments$/ }).click(); await page.waitForTimeout(200); }],
        ['Settings/Roster', async () => { await page.locator('button', { hasText: /^Roster$/ }).first().click(); await page.waitForTimeout(200); }],
      ];
      for (const [name, go] of screens) {
        await go(); await resetPanes(page);
        const info = await paneInfo(page);
        const st = `${tag} ${name}`;
        check(`${st}: two scrolling panes`, info.panes.length >= 2, JSON.stringify(info.panes));
        check(`${st}: page itself doesn't scroll (vertical) and no horizontal scroll`, (await pageScrollable(page)) <= 1 && (await hScroll(page)) <= 0,
          JSON.stringify({ v: await pageScrollable(page), h: await hScroll(page) }));
        check(`${st}: every pane reaches the bottom of the screen (no dead band)`, info.panes.every(p => Math.abs(p.bottom - info.ih) <= 1),
          JSON.stringify(info.panes.map(p => p.bottom)) + ' ih=' + info.ih);
        check(`${st}: ${v.rail ? 'rail (no bottom bar)' : 'bottom bar present'}`, v.rail ? info.barTop === null : info.barTop !== null, 'barTop=' + info.barTop);
        // independent scroll of each overflowing pane
        const over = info.panes.map((p, i) => [p, i]).filter(([p]) => p.sh > p.ch + 4);
        if (!name.startsWith('Settings')) check(`${st}: at least one pane overflows with this data (test meaningful)`, over.length >= 1, JSON.stringify(info.panes));
        for (const [, i] of over) {
          await resetPanes(page);
          const { before, after } = await wheelPane(page, i, 300);
          const others = after.st.every((s, j) => j === i || s === before.st[j]);
          check(`${st}: wheel over pane ${i} scrolls only that pane, page stays put`, after.st[i] > before.st[i] && others && after.y === 0,
            JSON.stringify({ before, after }));
          // overscroll past the end doesn't chain to the page
          await wheelPane(page, i, 20000); const y = await page.evaluate(() => scrollY);
          check(`${st}: overscrolling pane ${i} past its end doesn't move the page`, y === 0, 'scrollY=' + y);
          const end = await endOfPane(page, i);
          const limit = v.rail ? info.ih - 8 : info.barTop;
          check(`${st}: end of pane ${i}'s content clears ${v.rail ? 'the screen bottom' : 'the bottom tab bar'} (${end.contentBottom} <= ${limit})`,
            end.contentBottom <= limit + 0.5, JSON.stringify({ end, limit }));
        }
      }
      // Live two-pane specifically: left = in-game, right = available
      await tab(page, 'Live'); await resetPanes(page);
      const sides = await page.evaluate(js => eval(js).map(p => p.innerText.includes('IN THE GAME') ? 'L' : p.innerText.includes('AVAILABLE') || /Bring in/.test(p.innerHTML) ? 'R' : '?'), PANES_JS);
      check(`${tag} Live two-pane: in-game pane and available pane are separate scrollers`, sides.includes('L') && sides.includes('R'), JSON.stringify(sides));
      // a banner above the screens (update available) must not push the panes past the screen bottom
      await tab(page, 'Season');
      await page.evaluate(() => { window.__pendingAppUpdateVersion = 'v9.99'; window.dispatchEvent(new Event('pt-update-available')); }); await page.waitForTimeout(400);
      const bn = await paneInfo(page); const bannerShown = await page.locator('text=/v9\\.99|update/i').count();
      check(`${tag} with the update banner showing: panes still end at the screen bottom, page doesn't scroll`,
        bannerShown > 0 && bn.panes.length >= 2 && bn.panes.every(p => Math.abs(p.bottom - bn.ih) <= 1) && (await pageScrollable(page)) <= 1, JSON.stringify({ bannerShown, bn }));
      check(`${tag} no page/console errors`, !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ════ phone / folded: page still scrolls as a page, no pane grids ════
    for (const v of [PH, FP, FL]) {
      const { ctx, page, errs } = await openApp(browser, port, v, bigData());
      const tag = `[${v.n}]`;
      for (const s of ['Roster', 'Live', 'Season', 'Log Game', 'Settings']) {
        await tab(page, s);
        const info = await paneInfo(page);
        check(`${tag} ${s}: one column (no scrolling pane grid)`, info.panes.length === 0, JSON.stringify(info.panes));
        check(`${tag} ${s}: no horizontal scroll`, (await hScroll(page)) <= 0);
        if (s === 'Season' || s === 'Roster' || s === 'Live') {
          const sc = await pageScrollable(page);
          await page.mouse.move(v.w / 2, v.h / 2); await page.mouse.wheel(0, 400); await page.waitForTimeout(300);
          const y = await page.evaluate(() => scrollY);
          check(`${tag} ${s}: content taller than the screen scrolls the page`, sc > 0 && y > 0, JSON.stringify({ sc, y }));
          await page.evaluate(() => scrollTo(0, 0));
        }
      }
      // bottom of the page content clears the bottom bar (phone layout keeps its 110px pad)
      await tab(page, 'Season'); await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200);
      const clr = await page.evaluate(() => { const bar = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).bottom === '0px' && d.querySelector('button'));
        const cards = [...document.querySelectorAll('#root button')].filter(b => /Edit/.test(b.textContent)); const last = cards[cards.length - 1];
        return { lastBottom: last ? last.getBoundingClientRect().bottom : null, barTop: bar ? bar.getBoundingClientRect().top : null, rail: !bar }; });
      check(`${tag} Season: last game's Edit button clears the tab bar at the bottom of the page`, clr.rail || (clr.lastBottom !== null && clr.lastBottom <= clr.barTop), JSON.stringify(clr));
      check(`${tag} no page/console errors`, !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ════ 2: Live ordering - active first, then left, most recent first (every size) ════
    for (const v of [PH, FP, UL, UP]) {
      const { ctx, page, errs } = await openApp(browser, port, v, bigData());
      const tag = `[Live order ${v.n}]`;
      await tab(page, 'Live');
      let ord = await inGameOrder(page, NAMES);
      check(`${tag} initial: active Bravo above left Alpha; ghost (not on roster) not shown`, JSON.stringify(ord) === '["Bravo","Alpha"]', JSON.stringify(ord));
      await page.locator('button[aria-label^="Bring in Charlie"]').click(); await page.waitForTimeout(500);
      ord = await inGameOrder(page, NAMES);
      check(`${tag} bring in Charlie: Charlie, Bravo, Alpha`, JSON.stringify(ord) === '["Charlie","Bravo","Alpha"]', JSON.stringify(ord));
      await page.locator('button[aria-label^="Bring in Echo"]').click(); await page.waitForTimeout(500);
      ord = await inGameOrder(page, NAMES);
      check(`${tag} bring in Echo: Echo, Charlie, Bravo, Alpha`, JSON.stringify(ord) === '["Echo","Charlie","Bravo","Alpha"]', JSON.stringify(ord));
      const st = await page.evaluate(() => Object.fromEntries(Object.entries(window.__liveCur.pitchers).map(([k, x]) => [k, x.status + ':' + x.order])));
      check(`${tag} server state: only Echo active, orders keep entry order`, st.p4 === 'active:4' && st.p2.startsWith('left:3') && st.p1.startsWith('left') && st.p0 === 'left:0', JSON.stringify(st));
      // active card is at the top of the list and in view after bringing in (scrollIntoView)
      const top = await page.evaluate(() => { const p = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'IN THE GAME'); const b = p.getBoundingClientRect(); return { top: b.top, ih: innerHeight }; });
      check(`${tag} IN THE GAME header is on screen after bringing a pitcher in`, top.top >= 0 && top.top < top.ih, JSON.stringify(top));
      // XSS: opponent rendered as text
      const xss = await page.evaluate(() => ({ flag: window.__xss, imgs: document.querySelectorAll('#root img[src="x"]').length, val: (document.querySelector('input[aria-label="Opponent"]') || {}).value }));
      check(`${tag} hostile opponent string is inert text (no injected <img>, no script ran)`, !xss.flag && xss.imgs === 0, JSON.stringify(xss));
      // complete: log order = entry order. Give everyone pitches first (Alpha 22, Bravo 17, Charlie 0, Echo 0) -> bump Echo.
      await page.locator('button[aria-label="Add 5 pitches for Echo"]').click(); await page.waitForTimeout(300);
      if (v === PH) {
        const setsBefore = 0;
        await page.locator('button', { hasText: 'Log Complete Game' }).click(); await page.waitForTimeout(400);
        const warn = await page.locator('text=/would violate a limit/').count();
        if (warn) { await page.locator('button', { hasText: /Anyway/ }).click(); await page.waitForTimeout(400); }
        await page.waitForTimeout(1000); // App debounces roster saves by 600ms
        const res = await page.evaluate(n => { const rs = window.__sets.filter(s => s[0] === 'roster').slice(-1)[0]; if (!rs) return null;
          const arr = Array.isArray(rs[1]) ? rs[1] : Object.values(rs[1]);
          return arr.map(p => ({ id: p.id, last: (p.history || []).filter(h => h.sharedGameId && h.opponent && h.opponent.includes('img') && h.date === window.__d(0)).map(h => h.gameId) })).filter(x => x.last.length); }, setsBefore);
        const ids = (res || []).map(x => x.id).sort();
        check(`${tag} Log Complete Game logs Alpha, Bravo, Echo (0-count Charlie and off-roster ghost dropped)`, JSON.stringify(ids) === '["p0","p1","p4"]', JSON.stringify(res) + ' calls=' + (await page.evaluate(() => window.__fbCalls.slice(-8).join(','))) + ' text=' + (await page.evaluate(() => (document.body.innerText.match(/.*(Logged|violate|logged|Log ).*/g) || []).join(' / '))));
        const grouped = await page.evaluate(() => { const rs = window.__sets.filter(s => s[0] === 'roster').slice(-1)[0][1]; const arr = Array.isArray(rs) ? rs : Object.values(rs);
          return [...new Set(arr.flatMap(p => (p.history || []).filter(h => h.date === window.__d(0) && h.opponent && h.opponent.includes('img')).map(h => h.sharedGameId)))]; });
        check(`${tag} logged entries share one sharedGameId`, grouped.length === 1, JSON.stringify(grouped));
        check(`${tag} logged opponent string stored verbatim (text), no script ran`, !(await page.evaluate(() => window.__xss)));
      }
      check(`${tag} no page/console errors`, !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ════ 3: Season filter shows only that pitcher's rows; Edit opens the whole game ════
    for (const v of [PH, UL]) {
      const { ctx, page, errs } = await openApp(browser, port, v, bigData());
      const tag = `[Season filter ${v.n}]`;
      await tab(page, 'Season');
      const cardNames = async () => page.evaluate(names => [...document.querySelectorAll('#root button')].filter(b => /^\s*Edit\s*$/.test(b.textContent))
        .map(b => { const c = b.parentElement.parentElement; return { head: b.parentElement.innerText.slice(0, 60), names: names.filter(n => c.innerText.includes(n)) }; }), NAMES);
      const all = await cardNames();
      const trio = all.find(c => /Trio/.test(c.head));
      check(`${tag} unfiltered: the Trio game shows all 3 pitchers`, trio && trio.names.join() === 'Alpha,Bravo,Charlie', JSON.stringify(trio));
      await page.locator('button', { hasText: /^#11 Bravo$/ }).first().click(); await page.waitForTimeout(300);
      const f = await cardNames();
      const bad = f.filter(c => c.names.join() !== 'Bravo');
      check(`${tag} filtered to Bravo: every game card / tournament day shows only Bravo's row`, f.length > 0 && !bad.length, JSON.stringify(bad.slice(0, 4)));
      const tday = f.filter(c => /Day 1/.test(c.head));
      check(`${tag} filtered to Bravo: tournament shows only Day 1 (Bravo didn't pitch Day 2)`, tday.length === 1 && !f.some(c => /Day 2/.test(c.head)), JSON.stringify(f.map(c => c.head)));
      // Edit on the filtered Trio game opens all 3 pitchers
      const idx = f.findIndex(c => /Trio/.test(c.head));
      await page.locator('#root button', { hasText: /^\s*Edit\s*$/ }).nth(idx).click(); await page.waitForTimeout(300);
      const modal = await page.evaluate(() => ({ counts: [...document.querySelectorAll('input[aria-label$=" pitch count"]')].map(i => i.getAttribute('aria-label')),
        del: [...document.querySelectorAll('button')].map(b => b.textContent).find(t => /Delete this game/.test(t)) }));
      check(`${tag} Edit (filtered) opens the whole game: Alpha, Bravo, Charlie`, modal.counts.length === 3 && ['Alpha', 'Bravo', 'Charlie'].every(n => modal.counts.some(c => c.startsWith(n))), JSON.stringify(modal));
      check(`${tag} delete button says 3 pitchers`, /\(3 pitchers\)/.test(modal.del || ''), modal.del);
      // also: no daily-max warning text in the edit modal even with an over-max count
      await page.locator('input[aria-label="Bravo pitch count"]').fill('80'); await page.waitForTimeout(200);
      check(`${tag} edit modal: no daily-max warning for an 80p count`, (await page.locator('text=/daily max/').count()) === 0);
      await page.locator('input[aria-label="Bravo pitch count"]').fill('12');
      await page.locator('button', { hasText: /Delete this game/ }).click(); await page.waitForTimeout(150);
      await page.locator('button', { hasText: /^Yes, Delete$/ }).click(); await page.waitForTimeout(1200);
      const left = await page.evaluate(() => { const rs = window.__sets.filter(s => s[0] === 'roster').slice(-1)[0]; if (!rs) return 'no save';
        const arr = Array.isArray(rs[1]) ? rs[1] : Object.values(rs[1]); return arr.flatMap(p => (p.history || []).filter(h => h.sharedGameId === 'sgX').map(h => p.name)); });
      check(`${tag} "Delete this game" while filtered removes all 3 pitchers' entries`, Array.isArray(left) && left.length === 0, JSON.stringify(left));
      // filtered tournament day Edit opens both pitchers of that day
      const f2 = await cardNames(); const d1 = f2.findIndex(c => /Day 1/.test(c.head));
      if (d1 >= 0) {
        await page.locator('#root button', { hasText: /^\s*Edit\s*$/ }).nth(d1).click(); await page.waitForTimeout(300);
        const c2 = await page.evaluate(() => [...document.querySelectorAll('input[aria-label$=" pitch count"]')].map(i => i.getAttribute('aria-label')));
        check(`${tag} Edit on a filtered tournament day opens both of that day's pitchers`, c2.length === 2 && c2.some(c => c.startsWith('Alpha')), JSON.stringify(c2));
        await page.locator('button[aria-label="Close"]').click(); await page.waitForTimeout(200);
      }
      // filter "All Pitchers" restores
      await page.locator('button', { hasText: /^All Pitchers$/ }).click(); await page.waitForTimeout(200);
      const multi = (await cardNames()).some(c => c.names.length > 1);
      check(`${tag} clearing the filter shows multi-pitcher games again`, multi);
      check(`${tag} no page/console errors`, !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ════ 5: fold/unfold mid-task keeps Roster date/view, detail edit, Settings form ════
    {
      const { ctx, page, errs } = await openApp(browser, port, UL, bigData());
      const tag = '[fold]';
      await tab(page, 'Roster');
      await page.locator('button', { hasText: /^Tomorrow$/ }).click(); await page.waitForTimeout(200);
      await rowFor(page, 'Alpha').click(); await page.waitForTimeout(300);
      await page.locator('button[aria-label="Edit player details"]').click(); await page.waitForTimeout(200);
      const nameInput = page.locator('#root input').filter({ hasNot: page.locator('[type=date]') });
      await page.evaluate(() => { const i = [...document.querySelectorAll('#root input')].find(x => x.value === 'Alpha'); i.__mark = 'kept'; window.__listMark = [...document.querySelectorAll('h2')].find(h => h.textContent === 'ROSTER'); window.__listMark.__mark = 'kept'; });
      await page.evaluate(() => { const i = [...document.querySelectorAll('#root input')].find(x => x.value === 'Alpha'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Alpha Typed'); i.dispatchEvent(new Event('input', { bubbles: true })); });
      const editState = () => page.evaluate(() => ({ back: !!document.querySelector('button[aria-label="Back to roster"]'), typed: !![...document.querySelectorAll('#root input')].find(x => x.value === 'Alpha Typed'),
        sameInput: !![...document.querySelectorAll('#root input')].find(x => x.__mark === 'kept') }));
      // the open edit form with a half-typed name survives fold AND unfold (no Back in between)
      await resize(page, 457, 678); let es = await editState();
      check(`${tag} fold: detail becomes a drill-in (Back) and the half-typed name edit survives (same DOM input)`, es.back && es.typed && es.sameInput, JSON.stringify(es));
      await resize(page, 951, 669); es = await editState();
      check(`${tag} unfold again: detail embedded (no Back), half-typed edit still there (same DOM input)`, !es.back && es.typed && es.sameInput, JSON.stringify(es));
      for (let round = 1; round <= 3; round++) {
        await resize(page, 457, 678);
        await page.locator('button[aria-label="Back to roster"]').click(); await page.waitForTimeout(250);
        const tm = await page.locator('button[aria-pressed="true"]', { hasText: /^Tomorrow$/ }).count();
        const listSame = await page.evaluate(() => window.__listMark.isConnected);
        check(`${tag} round ${round} fold + Back: Roster still on Tomorrow, list not remounted`, tm === 1 && listSame, JSON.stringify({ tm, listSame }));
        await rowFor(page, 'Alpha').click(); await page.waitForTimeout(250);
        await resize(page, 951, 669);
        const un = await page.evaluate(() => ({ tm: [...document.querySelectorAll('button[aria-pressed="true"]')].some(b => b.textContent.trim() === 'Tomorrow'),
          listSame: window.__listMark.isConnected }));
        check(`${tag} round ${round} unfold: Roster still on Tomorrow, list not remounted, detail beside it`, un.tm && un.listSame && (await page.locator('button[aria-label="Back to roster"]').count()) === 0, JSON.stringify(un));
      }
      // tournament view survives too
      await page.evaluate(() => { const s = [...document.querySelectorAll('#root select')]; window.__selCount = s.length; });
      // Settings: half-filled Add Pitcher form survives fold + unfold
      await tab(page, 'Settings');
      await page.locator('input[aria-label="Name"]').fill('Zulu Half'); await page.locator('input[aria-label="Jersey number"]').fill('77');
      await page.evaluate(() => { document.querySelector('input[aria-label="Name"]').__mark = 'kept'; });
      for (const [w, h] of [[457, 678], [951, 669], [678, 457], [669, 951], [951, 669]]) {
        await resize(page, w, h);
        const s = await page.evaluate(() => { const n = document.querySelector('input[aria-label="Name"]'); const j = document.querySelector('input[aria-label="Jersey number"]');
          return { n: n && n.value, j: j && j.value, same: !!n && n.__mark === 'kept' }; });
        check(`${tag} Settings Add Pitcher form survives resize to ${w}x${h}`, s.n === 'Zulu Half' && s.j === '77' && s.same, JSON.stringify(s));
      }
      check(`${tag} no page/console errors across repeated folds`, !errs.length, errs.slice(0, 5).join(' | '));
      check(`${tag} no horizontal scroll after the folds`, (await hScroll(page)) <= 0);
      await ctx.close();
    }
    // Roster tournament view + custom date survive a fold; phone Back keeps the date
    {
      const data = bigData(); data.tournaments.push({ id: 'tnow', name: 'Now Cup', ago: 0, days: 3, dayLimits: [{ max: 50, isHard: true }, { max: 50, isHard: true }, { max: 50, isHard: true }], maxTotal: 100 });
      const { ctx, page, errs } = await openApp(browser, port, UL, data);
      await tab(page, 'Roster');
      const viewBtns = await page.evaluate(() => [...document.querySelectorAll('#root button[aria-pressed]')].map(b => b.textContent.trim()).slice(0, 12));
      // Switch the view to regular season (default is the active tournament) and pick In 2 Days
      const regBtn = page.locator('#root button', { hasText: /Regular/i }).first();
      const hasReg = await regBtn.count();
      if (hasReg) { await regBtn.click(); await page.waitForTimeout(200); }
      await page.locator('button', { hasText: /^In 2 Days$/ }).click(); await page.waitForTimeout(200);
      const snap = () => page.evaluate(() => [...document.querySelectorAll('#root button[aria-pressed="true"]')].map(b => b.textContent.trim()).filter(t => t.length < 30).sort().join('|'));
      const before = await snap();
      await resize(page, 457, 678); const mid = await snap(); await resize(page, 951, 669); const after = await snap();
      check('[fold tournament view] Roster view (regular vs active tournament) + "In 2 Days" survive fold and unfold', hasReg && before === mid && mid === after && /In 2 Days/.test(after),
        JSON.stringify({ hasReg, viewBtns, before, mid, after }));
      check('[fold tournament view] no errors', !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }
    {
      const { ctx, page, errs } = await openApp(browser, port, PH, bigData());
      await tab(page, 'Roster');
      await page.locator('button', { hasText: /^Tomorrow$/ }).click(); await page.waitForTimeout(150);
      await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(100);
      await rowFor(page, 'Kilo').click(); await page.waitForTimeout(250);
      const detail = await page.locator('button[aria-label="Back to roster"]').count();
      const top = await page.evaluate(() => { const h = [...document.querySelectorAll('#root *')].find(e => e.textContent.trim() === 'Kilo' && e.children.length === 0); return h ? h.getBoundingClientRect().top : null; });
      console.log(`      (info) phone: after tapping a row with the page scrolled 400px, the detail's name sits at y=${top} (page scrollY ${await page.evaluate(() => scrollY)})`);
      await page.locator('button[aria-label="Back to roster"]').click(); await page.waitForTimeout(250);
      const tm = await page.locator('button[aria-pressed="true"]', { hasText: /^Tomorrow$/ }).count();
      check('[phone 390x844] Back from a pitcher detail keeps the Roster date (Tomorrow)', detail === 1 && tm === 1, JSON.stringify({ detail, tm }));
      await rowFor(page, 'Alpha').click(); await page.waitForTimeout(250);
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200);
      const pd = await page.evaluate(() => { const bar = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).position === 'fixed' && getComputedStyle(d).bottom === '0px' && d.querySelector('button'));
        let max = 0; for (const e of document.querySelectorAll('#root button')) { if (bar.contains(e)) continue; const b = e.getBoundingClientRect(); if (b.width && b.height) max = Math.max(max, b.bottom); }
        return { max: Math.round(max), barTop: Math.round(bar.getBoundingClientRect().top) }; });
      check('[phone 390x844] PitcherDetail drill-in: last control clears the tab bar at the bottom of the page', pd.max <= pd.barTop, JSON.stringify(pd));
      await page.locator('button[aria-label="Back to roster"]').click(); await page.waitForTimeout(200);
      check('[phone 390x844] no errors', !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ════ 6: daily-max warning in Log Game (browser) + Live ════
    for (const v of [PH, UL]) {
      const { ctx, page, errs } = await openApp(browser, port, v, bigData());
      const tag = `[daily max ${v.n}]`;
      await tab(page, 'Log Game');
      await page.locator('button[aria-pressed="false"][aria-label="Delta"]').click(); await page.waitForTimeout(150);
      const cnt = page.locator('input[aria-label="Delta pitch count"]');
      await cnt.fill('35'); await page.waitForTimeout(150);
      check(`${tag} Delta 20 earlier today + 35 = 55: no warning`, (await page.locator('text=/daily max/').count()) === 0);
      await cnt.fill('36'); await page.waitForTimeout(150);
      const msg = await page.locator('text=/daily max/').first().textContent().catch(() => '');
      check(`${tag} Delta 20 + 36 = 56: inline warning "20p earlier today + 36p = 56p — over the 55p daily max"`, /20p earlier today \+ 36p = 56p — over the 55p daily max/.test(msg), msg);
      await cnt.fill('50'); await page.waitForTimeout(150);
      await page.locator('input[aria-label="Opponent"]').fill('Cubs');
      await page.locator('button', { hasText: /Save Game/ }).click(); await page.waitForTimeout(300);
      const warn = await page.locator('text=/would violate a limit/').count();
      const reason = await page.locator('text=/Delta — /').first().textContent().catch(() => '');
      check(`${tag} Save with 20 + 50 = 70 shows the warn-and-override card with the 70p reason`, warn === 1 && /70p — over the 55p daily max/.test(reason), reason);
      await page.locator('button', { hasText: /^Save Anyway$/ }).click(); await page.waitForTimeout(1200);
      const saved = await page.locator('text=/Game Saved!/').count();
      const hist = await page.evaluate(() => { const rs = window.__sets.filter(s => s[0] === 'roster').slice(-1)[0]; const arr = Array.isArray(rs[1]) ? rs[1] : Object.values(rs[1]);
        return arr.find(p => p.name === 'Delta').history.filter(h => h.date === window.__d(0)).map(h => h.pitches); });
      check(`${tag} Save Anyway logs it (Delta today: 20 and 50)`, saved === 1 && JSON.stringify(hist.sort()) === '[20,50]', JSON.stringify({ saved, hist }));
      // tournament context: the regular daily max doesn't apply
      await page.locator('button', { hasText: /Log Another|Log another|New Game|Log Game/ }).first().click().catch(() => {}); await page.waitForTimeout(200);
      check(`${tag} no page/console errors`, !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }
    {
      // Tournament context in Log Game: a 52-pitch Day 1 game in a 60/hard, 100-total tournament -> no daily-max warning
      const data = bigData(); data.tournaments.push({ id: 'tnow', name: 'Now Cup', ago: 0, days: 2, dayLimits: [{ max: 60, isHard: true }, { max: 60, isHard: true }], maxTotal: 100 });
      const { ctx, page, errs } = await openApp(browser, port, PH, data);
      await tab(page, 'Log Game');
      await page.locator('#root button', { hasText: /Now Cup/ }).first().click(); await page.waitForTimeout(200);
      await page.locator('button[aria-pressed="false"][aria-label="Echo"]').click();
      await page.locator('input[aria-label="Echo pitch count"]').fill('58'); await page.waitForTimeout(150);
      const dm = await page.locator('text=/daily max/').count(); const anyWarn = await page.locator('text=/⚠/').count();
      check('[daily max tournament] tournament game of 58 (Day limit 60): no daily-max / violation warning', dm === 0 && anyWarn === 0, JSON.stringify({ dm, anyWarn }));
      await page.locator('input[aria-label="Echo pitch count"]').fill('61'); await page.waitForTimeout(150);
      const tw = await page.locator('text=/Day 1 limit/').count();
      check('[daily max tournament] 61 still trips the tournament Day 1 limit (own rules intact)', tw >= 1);
      check('[daily max tournament] no errors', !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }
    {
      // Live "Log Complete Game": Delta active with 36 (20 logged earlier today) -> warn card with daily max
      const data = bigData(); data.live = { id: 'live2', context: 'regular', opponent: 'Cubs', startedAt: 1, startedBy: 'T',
        pitchers: { p3: { pitches: 36, status: 'active', order: 0, enteredAt: 1, leftAt: null } } };
      const { ctx, page, errs } = await openApp(browser, port, UP, data);
      await tab(page, 'Live');
      await page.locator('button', { hasText: 'Log Complete Game' }).click(); await page.waitForTimeout(300);
      const txt = await page.evaluate(() => document.body.innerText);
      check('[daily max Live] 20 earlier + 36 live -> warn card names the 56p daily-max overage', /would violate a limit/.test(txt) && /56p — over the 55p daily max/.test(txt), (txt.match(/.*daily max.*/g) || []).join(' / '));
      await page.locator('button', { hasText: /^Go Back$/ }).click(); await page.waitForTimeout(200);
      await page.locator('button[aria-label="Subtract 1 pitch for Delta"]').click(); await page.waitForTimeout(300);
      await page.locator('button', { hasText: 'Log Complete Game' }).click(); await page.waitForTimeout(500);
      const t2 = await page.evaluate(() => document.body.innerText);
      check('[daily max Live] at exactly 55 (20 + 35) it logs with no warning', !/would violate a limit/.test(t2) && (await page.evaluate(() => window.__fbCalls.includes('claimLive'))), (t2.match(/.*(violate|Logged).*/g) || []).join(' / '));
      check('[daily max Live] no errors', !errs.length, errs.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ════ Stability: empty roster / no games, every tab, every layout, folds ════
    for (const v of [PH, FP, UL, UP]) {
      const { ctx, page, errs } = await openApp(browser, port, v, { roster: [], tournaments: [] });
      for (const s of ['Roster', 'Live', 'Log Game', 'Season', 'Settings', 'Roster']) await tab(page, s);
      await resize(page, 457, 678); await resize(page, 951, 669); await resize(page, 669, 951);
      for (const s of ['Live', 'Season', 'Settings']) await tab(page, s);
      const info = await paneInfo(page);
      check(`[empty ${v.n}] empty roster + no games: every tab renders, folds fine, no errors`, !errs.length && (await page.locator('text=/Something went wrong|Error/i').count()) === 0,
        errs.slice(0, 5).join(' | '));
      check(`[empty ${v.n}] two-pane panes still reach the bottom when empty (after unfolding to 669x951)`, info.panes.every(p => Math.abs(p.bottom - info.ih) <= 1), JSON.stringify(info));
      await ctx.close();
    }
    // Live with only an off-roster pitcher + tab switching + rotations
    {
      const data = bigData(); data.live = { id: 'live3', context: 'regular', opponent: 'X', startedAt: 1, startedBy: 'T', pitchers: { ghost: { pitches: 30, status: 'active', order: 0, enteredAt: 1, leftAt: null } } };
      const { ctx, page, errs } = await openApp(browser, port, UL, data);
      await tab(page, 'Live');
      const empty = await page.locator('text=/No one yet/').count();
      check('[ghost live] a live game whose only pitcher is no longer on the roster renders (IN THE GAME empty), no crash', empty === 1);
      for (const [w, h] of [[669, 951], [457, 678], [678, 457], [951, 669], [390, 844], [951, 669]]) {
        await resize(page, w, h);
        for (const s of ['Roster', 'Live', 'Season', 'Log Game', 'Settings', 'Live']) await tab(page, s);
      }
      check('[ghost live] no page/console errors across rotations, folds and tab switches', !errs.length, errs.slice(0, 5).join(' | '));
      check('[ghost live] no horizontal scroll at the end', (await hScroll(page)) <= 0);
      await ctx.close();
    }
  } catch (e) {
    failed++; console.log('FAIL  (harness) ' + (e && e.stack || e));
  } finally {
    await browser.close(); server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
