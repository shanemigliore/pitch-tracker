#!/usr/bin/env node
/**
 * Browser verification of the iPhone Duo layout rules (v3.14 side insets,
 * landscape, Log Game rename, admin-only DisplayInfoSection; v3.15 narrow-screen
 * "corner mode" (Home Screen app only - a browser tab keeps the v3.14 full-height strip), flat 32px --top-gap in a wide Home Screen app, DisplayInfo
 * delayed re-measure + Refresh; v3.16 wide frame: left tab rail in wide landscape,
 * centeredColumn, Live two-pane, --hdr-r; v3.17 two-pane Roster/Season/Log Game/Settings with
 * sticky right panes, modal dialogs when wide). Playwright + headless Chromium; prints SKIP
 * and exits 0 if playwright isn't installed.
 *
 * WHAT IS SIMULATED (headless Chromium can't fake either of these):
 *  - env(safe-area-inset-*): the test server rewrites `env(safe-area-inset-X, 0px)`
 *    in index.html's <style> to fixed px values for that view (so the real
 *    --safe-l/--safe-r -> --corner-r -> body/body::after chain is exercised).
 *    env() used inline in components (nav paddingBottom, DisplayInfo probe) stays 0.
 *  - display-mode: standalone: for "standalone" views the server rewrites
 *    `(display-mode: standalone)` in index.html's <style> to `(min-width: 0px)`
 *    (always matches). matchMedia() in DisplayInfoSection is NOT rewritten.
 *  - Firebase is stubbed (no network): signed-in admin (or coach) + sample roster
 *    with a game from last year (so Season shows its year <select>). The live-game
 *    stub applies __fbMutateLiveGame's mutate() to its copy and echoes it back (like
 *    the real transaction + local apply); __fbClaimLiveGame returns null unless
 *    window.__claimWins is set; __fbSet records its payloads in window.__sets.
 *  - The on-screen keyboard (viewport height shrinking) is simulated with setViewportSize;
 *    whether iOS standalone actually shrinks innerHeight for the keyboard is NOT verified.
 * Device numbers are the real iPhone Duo measurements from the app's Display card.
 * Run with: node tests/duo-layout.browser.verify.test.js
 */
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('SKIP  duo-layout browser tests: playwright not installed'); process.exit(0); }
const http = require('http'); const fs = require('fs'); const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png' };
const CORNER_H = 164; // must match --corner-h in index.html (static test pins the var itself)

function stub(role) {
  return `(function(){
  const today = new Date(); const d = n => { const x = new Date(today); x.setDate(x.getDate()-n); return x.toISOString().slice(0,10); };
  const names = [["Johnny","00",16,9],["Holden","20",10,9],["Carter","23",18,1],["Mason","7",44,1],["Eli","12",8,4],["Luke","3",25,6]];
  const roster = names.map(([name,jersey,p,ago],i)=>({ id:"t_"+i, name, jersey, lastPitches:p, lastGameDate:d(ago),
    history:[{ gameId:"g"+i, date:d(ago), pitches:p, opponent:"Rockies", isTournament:false, tournamentId:null, tournamentName:null, tourneyDay:null, sharedGameId:"sg"+ago }] }));
  // one game from last year so the Season tab renders its year <select>
  roster[0].history.unshift({ gameId:"gold", date:(today.getFullYear()-1)+"-06-01", pitches:20, opponent:"Old", isTournament:false, tournamentId:null, tournamentName:null, tourneyDay:null, sharedGameId:"sgold" });
  const meta = { id:"demo10u", name:"Prime 10U", rules:{ maxPitches:55, rest1:20, rest2:40, rest3:60 }, seasonId:"2026_fall" };
  const role = ${JSON.stringify(role)};
  const user = { email: role==="admin" ? "admin@prime-pitchtracker.app" : "coach@prime-pitchtracker.app", isAnonymous:false };
  const R = v => Promise.resolve(v);
  window.__fbCalls = [];
  const rec = (n, v) => (...a) => { window.__fbCalls.push(n); return R(v); };
  const now = Date.now();
  window.__demoLive = { id:"live1", date:d(0), context:"regular", opponent:"Rockies", startedAt:now, startedBy:"Tester",
    pitchers:{ t_0:{ pitches:22, status:"left", order:0, enteredAt:now-3e6, leftAt:now-1e6 }, t_1:{ pitches:17, status:"active", order:1, enteredAt:now-1e6, leftAt:null } } };
  Object.assign(window, {
    __fbRoleForUser: u => u ? role : null,
    __fbOnAuthChange: cb => { window.__authCb = cb; setTimeout(()=>cb(window.__signedOut ? null : user),0); return ()=>{}; },
    __fbSignOut: rec("signOut"), __fbSignIn: rec("signIn"),
    __fbMigrateIfNeeded: ()=>R(), __fbCreatePrime12U: ()=>R(), __fbCreatePrime10U: ()=>R(), __fbMigrateSeasonIfNeeded: ()=>R(),
    __fbListSeasons: ()=>R([{ id:"2026_fall", term:"Fall", year:2026, createdAt:1 }]),
    __fbCreateSeason: rec("createSeason","2026_fall"), __fbGetRoster: ()=>R([]),
    __fbListTeams: ()=>R([meta]),
    __fbCreateTeam: rec("createTeam"), __fbUpdateTeamMeta: rec("updateTeamMeta"), __fbDeleteTeam: rec("deleteTeam"),
    __fbSubscribe: (onData, onConn, onOffline) => { window.__goOffline = onOffline; window.__pushData = onData; window.__stubRoster = roster; setTimeout(()=>{ onData({ roster, tournaments:[] }); onConn(); },0); return ()=>{}; },
    __fbSet: rec("set"),
    __fbWatchLiveGame: (tid, cb) => { window.__setLive = v => { window.__liveCur = v; cb(v); }; setTimeout(()=>cb(null),0); return ()=>{}; },
    __fbStartLiveGame: rec("startLive",true),
    __fbMutateLiveGame: (t, gid, mutate) => { window.__fbCalls.push("mutateLive");
      const next = mutate(window.__liveCur ? JSON.parse(JSON.stringify(window.__liveCur)) : null);
      if (next !== undefined) setTimeout(() => window.__setLive(next), 0); return R(); },
    __fbClaimLiveGame: () => { window.__fbCalls.push("claimLive"); if (!window.__claimWins) return R(null);
      const c = window.__liveCur; window.__setLive(null); return R(c); },
  });
  window.__sets = []; const _fbSet = window.__fbSet;
  window.__fbSet = (k, v, ...a) => { window.__sets.push([k, JSON.parse(JSON.stringify(v ?? null))]); return _fbSet(k, v, ...a); };
  localStorage.setItem("pt_selected_team_id","demo10u");
  localStorage.setItem("pt_selected_team_meta", JSON.stringify(meta));
  if (!window.__noName) localStorage.setItem("pt_coach_name","Tester");
  window.__lsWrites = [];
  const _set = Storage.prototype.setItem, _rem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function(k,v){ window.__lsWrites.push("set:"+k); return _set.call(this,k,v); };
  Storage.prototype.removeItem = function(k){ window.__lsWrites.push("rm:"+k); return _rem.call(this,k); };
})();`;
}

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}${detail ? '\n      ' + detail : ''}`); }
}

// ?sim=T,R,B,L&sa=1 -> rewrite env() insets / display-mode in index.html's <style> only.
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

async function openApp(browser, port, { w, h, t = 0, l = 0, r = 0, b = 0, sa = false, role = 'admin', init = '' }, waitFor = 'button:has-text("TEAM")') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|babel/i.test(m.text())) errs.push('console: ' + m.text()); });
  const external = [];
  page.on('request', q => { const u = q.url(); if (!u.startsWith(`http://localhost:${port}`)) external.push(u); });
  if (init) await page.addInitScript(init);
  await page.route('**/firebasejs/**', x => x.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/lib/firebase-init.js', x => x.fulfill({ contentType: 'text/javascript', body: stub(role) }));
  await page.route('**/fonts.googleapis.com/**', x => x.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto(`http://localhost:${port}/?sim=${t},${r},${b},${l}${sa ? '&sa=1' : ''}`);
  await page.waitForSelector(waitFor, { timeout: 30000 });
  await page.waitForTimeout(500);
  return { ctx, page, errs, external };
}

// Visible interactive elements (clipped by a horizontally scrolling ancestor where relevant).
// zone: { l, r, cornerR, cornerH } -> violations: in left strip, in right strip (non-corner),
// or intersecting the top-right corner rect (corner mode). `within` limits to a subtree.
async function insetViolations(page, zone, within) {
  return page.evaluate(([z, within]) => {
    const vw = document.documentElement.clientWidth, out = [];
    const rootEl = within ? document.querySelector(within) : document;
    if (!rootEl) return ['(no ' + within + ')'];
    for (const el of rootEl.querySelectorAll('button, input, select, textarea, a, [role=button], [style*="cursor: pointer"]')) {
      const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      let clip = null; for (let p = el; p; p = p.parentElement) {
        if (getComputedStyle(p).position === 'fixed') break;
        if (p === el) continue;
        const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { clip = p.getBoundingClientRect(); break; } }
      const left = clip ? Math.max(b.left, clip.left) : b.left, right = clip ? Math.min(b.right, clip.right) : b.right;
      if (right <= left) continue;
      const tag = `${el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)}" [${Math.round(left)},${Math.round(right)}]x[${Math.round(b.top)},${Math.round(b.bottom)}] vw=${vw}`;
      if (left < z.l - 0.5) out.push('left strip: ' + tag);
      if (z.cornerR) {
        // Full-width tappable rows/banners (wider than half the screen) may run under the
        // cover - they're still tappable to the left of it; their text is checked separately
        // (textUnderCorner). Any smaller control must not touch the corner at all.
        if (right - left <= vw / 2 && right > vw - z.cornerR + 0.5 && b.top < z.cornerH - 0.5 && b.bottom > 0.5) out.push('corner: ' + tag);
      } else if (right > vw - z.r + 0.5) out.push('right strip: ' + tag);
    }
    return out;
  }, [zone, within || null]);
}
// Visible text glyphs (not interactive) under the corner cover at scroll 0.
async function textUnderCorner(page, cornerR, cornerH) {
  return page.evaluate(([cr, ch]) => {
    const vw = document.documentElement.clientWidth, out = [];
    const tw = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) {
      if (!n.textContent.trim()) continue;
      const pe = n.parentElement; const cs = getComputedStyle(pe);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const b of rg.getClientRects()) if (b.width && b.right > vw - cr + 0.5 && b.top < ch - 0.5 && b.bottom > 0.5)
        out.push(`"${n.textContent.trim().slice(0, 24)}" [${Math.round(b.left)},${Math.round(b.right)}]x[${Math.round(b.top)},${Math.round(b.bottom)}]`);
    }
    return out;
  }, [cornerR, cornerH]);
}
// Informational: how far below the cover's bottom edge the first text/control in the corner column starts.
async function cornerSlack(page, cr, ch) {
  return page.evaluate(([cr, ch]) => {
    const vw = document.documentElement.clientWidth; let min = Infinity;
    const tw = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n);
      for (const b of rg.getClientRects()) if (b.width && b.right > vw - cr && b.bottom > ch - 40 && b.top < innerHeight - 90) min = Math.min(min, b.top); }
    for (const el of document.querySelectorAll('#root button, #root input, #root select')) { const b = el.getBoundingClientRect();
      if (b.width && b.width <= vw / 2 && b.right > vw - cr && b.bottom > ch - 40 && b.top < innerHeight - 90) min = Math.min(min, b.top); }
    return min === Infinity ? null : Math.round(min - ch);
  }, [cr, ch]);
}
// Interactive elements / text intersecting an absolute screen rect [x1,y1,x2,y2] (e.g. the
// unfolded Duo's measured status-icon cluster) at the current scroll position.
async function rectHits(page, rc) {
  return page.evaluate(([x1, y1, x2, y2]) => {
    const out = [], hit = b => b.width && b.right > x1 && b.left < x2 && b.bottom > y1 && b.top < y2;
    for (const el of document.querySelectorAll('button, input, select, textarea, a, [role=button]')) {
      const b = el.getBoundingClientRect(); if (hit(b) && getComputedStyle(el).visibility !== 'hidden')
        out.push(`${el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}" [${Math.round(b.left)},${Math.round(b.right)}]x[${Math.round(b.top)},${Math.round(b.bottom)}]`); }
    const tw = document.createTreeWalker(document.getElementById('root'), NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n);
      for (const b of rg.getClientRects()) if (hit(b)) out.push(`text "${n.textContent.trim().slice(0, 20)}" [${Math.round(b.left)},${Math.round(b.right)}]x[${Math.round(b.top)},${Math.round(b.bottom)}]`); }
    return out;
  }, rc);
}
const hScroll = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tabBtn = (page, label) => page.locator('button', { hasText: new RegExp('^' + label + '$', 'i') }).last();
const scrollTop = page => page.evaluate(() => window.scrollTo(0, 0));
const cssVar = (page, name) => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const px = (page, sel, prop) => page.evaluate(([s, p]) => parseFloat(getComputedStyle(document.querySelector(s))[p]), [sel, prop]);

// Visit every screen/state; returns [{state, violations, text}] at scroll 0.
async function sweep(page, zone, { withLive = false } = {}) {
  const res = [];
  const snap = async state => {
    await scrollTop(page); await page.waitForTimeout(150);
    res.push({ state, icons: zone.icons ? await rectHits(page, zone.icons) : [], slack: zone.cornerR ? await cornerSlack(page, zone.cornerR, zone.cornerH) : null, v: await insetViolations(page, zone), t: zone.cornerR ? await textUnderCorner(page, zone.cornerR, zone.cornerH) : [],
      scroll: await hScroll(page) });
  };
  await tabBtn(page, 'Roster').click(); await page.waitForTimeout(250); await snap('Roster');
  // drill-in with edit open
  await page.locator('#root div[style*="cursor: pointer"]', { hasText: "Johnny" }).first().click(); await page.waitForTimeout(250); await snap('PitcherDetail');
  await page.locator('button[aria-label="Edit player details"]').click(); await page.waitForTimeout(200); await snap('PitcherDetail+edit');
  // v3.17: in two-pane the detail is embedded beside the list (no Back button)
  const back = page.locator('button[aria-label="Back to roster"]');
  res.embedded = (await back.count()) === 0;
  if (!res.embedded) { await back.click(); await page.waitForTimeout(200); }
  await tabBtn(page, 'Live').click(); await page.waitForTimeout(250); await snap('Live (setup)');
  if (withLive) {
    await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300); await snap('Live (in progress)');
    res.twoPane = await page.evaluate(() => !![...document.querySelectorAll('div')].find(d => getComputedStyle(d).display === 'grid'));
    // v3.16: Undo toast after bringing a pitcher in (stub applies the mutation)
    await page.locator('button[aria-label^="Bring in "]').first().click(); await page.waitForTimeout(300);
    res.undoShown = await page.locator('button', { hasText: /^Undo$/ }).count();
    await snap('Live (undo toast)');
    // v3.16: warn-violations card (Mason owes rest -> Log Complete Game asks to override)
    await page.evaluate(() => window.__setLive({ ...window.__demoLive, pitchers: { t_3: { pitches: 10, status: 'active', order: 0, enteredAt: Date.now(), leftAt: null } } }));
    await page.waitForTimeout(300);
    await page.locator('button', { hasText: 'Log Complete Game' }).click(); await page.waitForTimeout(250);
    res.warnShown = await page.locator('text=/would violate a limit/').count();
    await snap('Live (warn violations)');
    await page.locator('button', { hasText: /^Go Back$/ }).click(); await page.waitForTimeout(150);
    await page.evaluate(() => window.__setLive({ ...window.__demoLive, date: '2020-01-01' })); await page.waitForTimeout(300); await snap('Live (unfinished banner)');
  }
  await tabBtn(page, 'Log Game').click(); await page.waitForTimeout(250); await snap('Log Game');
  const pick = page.locator('button[aria-pressed="false"][aria-label="Carter"]');
  if (await pick.count()) { await pick.click(); await page.waitForTimeout(200); }
  await snap('Log Game (pitcher selected)');
  await tabBtn(page, 'Season').click(); await page.waitForTimeout(250);
  res.yearSelect = await page.locator('select[aria-label="Year"]').count();
  await snap('Season');
  await tabBtn(page, 'Settings').click(); await page.waitForTimeout(200); await snap('Settings/Roster');
  for (const s of ['Tournaments', 'Account']) { await page.locator('button', { hasText: new RegExp('^' + s + '$') }).click(); await page.waitForTimeout(200); await snap('Settings/' + s); }
  return res;
}

(async () => {
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    // corner: whether v3.15 corner mode should be active (max-width 520 and a right inset)
    const views = [
      { name: 'phone 390x844 no insets', w: 390, h: 844 },
      { name: 'phone landscape 844x390 l=r=47', w: 844, h: 390, l: 47, r: 47, b: 21 },
      { name: 'duo folded portrait 457x678 r=84 standalone', w: 457, h: 678, r: 84, b: 34, sa: true, corner: true },
      // browser tab at <=520px: no corner mode, v3.14 full-height strip rule
      { name: 'duo folded portrait 457x678 r=84 browser tab', w: 457, h: 678, r: 84, b: 34 },
      { name: 'duo folded landscape 678x457 r=84 standalone', w: 678, h: 457, r: 84, b: 34, sa: true },
      // the other way up: the 84px lands on the left
      { name: 'duo folded landscape 678x457 l=84 standalone', w: 678, h: 457, l: 84, b: 34, sa: true },
      // icons: the measured status-icon cluster (x 548..643, y 28..67) - with the flat 32px top gap
      // nothing may sit there any more
      { name: 'duo unfolded portrait 669x951 t=82 standalone', w: 669, h: 951, t: 82, b: 34, sa: true, icons: [548, 28, 643, 67] },
      { name: 'duo unfolded landscape 951x669 r=84 standalone', w: 951, h: 669, r: 84, b: 34, sa: true },
      { name: 'narrow 450x667 r=52 standalone', w: 450, h: 667, r: 52, sa: true, corner: true },
      { name: 'narrow 450x667 r=52 browser tab', w: 450, h: 667, r: 52 },
      { name: 'boundary 520x700 r=40 standalone (corner mode)', w: 520, h: 700, r: 40, sa: true, corner: true },
      { name: 'boundary 521x700 r=40 standalone (no corner mode)', w: 521, h: 700, r: 40, sa: true },
      { name: 'landscape notch-left 667x450 l=47', w: 667, h: 450, l: 47 },
      { name: 'asymmetric 450x667 l=10 r=60 standalone', w: 450, h: 667, l: 10, r: 60, sa: true, corner: true },
      { name: 'asymmetric 450x667 l=10 r=60 browser tab', w: 450, h: 667, l: 10, r: 60 },
      { name: 'wide 890x800 r=40', w: 890, h: 800, r: 40 },
      { name: 'wide landscape 1000x700 l=30 r=30', w: 1000, h: 700, l: 30, r: 30 },
    ];
    for (const v of views) {
      const { ctx, page, errs } = await openApp(browser, port, v);
      const { l = 0, r = 0 } = v;
      const zone = { l, r, cornerR: v.corner ? r : 0, cornerH: CORNER_H, icons: v.icons };
      const vw = await page.evaluate(() => document.documentElement.clientWidth);

      // ── CSS vars / corner cover ──
      const cornerR = parseFloat(await cssVar(page, '--corner-r'));
      check(`[${v.name}] --corner-r = ${v.corner ? r : 0}px`, cornerR === (v.corner ? r : 0), 'got ' + cornerR);
      const pad = await page.evaluate(() => { const c = getComputedStyle(document.body); return { l: parseFloat(c.paddingLeft), r: parseFloat(c.paddingRight) }; });
      check(`[${v.name}] body padding L/R = ${l}/${v.corner ? 0 : r}`, pad.l === l && pad.r === (v.corner ? 0 : r), JSON.stringify(pad));
      const cover = await page.evaluate(() => { const c = getComputedStyle(document.body, '::after');
        return { w: parseFloat(c.width), h: parseFloat(c.height), pos: c.position, top: c.top, right: c.right, bg: c.backgroundColor, pe: c.pointerEvents, z: c.zIndex }; });
      check(`[${v.name}] body::after cover is ${v.corner ? r + 'x' + CORNER_H + ' opaque at top-right' : 'zero-width'}, pointer-events none`,
        cover.pos === 'fixed' && cover.top === '0px' && cover.right === '0px' && cover.pe === 'none' &&
        (v.corner ? cover.w === r && cover.h === CORNER_H && cover.bg === 'rgb(8, 12, 20)' : cover.w === 0), JSON.stringify(cover));
      if (v.corner) {
        // a tap in the cover reaches the page below (pointer-events none) - and the cover is visually on top
        const hit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName : null; }, [vw - 2, 100]);
        check(`[${v.name}] taps in the corner fall through the cover (not swallowed)`, hit && hit !== 'HTML', String(hit));
      }

      // ── Sweep every screen/state at scroll 0 ──
      const states = await sweep(page, zone, { withLive: true });
      // ── v3.16 layout mode ──
      const expRail = v.w >= 600 && v.w > v.h;
      const expTwo = v.w >= 600 && (v.w - l - r - (expRail ? 72 : 0) - 32) >= 616;
      check(`[${v.name}] Live in progress is ${expTwo ? 'two-pane' : 'one column'}`, states.twoPane === expTwo, 'twoPane=' + states.twoPane);
      check(`[${v.name}] Roster detail is ${expTwo ? 'embedded beside the list (no Back)' : 'a drill-in with Back'}`, states.embedded === expTwo, 'embedded=' + states.embedded);
      check(`[${v.name}] Undo toast shown after bringing a pitcher in; warn-violations card shown`, states.undoShown === 1 && states.warnShown === 1, JSON.stringify({ u: states.undoShown, w: states.warnShown }));
      const bad = states.flatMap(s => s.v.map(x => s.state + ': ' + x));
      check(`[${v.name}] no interactive element in ${v.corner ? 'left strip or top-right corner' : 'side inset strips'} (all tabs + drill-in/edit/live/log states)`,
        !bad.length, bad.slice(0, 8).join('\n      '));
      if (/^duo folded portrait|^narrow|^asymmetric/.test(v.name)) {
        // regression for the v3.15 browser-tab finding: Live "Np total" / Unfinished banner text
        // must be visible (not under the cover, not in the strip) in both modes
        const live = states.filter(s => /^Live \((in progress|unfinished)/.test(s.state));
        const hidden = live.flatMap(s => s.t.map(x => s.state + ': ' + x));
        const inStrip = await (async () => { await tabBtn(page, 'Live').click(); await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300); await scrollTop(page);
          return page.evaluate(([r, ch, corner]) => { const vw = document.documentElement.clientWidth;
            const sp = [...document.querySelectorAll('span')].find(x => /\dp total$/.test(x.textContent)); if (!sp) return 'missing';
            const b = sp.getBoundingClientRect(); return (b.right <= vw - r + 0.5 || (corner && b.top >= ch)) ? null : JSON.stringify(b); }, [r, CORNER_H, !!v.corner]); })();
        check(`[${v.name}] Live "Np total" and Unfinished-banner text fully visible`, live.length === 2 && !hidden.length && !inStrip, hidden.concat(inStrip || []).join('; '));
        await page.evaluate(() => window.__setLive(null)); await page.waitForTimeout(200);
      }
      if (v.icons) {
        const ih = states.flatMap(s => s.icons.map(x => s.state + ': ' + x));
        check(`[${v.name}] nothing (controls or text) under the status icons at scroll 0 on any screen`, !ih.length, ih.slice(0, 6).join('\n      '));
      }
      const scroll = states.filter(s => s.scroll > 0).map(s => `${s.state}: +${s.scroll}px`);
      check(`[${v.name}] no horizontal page scroll on any screen`, !scroll.length, scroll.join(', '));
      check(`[${v.name}] Season shows the year <select> (multi-year data)`, states.yearSelect === 1);
      if (v.corner) console.log(`INFO  [${v.name}] px between cover bottom and first corner-column content: ` + states.map(s => `${s.state}=${s.slack}`).join(', '));
      if (v.corner) {
        const txt = states.flatMap(s => s.t.map(x => s.state + ': ' + x));
        check(`[${v.name}] no visible text hidden under the corner cover at scroll 0`, !txt.length, txt.slice(0, 8).join('\n      '));
      }

      // ── Header TEAM button and bottom nav ──
      const team = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'TEAM').getBoundingClientRect(); return { right: b.right, top: b.top, bottom: b.bottom }; });
      check(`[${v.name}] TEAM button clear of the right inset`, team.right <= vw - r + 0.5, JSON.stringify(team));
      const nav = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].filter(b => /^ROSTER$/i.test(b.textContent.trim())).pop();
        let n = btn; while (n && getComputedStyle(n).position !== 'fixed') n = n.parentElement;
        const R = e => { const b = e.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
        const wrap = document.querySelector('#root > div');
        return { tag: n.tagName, outer: R(n), inner: n.tagName === 'NAV' ? null : R(n.firstElementChild), btns: [...n.querySelectorAll('button')].map(R),
          bottomBars: [...document.querySelectorAll('#root div')].filter(d => getComputedStyle(d).position === 'fixed' && /ROSTER/.test(d.textContent) && /SETTINGS/.test(d.textContent)).length,
          wrapPadL: parseFloat(getComputedStyle(wrap).paddingLeft), vw: document.documentElement.clientWidth, vh: innerHeight };
      });
      const availL = l, availR = nav.vw - (v.corner ? 0 : r);
      const col = await page.evaluate(() => { const b = document.querySelector('#root > div').getBoundingClientRect(); return { left: b.left, right: b.right }; });
      if (expRail) {
        check(`[${v.name}] rail: 72px <nav> at left:safe-l, full height, all 5 tabs inside, no bottom bar`,
          nav.tag === 'NAV' && Math.abs(nav.outer.left - l) < 0.5 && Math.abs(nav.outer.right - nav.outer.left - 72) < 0.5 && nav.outer.top === 0 && Math.abs(nav.outer.bottom - nav.vh) < 1 &&
          nav.btns.length === 5 && nav.btns.every(b => b.bottom <= nav.vh + 0.5 && b.left >= l - 0.5) && nav.bottomBars === 0, JSON.stringify(nav));
        check(`[${v.name}] rail: App wrapper spans the body box with paddingLeft 72`, nav.wrapPadL === 72 && Math.abs(col.left - availL) < 1 && Math.abs(col.right - availR) < 1, JSON.stringify({ col, padL: nav.wrapPadL }));
      } else {
        check(`[${v.name}] no rail; bottom bar's outer box spans [safe-l, vw - (safe-r - corner-r)] at the bottom`,
          nav.tag === 'DIV' && Math.abs(nav.outer.left - availL) < 0.5 && Math.abs(nav.outer.right - availR) < 0.5 && Math.abs(nav.outer.bottom - nav.vh) < 1 &&
          (await page.locator('nav[aria-label="Tabs"]').count()) === 0, JSON.stringify(nav));
        check(`[${v.name}] bottom bar within ${v.corner ? '[safe-l, vw]' : 'insets'}, ${v.w >= 600 ? 'full frame width' : '<=430 wide'}, aligned with the App column`,
          nav.inner.left >= availL - 0.5 && nav.inner.right <= availR + 0.5 && (v.w >= 600 || nav.inner.right - nav.inner.left <= 430.5) &&
          Math.abs(col.left - nav.inner.left) < 1 && Math.abs(col.right - nav.inner.right) < 1 &&
          (v.corner ? nav.inner.right - nav.inner.left >= Math.min(430, availR - availL) - 0.5 : true), JSON.stringify({ col, nav }));
      }
      // v3.16 intent: the phone-width content column is centred on the SCREEN, nudged only as far as
      // needed to clear the insets (and the rail). Measured on the Roster tab, which is a 430 column on
      // every size except two-pane (v3.17: two-pane screens use the full frame - checked in the v3.17 block).
      if (!expTwo) {
        await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200); await scrollTop(page);
        const sc = await page.evaluate(() => { const wrap = document.querySelector('#root > div'); let e = document.querySelector('h2');
          while (e && e.parentElement !== wrap) e = e.parentElement; const b = e.getBoundingClientRect(); return { left: b.left, right: b.right }; });
        const lb = availL + (expRail ? 72 : 0), w = sc.right - sc.left;
        const expC = Math.min(Math.max(nav.vw / 2, lb + w / 2), availR - w / 2), gotC = (sc.left + sc.right) / 2;
        check(`[${v.name}] content column centred on the screen (nudged only to clear insets${expRail ? '/rail' : ''})`,
          w <= 430.5 && Math.abs(gotC - expC) < 1, JSON.stringify({ col: sc, center: gotC, expected: expC, screenCenter: nav.vw / 2 }));
      }
      if (v.corner) {
        // content below the corner uses the full width: Roster's cards extend past vw - r
        await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200); await scrollTop(page);
        const wide = await page.evaluate(([ch, r]) => {
          const vw = document.documentElement.clientWidth;
          // screen-level blocks (cards, rows) that start below the corner, excluding the fixed nav
          const cards = [...document.querySelectorAll('#root div')].filter(d => !d.closest('[style*="position: fixed"]'))
            .map(b => b.getBoundingClientRect()).filter(b => b.top >= ch && b.bottom < innerHeight - 80 && b.width > 100);
          const col = document.querySelector('#root > div').getBoundingClientRect();
          return { n: cards.length, maxRight: Math.max(...cards.map(b => b.right)), limit: vw - r, colInner: col.right - 16 };
        }, [CORNER_H, r]);
        // full column width (column right - 16px screen padding); on the Duo that is also past vw - safe-r
        check(`[${v.name}] content below the corner uses the full column width${wide.colInner > wide.limit ? ' (past vw - safe-r)' : ''}`,
          wide.n > 0 && Math.abs(wide.maxRight - wide.colInner) < 1 && (wide.colInner <= wide.limit || wide.maxRight > wide.limit + 1), JSON.stringify(wide));
      }

      // ── Modal 1: Roster rules sheet ──
      await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200); await scrollTop(page);
      await page.locator('button[aria-label="View availability key and rest requirements"]').click();
      await page.waitForTimeout(250);
      const m1 = await modalGeom(page);
      check(`[${v.name}] rules sheet: backdrop full-screen, sheet inside FULL insets, centered`,
        m1 && m1.backdrop.left === 0 && Math.abs(m1.backdrop.right - m1.vw) < 1 && m1.sheet.left >= l - 0.5 && m1.sheet.right <= m1.vw - r + 0.5 &&
        Math.abs((m1.sheet.left + m1.sheet.right) / 2 - (l + m1.vw - r) / 2) < 1, JSON.stringify(m1));
      const mv = await insetViolations(page, { l, r }, '[data-test-modal]');
      check(`[${v.name}] rules sheet: no interactive element of the sheet in the inset strips`, !mv.length, mv.join('; '));
      await clickBackdrop(page); await page.waitForTimeout(200);
      check(`[${v.name}] rules sheet closes on backdrop tap`, !(await modalGeom(page)));

      // ── Modal 2: Season tab edit-game sheet ──
      await tabBtn(page, 'Season').click(); await page.waitForTimeout(250);
      const opened = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^Edit$/.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; });
      await page.waitForTimeout(250);
      const m2 = opened && await modalGeom(page);
      check(`[${v.name}] Season edit-game sheet inside full insets`, m2 && m2.sheet.left >= l - 0.5 && m2.sheet.right <= m2.vw - r + 0.5, JSON.stringify(m2) + ' opened=' + opened);
      if (m2) {
        const mv2 = await insetViolations(page, { l, r }, '[data-test-modal]');
        check(`[${v.name}] Season edit-game sheet: no control in the inset strips`, !mv2.length, mv2.join('; '));
        await clickBackdrop(page); await page.waitForTimeout(200);
      }
      check(`[${v.name}] Season edit-game sheet closes on backdrop tap`, !(await modalGeom(page)));

      // ── Team picker (admin) + manage sheet ──
      await page.locator('button:has-text("TEAM")').first().click(); await page.waitForTimeout(400); await scrollTop(page);
      const tv = await insetViolations(page, zone);
      check(`[${v.name}] team picker: no interactive element in ${v.corner ? 'left strip / corner' : 'inset strips'}`, !tv.length, tv.join('; '));
      if (v.corner) { const tt = await textUnderCorner(page, r, CORNER_H); check(`[${v.name}] team picker: no text under the corner cover`, !tt.length, tt.join('; ')); }
      if (v.icons) {
        const ih = await rectHits(page, v.icons); check(`[${v.name}] team picker: nothing under the status icons`, !ih.length, ih.join('; '));
        // the icon cluster was measured roughly: require >= 8px separation for the close button and every other control
        const sep = await page.evaluate(([x1, y1, x2, y2]) => [...document.querySelectorAll('#root button, #root input, #root select')].map(el => {
          const b = el.getBoundingClientRect(); return { l: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 16),
            gap: Math.max(x1 - b.right, b.left - x2, y1 - b.bottom, b.top - y2), close: el.getAttribute('aria-label') === 'Close' }; }), v.icons);
        const close = sep.find(e => e.close), tight = sep.filter(e => e.gap < 8);
        check(`[${v.name}] team picker: close (x) and every control >= 8px clear of the status icons`, close && close.gap >= 8 && !tight.length, JSON.stringify({ close, tight }));
        const col = await page.evaluate(() => { const b = document.querySelector('#root > div').getBoundingClientRect(); return { l: b.left, r: b.right, vw: document.documentElement.clientWidth }; });
        check(`[${v.name}] team picker is a centered <=430px column`, col.r - col.l <= 430.5 && Math.abs((col.l + col.r) / 2 - col.vw / 2) < 1, JSON.stringify(col));
      }
      check(`[${v.name}] team picker: no horizontal scroll`, (await hScroll(page)) <= 0);
      const mb = page.locator('button[aria-label^="Manage "]').first();
      if (await mb.count()) {
        await mb.click(); await page.waitForTimeout(300);
        const m3 = await modalGeom(page);
        check(`[${v.name}] team manage sheet inside full insets`, m3 && m3.sheet.left >= l - 0.5 && m3.sheet.right <= m3.vw - r + 0.5, JSON.stringify(m3));
        const mv3 = await insetViolations(page, { l, r }, '[data-test-modal]');
        check(`[${v.name}] team manage sheet: no control in the inset strips`, !mv3.length, mv3.join('; '));
      } else check(`[${v.name}] team manage button present for admin`, false);

      check(`[${v.name}] no page errors`, !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── Corner mode with banners (offline + update) on Duo folded, standalone and browser ──
    for (const sa of [true, false]) {
      const v = { w: 457, h: 678, r: 84, b: 34, sa };
      const { ctx, page, errs } = await openApp(browser, port, v);
      await page.waitForTimeout(1000); // let the initial save effect settle to "synced" first
      await page.evaluate(() => { window.__goOffline(); window.__pendingAppUpdateVersion = 'v9.99'; window.__applyPendingAppUpdate = () => { window.__applied = 1; };
        window.dispatchEvent(new CustomEvent('pt-update-available', { detail: { version: 'v9.99' } })); });
      await page.waitForTimeout(400);
      const banners = await page.locator('.offline-banner').count();
      check(`[duo folded ${sa ? 'standalone' : 'browser'} + banners] offline and update banners both shown`, banners === 2, 'count=' + banners);
      const states = await sweep(page, { l: 0, r: 84, cornerR: sa ? 84 : 0, cornerH: CORNER_H }, { withLive: true });
      const bad = states.flatMap(s => s.v.map(x => s.state + ': ' + x));
      check(`[duo folded ${sa ? 'standalone' : 'browser'} + banners] no interactive element in the ${sa ? 'corner' : 'right inset strip'} on any screen`, !bad.length, bad.slice(0, 6).join('\n      '));
      if (sa) {
        const txt = states.flatMap(s => s.t.map(x => s.state + ': ' + x));
        check(`[duo folded standalone + banners] no banner/header text under the corner cover`, !txt.length, txt.slice(0, 6).join('\n      '));
      } else {
        check(`[duo folded browser + banners] corner mode off in a browser tab (--corner-r 0, body pads full 84px)`,
          parseFloat(await cssVar(page, '--corner-r')) === 0 && (await px(page, 'body', 'paddingRight')) === 84);
      }
      // the update banner is still tappable (its left part) and calls the apply hook
      await page.locator('.offline-banner', { hasText: 'Update available' }).click({ position: { x: 30, y: 10 } });
      check(`[duo folded ${sa ? 'standalone' : 'browser'} + banners] update banner tap still works`, await page.evaluate(() => window.__applied === 1));
      check(`[duo folded ${sa ? 'standalone' : 'browser'} + banners] no page errors`, !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── Corner mode: scrolled content passes UNDER the sticky header and corner cover (stacking) ──
    {
      const { ctx, page } = await openApp(browser, port, { w: 457, h: 678, r: 84, b: 34, sa: true });
      await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200);
      const z = await page.evaluate(() => {
        window.scrollTo(0, 120);
        const vw = document.documentElement.clientWidth;
        const atCover = document.elementFromPoint(vw - 10, 140);           // in the cover band, under the header
        const header = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'sticky' && /TEAM/.test(d.textContent) && d.querySelector('img'));
        const hb = header.getBoundingClientRect();
        return { headerTop: hb.top, headerBottom: hb.bottom, coverZ: +getComputedStyle(document.body, '::after').zIndex,
                 headerZ: +getComputedStyle(header).zIndex, atCover: atCover && atCover.tagName };
      });
      check('[corner, scrolled] sticky header stays pinned at --top-gap (32px standalone)', Math.abs(z.headerTop - 32) < 1, JSON.stringify(z));
      check('[corner, scrolled] corner cover stacks above the sticky header and screen content', z.coverZ > z.headerZ && z.coverZ >= 1000, JSON.stringify(z));
      // modal backdrops (z 50/60) sit below the cover: the sheet itself must therefore never enter the corner
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('button[aria-label="View availability key and rest requirements"]').click(); await page.waitForTimeout(250);
      await modalGeom(page);
      const sheet = await page.evaluate(() => { const s = document.querySelector('[data-test-modal]').firstElementChild.getBoundingClientRect(); return { right: s.right, top: s.top, vw: document.documentElement.clientWidth }; });
      check('[corner + modal] sheet right edge clear of the corner cover even though the cover is on top', sheet.right <= sheet.vw - 84 + 0.5, JSON.stringify(sheet));
      await ctx.close();
    }

    // ── AuthGate screens in corner mode (not padded by --corner-r; must still be clear) ──
    for (const [label, init] of [['password', 'window.__signedOut = true;'], ['name', 'window.__noName = true; localStorage.removeItem("pt_coach_name");']]) {
      const { ctx, page, errs } = await openApp(browser, port, { w: 457, h: 678, r: 84, b: 34, sa: true, init }, 'form');
      const v = await insetViolations(page, { l: 0, r: 84, cornerR: 84, cornerH: CORNER_H });
      const t = await textUnderCorner(page, 84, CORNER_H);
      check(`[corner] AuthGate ${label} screen: nothing under the corner cover`, !v.length && !t.length, v.concat(t).join('; '));
      check(`[corner] AuthGate ${label} screen: no horizontal scroll`, (await hScroll(page)) <= 0);
      check(`[corner] AuthGate ${label} screen: no page errors`, !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── Intent 1: --top-gap per mode (display-mode + env(top) simulated, see header) ──
    {
      const cases = [
        // [name, w, h, t, sa, expected top-gap]
        ['standalone unfolded portrait 669x951 t=82', 669, 951, 82, true, 32],
        ['standalone exactly 600 wide t=82', 600, 900, 82, true, 32],
        ['standalone 599 wide t=82', 599, 900, 82, true, 114],
        ['standalone folded 457x678 t=0', 457, 678, 0, true, 32],
        ['standalone phone 390x844 t=47', 390, 844, 47, true, 79],
        ['standalone landscape 951x669 t=0', 951, 669, 0, true, 32],
        ['browser tab 669x951 t=82', 669, 951, 82, false, 82],
        ['browser tab 390x844 t=47', 390, 844, 47, false, 47],
      ];
      for (const [name, w, h, t, sa, exp] of cases) {
        const { ctx, page } = await openApp(browser, port, { w, h, t, sa });
        const tg = await page.evaluate(() => { const d = document.createElement('div'); d.style.height = 'var(--top-gap)'; document.body.appendChild(d); const v = d.getBoundingClientRect().height; d.remove(); return v; });
        const bodyPad = await px(page, 'body', 'paddingTop');
        const strip = await page.evaluate(() => parseFloat(getComputedStyle(document.body, '::before').height));
        const header = await page.evaluate(() => { const h = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'sticky' && d.querySelector('img')); return h.getBoundingClientRect().top; });
        check(`[top-gap ${name}] --top-gap = ${exp}px, body padding/::before strip/header top all match`,
          tg === exp && bodyPad === exp && strip === exp && Math.abs(header - exp) < 1, JSON.stringify({ tg, bodyPad, strip, header }));
        await ctx.close();
      }
    }

    // ── DisplayInfoSection: admin ──
    {
      const { ctx, page, errs, external } = await openApp(browser, port, { w: 457, h: 678, r: 84 });
      // Count only the DisplayInfo re-measure timers (delays 100/350/800, callback = DisplayInfo's
      // `measure`); v3.16's App-level useLayout arms its own 100/350/800 timers (callback `update`),
      // tracked separately in __lt. Patched before DisplayInfo mounts.
      await page.evaluate(() => {
        const st = window.setTimeout, ct = window.clearTimeout; window.__dt = new Map(); window.__lt = new Map();
        window.setTimeout = function(fn, ms, ...a) {
          const m = (ms === 100 || ms === 350 || ms === 800) && fn && (fn.name === 'measure' ? window.__dt : fn.name === 'update' ? window.__lt : null);
          if (m) { let id; id = st.call(window, (...x) => { m.delete(id); fn(...x); }, ms, ...a); m.set(id, ms); return id; }
          return st.call(window, fn, ms, ...a); };
        window.clearTimeout = function(id) { window.__dt.delete(id); window.__lt.delete(id); return ct.call(window, id); };
      });
      await tabBtn(page, 'Settings').click(); await page.locator('button', { hasText: /^Account$/ }).click(); await page.waitForTimeout(300);
      const before = await page.evaluate(() => ({ fb: window.__fbCalls.length, ls: window.__lsWrites.length }));
      const extBefore = external.length;
      check('admin: DISPLAY card visible', await page.locator('text=DISPLAY').count() > 0);
      const rowVal = async label => page.evaluate(lbl => {
        const s = [...document.querySelectorAll('span')].find(x => x.textContent === lbl); return s ? s.nextElementSibling.textContent : null; }, label);
      check('admin: viewport row = 457 × 678', (await rowVal('Viewport (CSS px)')) === '457 × 678', await rowVal('Viewport (CSS px)'));
      check('admin: orientation portrait', (await rowVal('Orientation')) === 'portrait');
      check('admin: mode Browser (not standalone)', (await rowVal('Mode')) === 'Browser');
      check('admin: pixel ratio shown', (await rowVal('Pixel ratio')) === '1');
      check('admin: screen row shown', /^\d+ × \d+$/.test(await rowVal('Screen (CSS px)') || ''));
      check('admin: safe-area row has 4 numbers', /^\d+ \/ \d+ \/ \d+ \/ \d+$/.test(await rowVal('Safe area T / R / B / L') || ''));
      const refresh = page.locator('button[aria-label="Refresh display info"]');
      check('admin: Refresh button present', await refresh.count() === 1);
      const rb = await refresh.boundingBox();
      check('admin: Refresh button clear of the corner (folded Duo)', rb && (rb.x + rb.width <= 457 - 84 + 0.5 || rb.y >= CORNER_H), JSON.stringify(rb));
      await page.setViewportSize({ width: 678, height: 457 }); await page.waitForTimeout(300);
      check('admin: re-measures on resize (678 × 457, landscape)',
        (await rowVal('Viewport (CSS px)')) === '678 × 457' && (await rowVal('Orientation')) === 'landscape', await rowVal('Viewport (CSS px)'));
      // v3.17: Settings switches to its two-pane layout when useLayout().twoPane flips, which remounts
      // the section (and DisplayInfo with it). The fake widths below (1111+) would flip 678x457 (rail,
      // one column) to two-pane mid-test, so start from a size that is already rail + two-pane.
      await page.setViewportSize({ width: 1000, height: 457 }); await page.waitForTimeout(1000);
      // Delayed re-measure: dispatch a resize, then change what measure() reads AFTER the
      // synchronous measure - only the 100/350/800ms timers can pick that up (iOS updates env() late).
      const delayed = await page.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        const realH = window.innerHeight; let fakeW = window.innerWidth;
        const own = Object.getOwnPropertyDescriptor(window, 'innerWidth');
        Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => fakeW });
        window.dispatchEvent(new Event('orientationchange'));
        const pending0 = [...window.__dt.values()].sort((a, b) => a - b);
        const layout0 = [...window.__lt.values()].sort((a, b) => a - b);
        fakeW = 1111; await sleep(40);
        const rd = () => [...document.querySelectorAll('span')].find(x => x.textContent === 'Viewport (CSS px)').nextElementSibling.textContent;
        const at40 = rd(); await sleep(120); const at160 = rd();
        fakeW = 2222; await sleep(300); const at460 = rd();
        fakeW = 3333; await sleep(500); const at960 = rd(); const pendingEnd = window.__dt.size;
        // burst: 10 rapid resizes leave at most 3 pending timers (old ones cleared)
        for (let i = 0; i < 10; i++) window.dispatchEvent(new Event('resize'));
        const burst = window.__dt.size, layoutBurst = window.__lt.size;
        // Refresh button: immediate re-measure
        fakeW = 4444; [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Refresh display info').click();
        await sleep(30); const afterRefresh = rd();
        if (own) Object.defineProperty(window, 'innerWidth', own); else delete window.innerWidth;
        return { pending0, layout0, at40, at160, at460, at960, pendingEnd, burst, layoutBurst, afterRefresh, realH };
      });
      check('admin: orientationchange arms re-measure timers at 100/350/800ms', JSON.stringify(delayed.pending0) === '[100,350,800]', JSON.stringify(delayed));
      check('admin: delayed re-measures pick up late changes (100ms, 350ms, 800ms)',
        !/^1111/.test(delayed.at40) && /^1111 /.test(delayed.at160) && /^2222 /.test(delayed.at460) && /^3333 /.test(delayed.at960) && delayed.pendingEnd === 0, JSON.stringify(delayed));
      check('admin: a burst of resize events leaves only 3 pending timers (earlier ones cleared)', delayed.burst === 3, 'pending=' + delayed.burst);
      check('useLayout: orientationchange arms its own 100/350/800ms re-measures; a burst leaves only 3', JSON.stringify(delayed.layout0) === '[100,350,800]' && delayed.layoutBurst === 3, JSON.stringify(delayed));
      check('admin: Refresh button re-measures immediately', /^4444 /.test(delayed.afterRefresh), delayed.afterRefresh);
      const after = await page.evaluate(() => ({ fb: window.__fbCalls.slice(), ls: window.__lsWrites.slice() }));
      check('admin: viewing/resizing/refreshing DisplayInfo writes nothing to Firebase or localStorage',
        after.fb.length === before.fb && after.ls.length === before.ls, JSON.stringify(after));
      check('admin: no external network requests from DisplayInfo', external.length === extBefore, external.slice(extBefore).join(', '));
      // Unmount with timers pending: they must be cleared, no setState-after-unmount
      const warns = []; page.on('console', m => { if (/unmounted|memory leak|Can't perform/i.test(m.text())) warns.push(m.text()); });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      const pendingBeforeUnmount = await page.evaluate(() => window.__dt.size);
      await tabBtn(page, 'Roster').click(); await page.waitForTimeout(50);
      const pendingAfterUnmount = await page.evaluate(() => window.__dt.size);
      check('admin: unmount with re-measures pending clears all 3 timers', pendingBeforeUnmount === 3 && pendingAfterUnmount === 0, `${pendingBeforeUnmount} -> ${pendingAfterUnmount}`);
      for (const [w, h] of [[457, 678], [890, 800], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(100); }
      await page.waitForTimeout(900);
      check('admin: no timers armed and no errors/warnings after leaving Account and resizing',
        (await page.evaluate(() => window.__dt.size)) === 0 && !errs.length && !warns.length, errs.concat(warns).join(' | '));
      await tabBtn(page, 'Settings').click(); await page.locator('button', { hasText: /^Account$/ }).click(); await page.waitForTimeout(200);
      check('admin: fresh measurement on re-entering Account', (await rowVal('Viewport (CSS px)')) === '390 × 844', await rowVal('Viewport (CSS px)'));
      const bal = await page.evaluate(async () => {
        const tick0 = () => new Promise(res => setTimeout(res, 150));
        [...document.querySelectorAll('button')].filter(b => /^ROSTER$/i.test(b.textContent.trim())).pop().click(); await tick0();
        let n = 0; const a = window.addEventListener, r = window.removeEventListener;
        window.addEventListener = function(t, ...x){ if (t==='resize'||t==='orientationchange') n++; return a.call(this, t, ...x); };
        window.removeEventListener = function(t, ...x){ if (t==='resize'||t==='orientationchange') n--; return r.call(this, t, ...x); };
        const click = re => [...document.querySelectorAll('button')].filter(b => re.test(b.textContent.trim())).pop().click();
        const tick = () => new Promise(res => setTimeout(res, 120));
        for (let i = 0; i < 5; i++) { click(/^ROSTER$/i); await tick(); click(/^SETTINGS$/i); await tick(); click(/^Account$/); await tick(); window.dispatchEvent(new Event('resize')); }
        click(/^ROSTER$/i); await tick();
        window.addEventListener = a; window.removeEventListener = r; return { n, pending: window.__dt.size };
      });
      check('admin: listeners balanced and no timers left after 5 mount/resize/unmount cycles', bal.n === 0 && bal.pending === 0, JSON.stringify(bal));
      await ctx.close();
    }

    // ── DisplayInfoSection: coach ──
    {
      const { ctx, page, errs } = await openApp(browser, port, { w: 457, h: 678, r: 84, role: 'coach' });
      await tabBtn(page, 'Settings').click(); await page.locator('button', { hasText: /^Account$/ }).click(); await page.waitForTimeout(300);
      check('coach: Account shows role "Coach"', await page.locator('text=/^Coach$/').count() > 0);
      check('coach: DISPLAY card absent', await page.locator('text=/^DISPLAY$/').count() === 0);
      check('coach: no Refresh display button', await page.locator('button[aria-label="Refresh display info"]').count() === 0);
      check('coach: no "Safe area" row in DOM', !(await page.evaluate(() => document.getElementById('root').innerText)).includes('Safe area'));
      await page.locator('button:has-text("TEAM")').first().click(); await page.waitForTimeout(300);
      check('coach: no team manage button (pre-existing gate still holds)', await page.locator('button[aria-label^="Manage "]').count() === 0);
      const tv = await insetViolations(page, { l: 0, r: 84, cornerR: 84, cornerH: CORNER_H });
      check('coach: team picker clear of the corner', !tv.length, tv.join('; '));
      check('coach: no page errors', !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── v3.16: rail / two-pane boundaries (insets simulated, see header) ──
    {
      const isGrid = page => page.evaluate(() => !![...document.querySelectorAll('div')].find(d => getComputedStyle(d).display === 'grid'));
      const cases = [
        // [name, view, expRail, expTwoPane]
        ['phone 390x844', { w: 390, h: 844 }, false, false],
        ['phone landscape 844x390 l=r=47', { w: 844, h: 390, l: 47, r: 47 }, true, true],
        ['599x900 portrait', { w: 599, h: 900 }, false, false],
        ['600x900 portrait (wide, no two-pane)', { w: 600, h: 900 }, false, false],
        ['648x900 portrait (content 616)', { w: 648, h: 900 }, false, true],
        ['647x900 portrait (content 615)', { w: 647, h: 900 }, false, false],
        ['720x500 rail (content 616)', { w: 720, h: 500 }, true, true],
        ['719x500 rail (content 615)', { w: 719, h: 500 }, true, false],
        ['760x500 r=40 rail (content 616)', { w: 760, h: 500, r: 40 }, true, true],
        ['759x500 r=40 rail (content 615)', { w: 759, h: 500, r: 40 }, true, false],
      ];
      for (const [name, v, er, et] of cases) {
        const { ctx, page, errs } = await openApp(browser, port, v);
        await tabBtn(page, 'Live').click(); await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300);
        const rail = await page.locator('nav[aria-label="Tabs"]').count(), two = await isGrid(page);
        check(`[bounds ${name}] rail=${er} twoPane=${et}`, (rail === 1) === er && two === et && (await hScroll(page)) <= 0 && !errs.length, JSON.stringify({ rail, two, errs }));
        await ctx.close();
      }
    }

    // ── v3.16: Live two-pane structure + actions (unfolded Duo, standalone simulated) ──
    for (const v of [{ n: 'unfolded portrait', w: 669, h: 951, t: 82, b: 34, sa: true }, { n: 'unfolded landscape', w: 951, h: 669, r: 84, b: 34, sa: true }]) {
      const { ctx, page, errs } = await openApp(browser, port, v);
      const tag = `[two-pane ${v.n}]`;
      await tabBtn(page, 'Live').click(); await page.waitForTimeout(250);
      const setupCol = await page.evaluate(() => { const c = [...document.querySelectorAll('p')].find(p => p.textContent === 'NEW GAME').closest('div[style*="110px"]').getBoundingClientRect(); return { l: c.left, r: c.right }; });
      const frame = await page.evaluate(() => { const b = document.querySelector('#root > div').getBoundingClientRect(); const pl = parseFloat(getComputedStyle(document.querySelector('#root > div')).paddingLeft); return { l: b.left + pl, r: b.right }; });
      check(`${tag} setup state is a centered <=430 column`, setupCol.r - setupCol.l <= 430.5 && Math.abs((setupCol.l + setupCol.r) / 2 - (frame.l + frame.r) / 2) < 1, JSON.stringify({ setupCol, frame }));
      await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300);
      const panes = await page.evaluate(() => {
        const g = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).display === 'grid'); if (!g) return null;
        const [a, b] = g.children; const R = e => e.getBoundingClientRect();
        const has = (e, re) => re.test(e.textContent);
        const avail = [...b.querySelectorAll('button[aria-label^="Bring in "]')];
        const card = avail[0] && avail[0].parentElement.getBoundingClientRect();
        return { n: g.children.length, aL: R(a).left, aR: R(a).right, bL: R(b).left, bR: R(b).right,
          left: { game: has(a, /IN THE GAME/), log: has(a, /Log Complete Game/), discard: has(a, /Discard game/), avail: has(a, /AVAILABLE TO PITCH/), opp: !!a.querySelector('input[aria-label="Opponent"]') },
          right: { avail: has(b, /AVAILABLE TO PITCH/), unavail: has(b, /NOT AVAILABLE/), opp: !!b.querySelector('input[aria-label="Opponent"]'), game: has(b, /IN THE GAME/), log: has(b, /Log Complete/) },
          rows: avail.map(x => ({ w: x.getBoundingClientRect().width, t: x.textContent })), cardW: card && card.width };
      });
      check(`${tag} grid: 2 panes, left >=360 and right >=220 wide, no overlap`, panes && panes.n === 2 && panes.aR - panes.aL >= 359.5 && panes.bR - panes.bL >= 219.5 && panes.aR <= panes.bL, JSON.stringify(panes));
      check(`${tag} left = in-game cards + Log/Discard; right = available + not available + game details`,
        panes && panes.left.game && panes.left.log && panes.left.discard && !panes.left.avail && !panes.left.opp &&
        panes.right.avail && panes.right.unavail && panes.right.opp && !panes.right.game && !panes.right.log, JSON.stringify(panes && { l: panes.left, r: panes.right }));
      check(`${tag} available pitchers are full-width rows ending "N left"`, panes && panes.rows.length > 0 && panes.rows.every(x => Math.abs(x.w - panes.cardW) < 1 && /\d+ left$/.test(x.t)), JSON.stringify(panes && panes.rows));
      // actions
      await page.locator('button[aria-label="Add 1 pitch for Holden"]').click(); await page.waitForTimeout(250);
      check(`${tag} +1 updates the active pitcher's count`, (await page.locator('input[aria-label="Holden pitch count"]').inputValue()) === '18');
      const inName = await page.locator('button[aria-label^="Bring in "]').first().getAttribute('aria-label');
      const newName = inName.match(/^Bring in (.+?),/)[1];
      await page.locator('button[aria-label^="Bring in "]').first().click(); await page.waitForTimeout(300);
      const after = await page.evaluate(() => Object.fromEntries(Object.entries(window.__liveCur.pitchers).map(([k, p]) => [k, p.status])));
      check(`${tag} bring in ${newName}: new pitcher active, Holden marked left, Undo shown`,
        Object.values(after).filter(x => x === 'active').length === 1 && after.t_1 === 'left' && (await page.locator('button', { hasText: /^Undo$/ }).count()) === 1 &&
        (await page.locator(`input[aria-label="${newName} pitch count"]`).count()) === 1, JSON.stringify(after));
      await page.locator('button', { hasText: /^Undo$/ }).click(); await page.waitForTimeout(300);
      const undone = await page.evaluate(() => window.__liveCur.pitchers.t_1.status + ':' + Object.keys(window.__liveCur.pitchers).length);
      check(`${tag} Undo puts Holden back and removes ${newName}`, undone === 'active:2', undone);
      await page.evaluate(() => { window.__claimWins = true; window.__sets.length = 0; });
      await page.locator('button', { hasText: 'Log Complete Game' }).click(); await page.waitForTimeout(1500); // save effect is debounced
      const logged = await page.evaluate(() => {
        const roster = (window.__sets.filter(([k]) => k === 'roster').pop() || [])[1];
        const list = roster ? (Array.isArray(roster) ? roster : Object.values(roster)) : [];
        const day = window.__demoLive.date; // no pre-existing history on the live game's date
        const e = list.flatMap(p => (p.history || []).filter(h => h.opponent === 'Rockies' && h.date === day).map(h => ({ id: p.id, n: h.pitches, sg: h.sharedGameId })));
        return { e, shown: /Game Logged!/.test(document.body.innerText) };
      });
      const sg = new Set(logged.e.map(x => x.sg));
      check(`${tag} Log Complete Game logs both pitchers (22 + 18) under one sharedGameId and shows "Game Logged!"`,
        logged.shown && logged.e.length === 2 && sg.size === 1 && logged.e.some(x => x.id === 't_0' && x.n === 22) && logged.e.some(x => x.id === 't_1' && x.n === 18), JSON.stringify(logged));
      const savedCol = await page.evaluate(() => { const el = [...document.querySelectorAll('div')].filter(d => /Game Logged!/.test(d.textContent) && d.style.padding === '0px 16px 110px').pop(); if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right }; });
      check(`${tag} "Game Logged!" state is a centered <=430 column`, savedCol && savedCol.r - savedCol.l <= 430.5 && Math.abs((savedCol.l + savedCol.r) / 2 - (frame.l + frame.r) / 2) < 1, JSON.stringify({ savedCol, frame }));
      check(`${tag} no page errors / horizontal scroll`, !errs.length && (await hScroll(page)) <= 0, errs.join(' | '));
      await ctx.close();
    }

    // ── v3.16: one column on phones keeps the pre-v3.16 order ──
    {
      const { ctx, page } = await openApp(browser, port, { w: 390, h: 844 });
      await tabBtn(page, 'Live').click(); await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300);
      const ys = await page.evaluate(() => {
        const y = e => e ? e.getBoundingClientRect().top + scrollY : null;
        const p = t => [...document.querySelectorAll('p')].find(x => x.textContent === t);
        return [y(document.querySelector('input[aria-label="Opponent"]')), y(p('IN THE GAME')), y(p('AVAILABLE TO PITCH')), y(p('NOT AVAILABLE')),
          y([...document.querySelectorAll('button')].find(b => /Log Complete Game/.test(b.textContent))), y([...document.querySelectorAll('button')].find(b => /Discard game/.test(b.textContent)))];
      });
      check('[phone 390x844] Live single column order: details, in the game, available, not available, log, discard', ys.every(Boolean) && ys.every((v, i) => !i || v > ys[i - 1]), JSON.stringify(ys));
      const rows = await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Bring in "]')].map(b => b.textContent));
      check('[phone 390x844] available pitchers stay chips (no "left" suffix)', rows.length > 0 && rows.every(t => !/left$/.test(t)), JSON.stringify(rows));
      await ctx.close();
    }

    // ── v3.16: --hdr-r (display-mode simulated) + the unfolded Duo clock/battery ──
    {
      const cases = [
        ['standalone unfolded portrait 669x951', { w: 669, h: 951, t: 82, sa: true }, 128],
        ['browser tab unfolded portrait 669x951', { w: 669, h: 951, t: 82 }, 0],
        ['standalone unfolded landscape 951x669', { w: 951, h: 669, r: 84, sa: true }, 0],
        ['standalone 599x900 portrait', { w: 599, h: 900, sa: true }, 0],
        ['standalone folded portrait 457x678', { w: 457, h: 678, r: 84, sa: true }, 0],
      ];
      for (const [name, v, exp] of cases) {
        const { ctx, page } = await openApp(browser, port, v);
        const got = await page.evaluate(() => { const d = document.createElement('div'); d.style.width = 'var(--hdr-r)'; document.body.appendChild(d); const w = d.getBoundingClientRect().width; d.remove(); return w; });
        const hdr = await page.evaluate(() => { const h = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'sticky' && d.querySelector('img'));
          return { pr: parseFloat(getComputedStyle(h).paddingRight), pl: parseFloat(getComputedStyle(h).paddingLeft) }; });
        const cr = parseFloat(await cssVar(page, '--corner-r')) || 0;
        const banners = await page.evaluate(() => [...document.querySelectorAll('.offline-banner')].map(b => parseFloat(getComputedStyle(b).paddingRight)));
        check(`[hdr-r ${name}] --hdr-r = ${exp}px; header right padding = 14 + corner-r + hdr-r, left stays 14`, got === exp && hdr.pr === 14 + cr + exp && hdr.pl === 14, JSON.stringify({ got, hdr, cr }));
        await ctx.close();
      }
      // unfolded portrait + offline/update banners: nothing (controls or text) under the measured clock/battery
      const v = { w: 669, h: 951, t: 82, b: 34, sa: true };
      const { ctx, page, errs } = await openApp(browser, port, v);
      await page.waitForTimeout(800);
      await page.evaluate(() => { window.__goOffline(); window.__pendingAppUpdateVersion = 'v9.99'; window.__applyPendingAppUpdate = () => {}; window.dispatchEvent(new CustomEvent('pt-update-available', { detail: { version: 'v9.99' } })); });
      await page.waitForTimeout(300);
      const icons = [549, 26, 642, 67];
      const states = await sweep(page, { l: 0, r: 0, cornerR: 0, cornerH: CORNER_H, icons }, { withLive: true });
      const ih = states.flatMap(s => s.icons.map(x => s.state + ': ' + x));
      check('[unfolded portrait + banners] no control or text under the clock/battery on any tab (incl. Live two-pane states)', !ih.length, ih.slice(0, 6).join('\n      '));
      const bannerUnder = await page.evaluate(([x1, y1, x2, y2]) => [...document.querySelectorAll('.offline-banner')].filter(b => { const r = b.getBoundingClientRect(); return r.right > x1 && r.left < x2 && r.bottom > y1 && r.top < y2; }).map(b => (b.onclick || getComputedStyle(b).cursor === 'pointer' ? 'tappable ' : '') + b.textContent.trim().slice(0, 20)), icons);
      console.log('INFO  [unfolded portrait + banners] banner boxes (background/tap area, not text) reaching under the clock: ' + JSON.stringify(bannerUnder));
      check('[unfolded portrait + banners] no page errors', !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── v3.16: rail tabs, live dot, modal above the rail ──
    {
      const { ctx, page, errs } = await openApp(browser, port, { w: 678, h: 457, r: 84, b: 34, sa: true });
      const rail = page.locator('nav[aria-label="Tabs"]');
      const pressed = [];
      for (const t of ['Live', 'Log Game', 'Season', 'Settings', 'Roster']) {
        await rail.locator('button', { hasText: new RegExp('^' + t + '$', 'i') }).click(); await page.waitForTimeout(150);
        pressed.push(await rail.locator('button[aria-pressed="true"]').textContent());
      }
      check('[rail] each rail button switches tab and is the only aria-pressed one', pressed.map(x => x.trim()).join() === 'LIVE,LOG GAME,SEASON,SETTINGS,ROSTER', JSON.stringify(pressed));
      check('[rail] no live dot without a game', await rail.locator('.live-dot').count() === 0);
      await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(200);
      check('[rail] live dot on the rail Live button while a game is live', await rail.locator('button', { hasText: /^LIVE$/ }).locator('.live-dot').count() === 1);
      await page.locator('button[aria-label="View availability key and rest requirements"]').click(); await page.waitForTimeout(250);
      const top = await page.evaluate(() => { const e = document.elementFromPoint(36, 200); return e && e.closest('nav') ? 'NAV' : (e && getComputedStyle(e).position); });
      check('[rail] modal backdrop stacks above the rail', top === 'fixed', String(top));
      await clickBackdrop(page); await page.waitForTimeout(150);
      const scrollFit = await page.evaluate(() => { const n = document.querySelector('nav'); return n.scrollHeight <= n.clientHeight; });
      check('[rail] all 5 rail tabs fit without scrolling at 457px tall', scrollFit);
      await ctx.close();
      const p2 = await openApp(browser, port, { w: 844, h: 390, l: 47, r: 47, sa: true });
      const fit2 = await p2.page.evaluate(() => { const n = document.querySelector('nav'); return n && n.scrollHeight <= n.clientHeight && [...n.querySelectorAll('button')].every(b => b.getBoundingClientRect().bottom <= innerHeight); });
      check('[rail] 844x390 standalone: rail present and all 5 tabs visible', fit2 === true, String(fit2));
      await p2.ctx.close();
      check('[rail] no page errors', !errs.length, errs.join(' | '));
    }

    // ── v3.16 stability: resize/rotate cycles with a live game; useLayout listeners on App unmount ──
    {
      const init = `window.__rl = 0; (function(){ const a = window.addEventListener, r = window.removeEventListener;
        window.addEventListener = function(t, ...x){ if (t==='resize'||t==='orientationchange') window.__rl++; return a.call(this, t, ...x); };
        window.removeEventListener = function(t, ...x){ if (t==='resize'||t==='orientationchange') window.__rl--; return r.call(this, t, ...x); }; })();`;
      const { ctx, page, errs } = await openApp(browser, port, { w: 669, h: 951, sa: true, init });
      const base = await page.evaluate(() => window.__rl);
      await tabBtn(page, 'Live').click(); await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300);
      const seq = [[951, 669, true, true], [457, 678, false, false], [678, 457, true, false], [669, 951, false, true], [390, 844, false, false], [844, 390, true, true]];
      const bad = [];
      for (let i = 0; i < 2; i++) for (const [w, h, er, et] of seq) {
        await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150);
        const st = await page.evaluate(() => ({ rail: !!document.querySelector('nav[aria-label="Tabs"]'), two: !![...document.querySelectorAll('div')].find(d => getComputedStyle(d).display === 'grid'),
          holden: (document.querySelector('input[aria-label="Holden pitch count"]') || {}).value, sw: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
        if (st.rail !== er || st.two !== et || st.holden !== '17' || st.sw > 0) bad.push(`${w}x${h}: ${JSON.stringify(st)}`);
      }
      check('[stability] 12 rotate/fold cycles with a live game: right frame each time, live state kept, no h-scroll', !bad.length, bad.join('; '));
      await page.waitForTimeout(900);
      const mid = await page.evaluate(() => window.__rl);
      await page.evaluate(() => window.__authCb(null)); await page.waitForTimeout(300);
      const end = await page.evaluate(() => window.__rl);
      check('[stability] useLayout adds its 2 listeners once and removes them when App unmounts (sign-out)', mid - end === 2 && (await page.locator('form').count()) > 0, JSON.stringify({ base, mid, end }));
      check('[stability] no page errors / React warnings', !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── v3.16: typed count draft survives a frame change (fold/unfold/rotate while typing) ──
    {
      const { ctx, page } = await openApp(browser, port, { w: 669, h: 951, sa: true });
      await tabBtn(page, 'Live').click(); await page.evaluate(() => window.__setLive(window.__demoLive)); await page.waitForTimeout(300);
      const inp = page.locator('input[aria-label="Holden pitch count"]');
      await inp.click(); await page.keyboard.type('30');
      await page.setViewportSize({ width: 951, height: 669 }); await page.waitForTimeout(1000); // two-pane stays on, rail appears
      await page.setViewportSize({ width: 457, height: 678 }); await page.waitForTimeout(1000); // two-pane -> one column
      await page.locator('button[aria-label="Add 1 pitch for Holden"]').click(); await page.waitForTimeout(300);
      const shown = await inp.inputValue(), real = await page.evaluate(() => window.__liveCur.pitchers.t_1.pitches);
      check('[draft] after typing then folding (two-pane -> one column), the count input shows the real count after +1', String(real) === shown, JSON.stringify({ shown, real }));
      await ctx.close();
      // simulated on-screen keyboard: viewport height shrinks below the width in unfolded portrait
      const k = await openApp(browser, port, { w: 669, h: 951, sa: true });
      await tabBtn(k.page, 'Live').click(); await k.page.evaluate(() => window.__setLive(window.__demoLive)); await k.page.waitForTimeout(300);
      await k.page.locator('input[aria-label="Holden pitch count"]').click();
      await k.page.setViewportSize({ width: 669, height: 560 }); await k.page.waitForTimeout(1000);
      const kb = await k.page.evaluate(() => ({ rail: !!document.querySelector('nav[aria-label="Tabs"]'), two: !![...document.querySelectorAll('div')].find(d => getComputedStyle(d).display === 'grid'), focus: document.activeElement && document.activeElement.getAttribute('aria-label') }));
      console.log('INFO  [keyboard sim 669x951 -> 669x560] ' + JSON.stringify(kb) + ' (layout flips to rail/one column and the focused input is lost IF iOS shrinks innerHeight for the keyboard - not verifiable headless)');
      await k.ctx.close();
    }

    // ── v3.17: two-pane Roster / Season / Log Game / Settings + modal dialogs ──
    // Insets + standalone simulated as described in the header. icons = the unfolded Duo's
    // measured clock/battery region (x 549-642, y 26-67).
    {
      const geom = page => page.evaluate(() => {
        const R = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
        const hdr = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).position === 'sticky' && d.querySelector('img'));
        const grid = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).display === 'grid' && d.children.length === 2 && d.getBoundingClientRect().width > 500);
        const nav = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).position === 'fixed' && /ROSTER/.test(d.textContent) && /SETTINGS/.test(d.textContent));
        const pane = grid && grid.children[1];
        const frame = document.querySelector('#root > div'); const fpl = parseFloat(getComputedStyle(frame).paddingLeft);
        const fb = frame.getBoundingClientRect();
        return { vw: document.documentElement.clientWidth, vh: innerHeight, hdr: R(hdr), grid: R(grid), left: grid && R(grid.children[0]), right: R(pane),
          paneSticky: pane ? getComputedStyle(pane).position : null, paneScroll: pane ? { sh: pane.scrollHeight, ch: pane.clientHeight, oy: getComputedStyle(pane).overflowY } : null,
          navTop: nav ? nav.firstElementChild.getBoundingClientRect().top : innerHeight, frame: { l: fb.left + fpl, r: fb.right },
          sw: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      const dialogGeom = page => page.evaluate(`(function(){ const bd = (${findBackdrop})(); if (!bd) return null; const s = bd.firstElementChild; const b = s.getBoundingClientRect(); const cs = getComputedStyle(s);
        const close = [...s.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Close' || /^✕$/.test(x.textContent.trim()));
        const cb = close && close.getBoundingClientRect();
        return { vw: document.documentElement.clientWidth, vh: innerHeight, l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height, radius: cs.borderBottomLeftRadius,
          oy: cs.overflowY, sh: s.scrollHeight, ch: s.clientHeight, close: cb && { l: cb.left, r: cb.right, t: cb.top, b: cb.bottom } }; })()`);
      const views = [
        { n: 'unfolded portrait 669x951', w: 669, h: 951, t: 82, b: 34, sa: true, two: true, icons: [549, 26, 642, 67] },
        { n: 'unfolded landscape 951x669 r=84', w: 951, h: 669, r: 84, b: 34, sa: true, two: true },
        { n: 'folded landscape 678x457 r=84', w: 678, h: 457, r: 84, b: 34, sa: true, two: false, wide: true },
        { n: 'folded landscape 678x457 l=84', w: 678, h: 457, l: 84, b: 34, sa: true, two: false, wide: true },
        { n: 'folded portrait 457x678 r=84 (corner)', w: 457, h: 678, r: 84, b: 34, sa: true, two: false, corner: true },
        { n: 'phone 390x844', w: 390, h: 844, two: false },
      ];
      for (const v of views) {
        const { ctx, page, errs } = await openApp(browser, port, v);
        const tag = `[v3.17 ${v.n}]`; const l = v.l || 0, r = v.r || 0;
        const rail = v.w >= 600 && v.w > v.h;
        // pane checks shared by every two-pane screen
        const paneOk = async (label) => {
          await scrollTop(page); await page.waitForTimeout(150);
          const g0 = await geom(page);
          const ok0 = g0.grid && g0.right && g0.paneSticky === 'sticky' && g0.right.t >= g0.hdr.b - 0.5 && g0.right.b <= g0.navTop + 0.5 &&
            g0.left.r <= g0.right.l + 0.5 && g0.grid.l >= l - 0.5 && g0.grid.r <= g0.vw - r + 0.5 && g0.sw <= 0;
          check(`${tag} ${label}: two panes side by side; right pane sticky, below the header, above the bottom bar, inside insets; no h-scroll`, ok0, JSON.stringify(g0));
          // page scroll: the right pane stays pinned below the header
          await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(150);
          const g1 = await geom(page);
          const scrolled = await page.evaluate(() => scrollY);
          check(`${tag} ${label}: after scrolling the page (${scrolled}px) the right pane is still fully below the sticky header and within the viewport`,
            g1.right && g1.right.t >= g1.hdr.b - 0.5 && g1.right.b <= g1.navTop + 0.5, JSON.stringify({ hdr: g1.hdr, right: g1.right, navTop: g1.navTop }));
          if (v.icons) { const ih = await rectHits(page, v.icons); check(`${tag} ${label}: nothing under the clock/battery after scrolling`, !ih.length, ih.join('; ')); }
          await scrollTop(page);
          return g0;
        };
        const noGrid = async label => { const g = await geom(page);
          check(`${tag} ${label}: one column (no two-pane grid)${v.wide ? ', screen-centred <=430' : ''}; no h-scroll`, !g.grid && g.sw <= 0, JSON.stringify(g)); };

        // ── Roster ──
        await tabBtn(page, 'Roster').click(); await page.waitForTimeout(250);
        if (v.two) {
          check(`${tag} Roster: placeholder "Tap a pitcher" shown, no Back button`, (await page.locator('text=Tap a pitcher').count()) === 1 && (await page.locator('button[aria-label="Back to roster"]').count()) === 0);
          await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Johnny' }).first().click(); await page.waitForTimeout(250);
          const sel = await page.evaluate(() => [...document.querySelectorAll('[aria-current="true"]')].map(e => e.textContent.slice(0, 30)));
          check(`${tag} Roster: tapping Johnny shows his detail on the right (no Back), row highlighted, list still visible`,
            (await page.locator('h2', { hasText: /JOHNNY/ }).count()) === 1 && (await page.locator('button[aria-label="Back to roster"]').count()) === 0 &&
            sel.length === 1 && /Johnny/.test(sel[0]) && (await page.locator('text=Tap a pitcher').count()) === 0 && (await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Carter' }).count()) > 0, JSON.stringify(sel));
          await paneOk('Roster');
          await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Carter' }).first().click(); await page.waitForTimeout(250);
          const sel2 = await page.evaluate(() => [...document.querySelectorAll('[aria-current="true"]')].map(e => e.textContent.slice(0, 30)));
          check(`${tag} Roster: tapping Carter switches the detail and the highlight`, (await page.locator('h2', { hasText: /CARTER/ }).count()) === 1 && sel2.length === 1 && /Carter/.test(sel2[0]), JSON.stringify(sel2));
          // edit player from the embedded detail -> list + detail both update
          await page.locator('button[aria-label="Edit player details"]').click(); await page.waitForTimeout(150);
          await page.locator('input[aria-label="Name"]').fill('Carter Q'); await page.locator('button', { hasText: 'Save Changes' }).click(); await page.waitForTimeout(250);
          check(`${tag} Roster: editing the name in the embedded detail updates the detail heading and the list row`,
            (await page.locator('h2', { hasText: /CARTER Q/ }).count()) === 1 && (await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Carter Q' }).count()) > 0);
          // edit a game from the detail -> centered dialog, save changes pitches
          await page.locator('h2', { hasText: /CARTER Q/ }).waitFor();
          await page.evaluate(() => { const b = [...document.querySelectorAll('button')].filter(x => /Edit$/.test(x.textContent.trim()) && !x.getAttribute('aria-label')).pop(); b && b.click(); });
          await page.waitForTimeout(250);
          const dg = await dialogGeom(page);
          check(`${tag} Roster: Edit game opens a centered dialog (<=520 wide, all corners rounded, inside insets, vertically centered)`,
            dg && dg.w <= 520.5 && dg.radius === '20px' && dg.l >= l - 0.5 && dg.r <= dg.vw - r + 0.5 && Math.abs((dg.t + dg.b) / 2 - dg.vh / 2) < 2, JSON.stringify(dg));
          await page.locator('[data-test-modal] button[aria-label="Increase pitch count"]').click();
          await page.locator('[data-test-modal] button', { hasText: /Save/ }).first().click(); await page.waitForTimeout(250);
          check(`${tag} Roster: saving the edited game closes the dialog and the detail shows the new count (18 -> 19)`,
            !(await page.evaluate(`(${findBackdrop})()`)) && (await page.evaluate(() => /\b19p\b|\b19\b/.test(document.querySelector('#root').innerText))), '');
        } else {
          await noGrid('Roster');
          await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Johnny' }).first().click(); await page.waitForTimeout(250);
          check(`${tag} Roster: tapping a pitcher drills in (Back button, list hidden)`, (await page.locator('button[aria-label="Back to roster"]').count()) === 1 &&
            (await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Carter' }).count()) === 0);
          await page.locator('button[aria-label="Back to roster"]').click(); await page.waitForTimeout(200);
        }
        // rules modal: dialog when wide, sheet otherwise
        await tabBtn(page, 'Roster').click(); await page.waitForTimeout(150); await scrollTop(page);
        await page.locator('button[aria-label="View availability key and rest requirements"]').click(); await page.waitForTimeout(250);
        const rg = await dialogGeom(page);
        const wideV = v.w >= 600;
        check(`${tag} rules ${wideV ? 'dialog centered, <=520, rounded' : 'bottom sheet flush with the bottom, <=430, top corners only'}; inside insets; scrollable`,
          rg && rg.l >= l - 0.5 && rg.r <= rg.vw - r + 0.5 && rg.oy === 'auto' && rg.h <= rg.vh + 0.5 &&
          (wideV ? rg.w <= 520.5 && rg.radius === '20px' && Math.abs((rg.t + rg.b) / 2 - rg.vh / 2) < 2 : rg.w <= 430.5 && rg.radius === '0px' && Math.abs(rg.b - rg.vh) < 1), JSON.stringify(rg));
        if (v.icons) { const ih = await rectHits(page, v.icons); check(`${tag} rules dialog: nothing under the clock/battery`, !ih.length, ih.join('; ')); }
        if (v.corner) { const cv = await insetViolations(page, { l, r, cornerR: r, cornerH: CORNER_H }, '[data-test-modal]'); check(`${tag} rules sheet: no control under the corner`, !cv.length, cv.join('; ')); }
        await clickBackdrop(page); await page.waitForTimeout(150);
        check(`${tag} rules modal closes on backdrop tap`, !(await page.evaluate(`(${findBackdrop})()`)));

        // ── Season ──
        await tabBtn(page, 'Season').click(); await page.waitForTimeout(250);
        if (v.two) {
          const g = await paneOk('Season');
          const sides = await page.evaluate(() => { const grid = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).display === 'grid' && d.children.length === 2 && d.getBoundingClientRect().width > 500);
            const [a, b] = grid.children; return { leftEdit: [...a.querySelectorAll('button')].some(x => /Edit$/.test(x.textContent.trim())), rightFilter: /FILTER BY PITCHER/.test(b.textContent), rightLeader: /LEADERBOARD|Leaderboard/i.test(b.textContent), rightTotal: /Total/.test(b.textContent), leftFilter: /FILTER BY PITCHER/.test(a.textContent) }; });
          check(`${tag} Season: games (with Edit) left; filter + totals + leaderboard right`, sides.leftEdit && sides.rightFilter && sides.rightLeader && sides.rightTotal && !sides.leftFilter, JSON.stringify(sides));
        } else await noGrid('Season');
        const countTxt = () => page.evaluate(() => [...document.querySelectorAll('h2')].find(h => h.textContent === 'SEASON').nextElementSibling.textContent);
        const before = await countTxt();
        await page.locator('button[aria-pressed]', { hasText: /^#23 Carter/ }).first().click(); await page.waitForTimeout(200);
        const after = await countTxt();
        check(`${tag} Season: filtering by a pitcher narrows the list (${before} -> ${after})`, before !== after && /^1 game/.test(after), JSON.stringify({ before, after }));
        await page.locator('button', { hasText: /^All Pitchers$/ }).click(); await page.waitForTimeout(150);
        await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Edit$/.test(x.textContent.trim())); b && b.click(); }); await page.waitForTimeout(250);
        const sg = await dialogGeom(page);
        check(`${tag} Season: Edit opens EditGameGroupModal as a ${wideV ? 'centered dialog' : 'bottom sheet'} inside insets`,
          sg && sg.l >= l - 0.5 && sg.r <= sg.vw - r + 0.5 && (wideV ? sg.w <= 520.5 && Math.abs((sg.t + sg.b) / 2 - sg.vh / 2) < 2 : Math.abs(sg.b - sg.vh) < 1), JSON.stringify(sg));
        if (v.icons) { const ih = await rectHits(page, v.icons); check(`${tag} Season edit dialog: nothing under the clock/battery`, !ih.length, ih.join('; ')); }
        await clickBackdrop(page); await page.waitForTimeout(150);

        // ── Log Game ──
        await tabBtn(page, 'Log Game').click(); await page.waitForTimeout(250);
        if (v.two) {
          check(`${tag} Log Game: right pane says "Pick who pitched on the left." before any pick`, (await page.locator('text=Pick who pitched on the left.').count()) === 1);
        }
        await page.locator('input[aria-label="Opponent"]').fill('Cubs');
        for (const n of ['Mason', 'Eli']) await page.locator(`button[aria-pressed="false"][aria-label="${n}"]`).click();
        await page.waitForTimeout(200);
        if (v.two) {
          await paneOk('Log Game');
          const side = await page.evaluate(() => { const grid = [...document.querySelectorAll('#root div')].find(d => getComputedStyle(d).display === 'grid' && d.children.length === 2 && d.getBoundingClientRect().width > 500);
            const [a, b] = grid.children; return { leftChips: /WHO PITCHED/.test(a.textContent), leftDetails: !!a.querySelector('input[aria-label="Opponent"]'), rightCounts: !!b.querySelector('input[aria-label="Mason pitch count"]') && !!b.querySelector('input[aria-label="Eli pitch count"]'), leftCounts: !!a.querySelector('input[aria-label$="pitch count"]') }; });
          check(`${tag} Log Game: details + WHO PITCHED left, count rows right`, side.leftChips && side.leftDetails && side.rightCounts && !side.leftCounts, JSON.stringify(side));
        } else await noGrid('Log Game');
        await page.locator('input[aria-label="Mason pitch count"]').fill('12');
        await page.locator('input[aria-label="Eli pitch count"]').fill('9');
        await page.locator('button[aria-label="Add 1 pitch for Eli"]').click();
        check(`${tag} Log Game: typing + bump work (Eli 9 -> 10)`, (await page.locator('input[aria-label="Eli pitch count"]').inputValue()) === '10');
        await page.locator('button[aria-label="Remove Eli from this game"]').click(); await page.waitForTimeout(150);
        check(`${tag} Log Game: ✕ removes Eli (chip back on the picker)`, (await page.locator('input[aria-label="Eli pitch count"]').count()) === 0 && (await page.locator('button[aria-pressed="false"][aria-label="Eli"]').count()) === 1);
        await page.evaluate(() => { window.__sets.length = 0; });
        await page.locator('button', { hasText: /Save Game/ }).click(); await page.waitForTimeout(250);
        check(`${tag} Log Game: Mason (resting) triggers the warn-and-override card`, (await page.locator('text=/would violate a limit/').count()) === 1);
        if (v.two) { const g = await geom(page); check(`${tag} Log Game: warn card stays inside the right pane / viewport`, g.right && g.right.b <= g.navTop + 0.5 && g.right.t >= g.hdr.b - 0.5, JSON.stringify(g)); }
        await page.locator('button', { hasText: /^Save Anyway$/ }).click(); await page.waitForTimeout(1500);
        const savedBox = await page.evaluate(() => { const el = [...document.querySelectorAll('#root div')].filter(d => /Game Saved!/.test(d.textContent) && d.style.padding === '0px 16px 110px').pop(); if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, r: b.right }; });
        const fr = (await geom(page)).frame;
        const logged = await page.evaluate(() => { const roster = (window.__sets.filter(([k]) => k === 'roster').pop() || [])[1]; const list = roster ? (Array.isArray(roster) ? roster : Object.values(roster)) : [];
          return list.flatMap(p => (p.history || []).filter(h => h.opponent === 'Cubs').map(h => p.name + ':' + h.pitches)); });
        check(`${tag} Log Game: Save Anyway logs Mason 12 vs Cubs and shows "Game Saved!" as a centered <=430 column`,
          JSON.stringify(logged) === '["Mason:12"]' && savedBox && savedBox.r - savedBox.l <= 430.5 && (v.two ? Math.abs((savedBox.l + savedBox.r) / 2 - (fr.l + fr.r) / 2) < 1 : true), JSON.stringify({ logged, savedBox, fr }));
        await page.locator('button', { hasText: /Log Another Game/ }).click(); await page.waitForTimeout(200);
        check(`${tag} Log Game: Log Another resets the form`, (await page.locator('input[aria-label$="pitch count"]').count()) === 0 && (await page.locator('text=Game Saved!').count()) === 0);
        if (v.two) { const g = await geom(page); check(`${tag} Log Game: back to two panes after Log Another`, !!g.grid, JSON.stringify(g)); }

        // ── Settings ──
        await tabBtn(page, 'Settings').click(); await page.waitForTimeout(200);
        const sNav = page.locator('nav[aria-label="Settings sections"]');
        check(`${tag} Settings: ${v.two ? 'section list (nav) beside the content' : 'sub-tab row, no section nav'}`, (await sNav.count()) === (v.two ? 1 : 0));
        if (v.two) {
          const order = [];
          for (const s of ['Tournaments', 'Account', 'Roster']) {
            await sNav.locator('button', { hasText: new RegExp('^' + s + '$') }).click(); await page.waitForTimeout(150);
            order.push((await sNav.locator('button[aria-pressed="true"]').textContent()).trim());
          }
          const acct = await page.evaluate(() => /Log out|Log Out/i.test(document.querySelector('#root').innerText));
          check(`${tag} Settings: nav buttons switch the section (one pressed at a time)`, order.join() === 'Tournaments,Account,Roster', JSON.stringify(order));
          const sg2 = await page.evaluate(() => { const n = document.querySelector('nav[aria-label="Settings sections"]').getBoundingClientRect(); const c = document.querySelector('nav[aria-label="Settings sections"]').nextElementSibling.getBoundingClientRect(); return { nR: n.right, cL: c.left, cR: c.right, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
          check(`${tag} Settings: nav left of the content, content inside the right inset, no h-scroll`, sg2.nR <= sg2.cL + 0.5 && sg2.cR <= sg2.vw - r + 0.5 && sg2.sw <= 0, JSON.stringify(sg2));
        }
        if (v.icons) {
          // nothing under the clock at scroll 0 on any of the new screens (Roster with detail open, Season, Log Game picked, Settings sections)
          const hits = [];
          for (const t of ['Roster', 'Season', 'Log Game', 'Settings']) { await tabBtn(page, t).click(); await page.waitForTimeout(200); await scrollTop(page); hits.push(...(await rectHits(page, v.icons)).map(x => t + ': ' + x)); }
          check(`${tag} nothing under the clock/battery on the v3.17 screens at scroll 0`, !hits.length, hits.join('; '));
        }
        check(`${tag} no page errors`, !errs.length, errs.join(' | '));
        await ctx.close();
      }

      // phone: one-column order unchanged (Season: filter, totals, leaderboard, games; Log Game: details, chips, counts, save)
      {
        const { ctx, page } = await openApp(browser, port, { w: 390, h: 844 });
        await tabBtn(page, 'Season').click(); await page.waitForTimeout(250);
        const ys = await page.evaluate(() => { const y = e => e ? e.getBoundingClientRect().top + scrollY : null; const p = re => [...document.querySelectorAll('p, div')].find(x => x.children.length === 0 && re.test(x.textContent));
          return [y(p(/^FILTER BY PITCHER$/)), y(p(/^Total$/)), y([...document.querySelectorAll('p')].find(x => /LEADERBOARD/i.test(x.textContent))), y([...document.querySelectorAll('button')].find(b => /^Edit$/.test(b.textContent.trim())))]; });
        check('[v3.17 phone 390x844] Season one-column order: filter, totals, leaderboard, games', ys.every(x => x !== null) && ys.every((v, i) => !i || v > ys[i - 1]), JSON.stringify(ys));
        await tabBtn(page, 'Log Game').click(); await page.waitForTimeout(250);
        await page.locator('button[aria-pressed="false"][aria-label="Eli"]').click(); await page.locator('input[aria-label="Eli pitch count"]').fill('5');
        const ys2 = await page.evaluate(() => { const y = e => e ? e.getBoundingClientRect().top + scrollY : null;
          return [y(document.querySelector('input[aria-label="Opponent"]')), y([...document.querySelectorAll('p')].find(p => p.textContent === 'WHO PITCHED?')), y(document.querySelector('button[aria-label="Carter"]')),
            y(document.querySelector('input[aria-label="Eli pitch count"]')), y([...document.querySelectorAll('button')].find(b => /Save Game/.test(b.textContent)))]; });
        check('[v3.17 phone 390x844] Log Game one-column order: details, WHO PITCHED, chips, counts (same card), save', ys2.every(x => x !== null) && ys2.every((v, i) => !i || v > ys2[i - 1]), JSON.stringify(ys2));
        check('[v3.17 phone 390x844] Log Game: no "PITCH COUNTS" pane title on phones', (await page.locator('text=PITCH COUNTS').count()) === 0);
        await ctx.close();
      }

      // detail follows roster updates that arrive from Firebase (another device) while embedded
      {
        const { ctx, page } = await openApp(browser, port, { w: 951, h: 669, r: 84, sa: true });
        await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200);
        await page.locator('#root div[style*="cursor: pointer"]', { hasText: 'Luke' }).first().click(); await page.waitForTimeout(200);
        await page.evaluate(() => { const r = JSON.parse(JSON.stringify(window.__stubRoster)); const p = r.find(x => x.name === 'Luke'); p.name = 'Luke Remote';
          window.__pushData({ roster: r, tournaments: [] }); });
        await page.waitForTimeout(400);
        const st = await page.evaluate(() => ({ list: [...document.querySelectorAll('#root div[style*="cursor: pointer"]')].some(d => /Luke Remote/.test(d.textContent)),
          detail: ([...document.querySelectorAll('h2')].find(h => /LUKE/.test(h.textContent)) || {}).textContent }));
        check('[v3.17 remote update] a rename from another device shows in BOTH the list and the embedded detail', st.list && /LUKE REMOTE/.test(st.detail || ''), JSON.stringify(st));
        await page.evaluate(() => { const r = JSON.parse(JSON.stringify(window.__stubRoster)).filter(x => x.name !== 'Luke'); window.__pushData({ roster: r, tournaments: [] }); });
        await page.waitForTimeout(400);
        const st2 = await page.evaluate(() => ({ list: [...document.querySelectorAll('#root div[style*="cursor: pointer"]')].some(d => /Luke/.test(d.textContent)),
          detail: !![...document.querySelectorAll('h2')].find(h => /LUKE/.test(h.textContent)), placeholder: /Tap a pitcher/.test(document.body.innerText) }));
        check('[v3.17 remote update] a pitcher deleted on another device disappears from the embedded detail too (placeholder back)', !st2.list && !st2.detail && st2.placeholder, JSON.stringify(st2));
        await ctx.close();
      }
    }

    // ── Landscape is not blocked; tab label ──
    {
      const { ctx, page } = await openApp(browser, port, { w: 844, h: 390 });
      const covered = await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, 120); return e && e.closest('#root') ? false : (e ? e.id || e.tagName : 'none'); });
      check('landscape 844x390: app content not covered by an overlay', covered === false, String(covered));
      check('tab label "Log Game" rendered, "Game Log" absent', await tabBtn(page, 'Log Game').count() === 1 && await page.locator('button', { hasText: /^Game Log$/i }).count() === 0);
      await tabBtn(page, 'Log Game').click(); await page.waitForTimeout(200);
      check('Log Game screen heading "LOG GAME"', await page.locator('h2', { hasText: /^LOG GAME$/ }).count() === 1);
      await ctx.close();
    }
  } catch (e) {
    failed++; console.log('FAIL  harness error: ' + (e && e.stack || e));
  } finally {
    await browser.close(); server.close();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();

// Topmost full-screen position:fixed backdrop (tagged data-test-modal for subtree queries).
function findBackdrop() {
  document.querySelectorAll('[data-test-modal]').forEach(d => d.removeAttribute('data-test-modal'));
  const bd = [...document.querySelectorAll('div')].filter(d => { const cs = getComputedStyle(d); return cs.position === 'fixed' && cs.top === '0px' && cs.bottom === '0px' && cs.visibility !== 'hidden'; }).pop();
  if (bd) bd.setAttribute('data-test-modal', '');
  return bd;
}
function clickBackdrop(page) {
  return page.evaluate(`(${findBackdrop})(); (function(){ const bd = document.querySelector('[data-test-modal]'); if (bd) bd.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
}
function modalGeom(page) {
  return page.evaluate(`(function(){ const bd = (${findBackdrop})(); if (!bd) return null;
    const s = bd.firstElementChild.getBoundingClientRect(), b = bd.getBoundingClientRect();
    return { vw: document.documentElement.clientWidth, backdrop: { left: b.left, right: b.right }, sheet: { left: s.left, right: s.right } }; })()`);
}
