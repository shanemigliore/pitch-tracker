#!/usr/bin/env node
/**
 * Browser verification for v3.14 (iPhone Duo side insets, landscape, Log Game
 * rename, admin-only DisplayInfoSection). Uses Playwright + headless Chromium;
 * prints SKIP and exits 0 if playwright isn't installed.
 *
 * Firebase is stubbed (no network): a signed-in admin (or coach, via ?role)
 * with a sample roster. Headless Chromium can't fake env(safe-area-inset-*), so
 * insets are simulated by overriding --safe-l/--safe-r on :root - this tests
 * that every element honours the vars, not that iOS reports them.
 * Run with: node tests/duo-layout-v314.browser.verify.test.js
 */
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); }
catch { console.log('SKIP  duo-layout-v314 browser tests: playwright not installed'); process.exit(0); }
const http = require('http'); const fs = require('fs'); const path = require('path');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json', '.png':'image/png' };

function stub(role) {
  return `(function(){
  const today = new Date(); const d = n => { const x = new Date(today); x.setDate(x.getDate()-n); return x.toISOString().slice(0,10); };
  const names = [["Johnny","00",16,9],["Holden","20",10,9],["Carter","23",18,1],["Mason","7",44,1],["Eli","12",8,4],["Luke","3",25,6]];
  const roster = names.map(([name,jersey,p,ago],i)=>({ id:"t_"+i, name, jersey, lastPitches:p, lastGameDate:d(ago),
    history:[{ gameId:"g"+i, date:d(ago), pitches:p, opponent:"Rockies", isTournament:false, tournamentId:null, tournamentName:null, tourneyDay:null, sharedGameId:"sg"+ago }] }));
  const meta = { id:"demo10u", name:"Prime 10U", rules:{ maxPitches:55, rest1:20, rest2:40, rest3:60 }, seasonId:"2026_fall" };
  const role = ${JSON.stringify(role)};
  const user = { email: role==="admin" ? "admin@prime-pitchtracker.app" : "coach@prime-pitchtracker.app", isAnonymous:false };
  const R = v => Promise.resolve(v);
  window.__fbCalls = [];
  const rec = (n, v) => (...a) => { window.__fbCalls.push(n); return R(v); };
  Object.assign(window, {
    __fbRoleForUser: u => u ? role : null,
    __fbOnAuthChange: cb => { setTimeout(()=>cb(user),0); return ()=>{}; },
    __fbSignOut: rec("signOut"), __fbSignIn: rec("signIn"),
    __fbMigrateIfNeeded: ()=>R(), __fbCreatePrime12U: ()=>R(), __fbCreatePrime10U: ()=>R(), __fbMigrateSeasonIfNeeded: ()=>R(),
    __fbListSeasons: ()=>R([{ id:"2026_fall", term:"Fall", year:2026, createdAt:1 }]),
    __fbCreateSeason: rec("createSeason","2026_fall"), __fbGetRoster: ()=>R([]),
    __fbListTeams: ()=>R([meta]),
    __fbCreateTeam: rec("createTeam"), __fbUpdateTeamMeta: rec("updateTeamMeta"), __fbDeleteTeam: rec("deleteTeam"),
    __fbSubscribe: (onData, onConn) => { setTimeout(()=>{ onData({ roster, tournaments:[] }); onConn(); },0); return ()=>{}; },
    __fbSet: rec("set"),
    __fbWatchLiveGame: (tid, cb) => { setTimeout(()=>cb(null),0); return ()=>{}; },
    __fbStartLiveGame: rec("startLive",true), __fbMutateLiveGame: rec("mutateLive"), __fbClaimLiveGame: rec("claimLive",null),
  });
  localStorage.setItem("pt_selected_team_id","demo10u");
  localStorage.setItem("pt_selected_team_meta", JSON.stringify(meta));
  localStorage.setItem("pt_coach_name","Tester");
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

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});

async function openApp(browser, port, { w, h, l = 0, r = 0, role = 'admin' }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource|babel/i.test(m.text())) errs.push('console: ' + m.text()); });
  const external = [];
  page.on('request', q => { const u = q.url(); if (!u.startsWith(`http://localhost:${port}`)) external.push(u); });
  await page.route('**/firebasejs/**', x => x.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route('**/lib/firebase-init.js', x => x.fulfill({ contentType: 'text/javascript', body: stub(role) }));
  await page.route('**/fonts.googleapis.com/**', x => x.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto(`http://localhost:${port}/`);
  await page.addStyleTag({ content: `:root{ --safe-l:${l}px !important; --safe-r:${r}px !important; }` });
  await page.waitForSelector('button:has-text("TEAM")', { timeout: 30000 });
  await page.waitForTimeout(500);
  return { ctx, page, errs, external };
}

// Every visible interactive element must sit inside [l, vw-r].
async function insetViolations(page, l, r) {
  return page.evaluate(([l, r]) => {
    const vw = document.documentElement.clientWidth, out = [];
    for (const el of document.querySelectorAll('button, input, select, textarea, a, [role=button]')) {
      const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      // Skip elements clipped away by a horizontally scrolling ancestor (chip rows etc.)
      // (an overflow ancestor above a position:fixed box doesn't clip it, so stop there)
      let clip = null; for (let p = el; p; p = p.parentElement) {
        if (getComputedStyle(p).position === 'fixed') break;
        if (p === el) continue;
        const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') { clip = p.getBoundingClientRect(); break; } }
      const left = clip ? Math.max(b.left, clip.left) : b.left, right = clip ? Math.min(b.right, clip.right) : b.right;
      if (right <= left) continue;
      if (left < l - 0.5 || right > vw - r + 0.5) out.push(`${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20)}" [${Math.round(left)},${Math.round(right)}] vw=${vw}`);
    }
    return out;
  }, [l, r]);
}
const hScroll = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const tabBtn = (page, label) => page.locator('button', { hasText: new RegExp('^' + label + '$', 'i') }).last();

(async () => {
  await new Promise(res => server.listen(0, res));
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    const views = [
      { name: 'phone 390x844 no insets', w: 390, h: 844 },
      { name: 'duo closed portrait 450x667 r=52', w: 450, h: 667, r: 52 },
      { name: 'duo closed landscape 667x450 r=52', w: 667, h: 450, r: 52 },
      { name: 'landscape notch-left 667x450 l=47', w: 667, h: 450, l: 47 },
      { name: 'asymmetric 450x667 l=10 r=60', w: 450, h: 667, l: 10, r: 60 },
      { name: 'duo open 890x800 r=40', w: 890, h: 800, r: 40 },
      { name: 'duo open landscape 1000x700 l=30 r=30', w: 1000, h: 700, l: 30, r: 30 },
    ];
    for (const v of views) {
      const { ctx, page, errs } = await openApp(browser, port, v);
      const { l = 0, r = 0, w } = v;
      const bad = [], scroll = [];
      for (const label of ['Roster', 'Live', 'Log Game', 'Season', 'Settings']) {
        await tabBtn(page, label).click();
        await page.waitForTimeout(250);
        if (label === 'Settings') { const a = page.locator('button', { hasText: /^Account$/ }); if (await a.count()) { await a.click(); await page.waitForTimeout(200); } }
        (await insetViolations(page, l, r)).forEach(x => bad.push(label + ': ' + x));
        const s = await hScroll(page); if (s > 0) scroll.push(`${label}: +${s}px`);
      }
      check(`[${v.name}] no interactive element in side inset strips (all 5 tabs)`, !bad.length, bad.slice(0, 6).join('\n      '));
      check(`[${v.name}] no horizontal page scroll`, !scroll.length, scroll.join(', '));

      const nav = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].filter(b => /^ROSTER$/i.test(b.textContent.trim())).pop();
        let n = btn; while (n && getComputedStyle(n).position !== 'fixed') n = n.parentElement;
        const b = n.getBoundingClientRect(); return { left: b.left, right: b.right, bottom: b.bottom, vw: document.documentElement.clientWidth, vh: innerHeight };
      });
      const availL = l, availR = nav.vw - r, center = (availL + availR) / 2;
      check(`[${v.name}] bottom nav within insets, centered, <=430 wide, at bottom`,
        nav.left >= availL - 0.5 && nav.right <= availR + 0.5 && Math.abs((nav.left + nav.right) / 2 - center) < 1 &&
        nav.right - nav.left <= 430.5 && Math.abs(nav.bottom - nav.vh) < 1, JSON.stringify(nav));

      // App column centered within the padded body too (nav lines up with content)
      const col = await page.evaluate(() => { const b = document.querySelector('#root > div').getBoundingClientRect(); return { left: b.left, right: b.right }; });
      check(`[${v.name}] app column aligned with bottom nav`, Math.abs(col.left - nav.left) < 1 && Math.abs(col.right - nav.right) < 1, JSON.stringify({ col, nav }));

      // Modal 1: Roster rules sheet
      await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200);
      await page.locator('button[aria-label="View availability key and rest requirements"]').click();
      await page.waitForTimeout(250);
      const m1 = await modalGeom(page);
      check(`[${v.name}] rules sheet: backdrop full-screen, sheet + buttons inside insets`,
        m1 && m1.backdrop.left === 0 && Math.abs(m1.backdrop.right - m1.vw) < 1 && m1.sheet.left >= l - 0.5 && m1.sheet.right <= m1.vw - r + 0.5 &&
        Math.abs((m1.sheet.left + m1.sheet.right) / 2 - (l + m1.vw - r) / 2) < 1, JSON.stringify(m1));
      const mv = await insetViolations(page, l, r);
      check(`[${v.name}] rules sheet: no interactive element in inset strips`, !mv.length, mv.join('; '));
      await clickBackdrop(page); await page.waitForTimeout(200); // backdrop click closes
      check(`[${v.name}] rules sheet closes on backdrop tap`, !(await modalGeom(page)));

      // Modal 2: Season tab edit-game sheet
      await tabBtn(page, 'Season').click(); await page.waitForTimeout(250);
      const opened = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /^Edit$/.test(x.textContent.trim())); if (b) { b.click(); return true; } return false; });
      await page.waitForTimeout(250);
      const m2 = opened && await modalGeom(page);
      check(`[${v.name}] Season edit-game sheet inside insets`, m2 && m2.sheet.left >= l - 0.5 && m2.sheet.right <= m2.vw - r + 0.5, JSON.stringify(m2) + ' opened=' + opened);
      if (m2) { await clickBackdrop(page); await page.waitForTimeout(200); }
      check(`[${v.name}] Season edit-game sheet closes on backdrop tap`, !(await modalGeom(page)));

      // Modal 3: team manage sheet (admin)
      await page.locator('button:has-text("TEAM")').first().click(); await page.waitForTimeout(400);
      const tv = await insetViolations(page, l, r);
      check(`[${v.name}] team picker: no interactive element in inset strips`, !tv.length, tv.join('; '));
      const mb = page.locator('button[aria-label^="Manage "]').first();
      if (await mb.count()) {
        await mb.click(); await page.waitForTimeout(300);
        const m3 = await modalGeom(page);
        check(`[${v.name}] team manage sheet inside insets`, m3 && m3.sheet.left >= l - 0.5 && m3.sheet.right <= m3.vw - r + 0.5, JSON.stringify(m3));
      } else check(`[${v.name}] team manage button present for admin`, false);

      check(`[${v.name}] no page errors`, !errs.length, errs.join(' | '));
      await ctx.close();
    }

    // ── DisplayInfoSection: admin ──
    {
      const { ctx, page, errs, external } = await openApp(browser, port, { w: 450, h: 667, r: 52 });
      await tabBtn(page, 'Settings').click(); await page.locator('button', { hasText: /^Account$/ }).click(); await page.waitForTimeout(300);
      const before = await page.evaluate(() => ({ fb: window.__fbCalls.length, ls: window.__lsWrites.length }));
      const extBefore = external.length;
      check('admin: DISPLAY card visible', await page.locator('text=DISPLAY').count() > 0);
      const rowVal = async label => page.evaluate(lbl => {
        const s = [...document.querySelectorAll('span')].find(x => x.textContent === lbl); return s ? s.nextElementSibling.textContent : null; }, label);
      check('admin: viewport row = 450 × 667', (await rowVal('Viewport (CSS px)')) === '450 × 667', await rowVal('Viewport (CSS px)'));
      check('admin: orientation portrait', (await rowVal('Orientation')) === 'portrait');
      check('admin: mode Browser (not standalone)', (await rowVal('Mode')) === 'Browser');
      check('admin: pixel ratio shown', (await rowVal('Pixel ratio')) === '1');
      check('admin: screen row shown', /^\d+ × \d+$/.test(await rowVal('Screen (CSS px)') || ''));
      check('admin: safe-area row has 4 numbers', /^\d+ \/ \d+ \/ \d+ \/ \d+$/.test(await rowVal('Safe area T / R / B / L') || ''));
      await page.setViewportSize({ width: 667, height: 450 }); await page.waitForTimeout(300);
      check('admin: re-measures on resize (667 × 450, landscape)',
        (await rowVal('Viewport (CSS px)')) === '667 × 450' && (await rowVal('Orientation')) === 'landscape', await rowVal('Viewport (CSS px)'));
      const after = await page.evaluate(() => ({ fb: window.__fbCalls.slice(), ls: window.__lsWrites.slice() }));
      check('admin: viewing/resizing DisplayInfo writes nothing to Firebase or localStorage',
        after.fb.length === before.fb && after.ls.length === before.ls, JSON.stringify(after));
      check('admin: no external network requests from DisplayInfo', external.length === extBefore, external.slice(extBefore).join(', '));
      // Navigate away, then resize - listeners must be gone (no setState-on-unmounted errors)
      await tabBtn(page, 'Roster').click(); await page.waitForTimeout(200);
      const warns = []; page.on('console', m => { if (/unmounted|memory leak/i.test(m.text())) warns.push(m.text()); });
      for (const [w, h] of [[450, 667], [890, 800], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(100); }
      check('admin: no errors/warnings after leaving Account and resizing', !errs.length && !warns.length, errs.concat(warns).join(' | '));
      // Re-enter Account: shows current size
      await tabBtn(page, 'Settings').click(); await page.locator('button', { hasText: /^Account$/ }).click(); await page.waitForTimeout(200);
      check('admin: fresh measurement on re-entering Account', (await rowVal('Viewport (CSS px)')) === '390 × 844');
      // listener count sanity: patch add/remove and toggle Account in and out
      const bal = await page.evaluate(async () => {
        const tick0 = () => new Promise(res => setTimeout(res, 150));
        [...document.querySelectorAll('button')].filter(b => /^ROSTER$/i.test(b.textContent.trim())).pop().click(); await tick0();
        let n = 0; const a = window.addEventListener, r = window.removeEventListener;
        window.addEventListener = function(t, ...x){ if (t==='resize'||t==='orientationchange') n++; return a.call(this, t, ...x); };
        window.removeEventListener = function(t, ...x){ if (t==='resize'||t==='orientationchange') n--; return r.call(this, t, ...x); };
        const click = re => [...document.querySelectorAll('button')].filter(b => re.test(b.textContent.trim())).pop().click();
        const tick = () => new Promise(res => setTimeout(res, 120));
        for (let i = 0; i < 5; i++) { click(/^ROSTER$/i); await tick(); click(/^SETTINGS$/i); await tick(); click(/^Account$/); await tick(); }
        click(/^ROSTER$/i); await tick();
        window.addEventListener = a; window.removeEventListener = r; return n;
      });
      check('admin: resize/orientationchange listeners balanced after 5 mount/unmount cycles', bal === 0, 'net=' + bal);
      await ctx.close();
    }

    // ── DisplayInfoSection: coach ──
    {
      const { ctx, page, errs } = await openApp(browser, port, { w: 450, h: 667, r: 52, role: 'coach' });
      await tabBtn(page, 'Settings').click(); await page.locator('button', { hasText: /^Account$/ }).click(); await page.waitForTimeout(300);
      check('coach: Account shows role "Coach"', await page.locator('text=/^Coach$/').count() > 0);
      check('coach: DISPLAY card absent', await page.locator('text=/^DISPLAY$/').count() === 0);
      check('coach: no "Safe area" row in DOM', !(await page.evaluate(() => document.getElementById('root').innerText)).includes('Safe area'));
      await page.locator('button:has-text("TEAM")').first().click(); await page.waitForTimeout(300);
      check('coach: no team manage button (pre-existing gate still holds)', await page.locator('button[aria-label^="Manage "]').count() === 0);
      check('coach: no page errors', !errs.length, errs.join(' | '));
      await ctx.close();
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

// Click the backdrop itself (outside the sheet), as a tap beside the sheet would.
function clickBackdrop(page) {
  return page.evaluate(() => {
    const bd = [...document.querySelectorAll('div')].filter(d => { const cs = getComputedStyle(d); return cs.position === 'fixed' && cs.top === '0px' && cs.bottom === '0px' && cs.visibility !== 'hidden'; }).pop();
    if (bd) bd.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
// Topmost position:fixed full-screen backdrop and its first child (the sheet).
function modalGeom(page) {
  return page.evaluate(() => {
    const bd = [...document.querySelectorAll('div')].filter(d => { const cs = getComputedStyle(d); return cs.position === 'fixed' && cs.top === '0px' && cs.bottom === '0px' && cs.visibility !== 'hidden'; }).pop();
    if (!bd) return null;
    const s = bd.firstElementChild.getBoundingClientRect(), b = bd.getBoundingClientRect();
    return { vw: document.documentElement.clientWidth, backdrop: { left: b.left, right: b.right }, sheet: { left: s.left, right: s.right } };
  });
}
