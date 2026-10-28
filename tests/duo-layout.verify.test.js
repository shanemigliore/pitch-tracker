#!/usr/bin/env node
/**
 * Static (dependency-free) verification of the iPhone Duo layout rules:
 * v3.14 - side safe-area insets, landscape allowed, "Game Log" -> "Log Game"
 *         rename, admin-only DisplayInfoSection.
 * v3.15 - narrow-screen "corner mode" (--corner-r / --corner-h, body::after
 *         corner cover, top rows add var(--corner-r), full-width bottom nav,
 *         modal sheets keep the full inset), flat 32px --top-gap in a wide
 *         Home Screen app, DisplayInfoSection delayed re-measure + Refresh.
 * v3.17 - two-pane Roster/Season/Log Game/Settings (stickyPane), modal dialogs when wide.
 * v3.16 - wide frame: useLayout() (wide / rail / twoPane), left tab rail in wide
 *         landscape, centeredColumn(), Live two-pane, header-only --hdr-r.
 * Run with: node tests/duo-layout.verify.test.js
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const compDir = path.join(ROOT, 'components');
const compFiles = fs.readdirSync(compDir).filter(f => f.endsWith('.js'));
const comps = Object.fromEntries(compFiles.map(f => [f, read('components/' + f)]));
const html = read('index.html');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS  ${name}`); }
  catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
// Strip // line comments and /* */ + {/* */} JSX comments so we only look at code/UI text.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

// ── Version ─────────────────────────────────────────────────────────────
test('meta app-version and APP_VERSION match', () => {
  const meta = html.match(/<meta name="app-version" content="([^"]+)"\s*\/?>/);
  const js = html.match(/const APP_VERSION = "([^"]+)";/);
  assert(meta && js, 'both version markers present');
  assert.strictEqual(meta[1], js[1]);
});
test('version is v3.17 (minor bump from v3.16)', () => {
  assert.strictEqual(html.match(/const APP_VERSION = "([^"]+)";/)[1], 'v3.17');
  // a /* (v3.16) */ history note in the CSS is fine; no stale version *value* may remain
  assert.strictEqual((html.match(/["']v3\.16["']/g) || []).length, 0, 'no stale "v3.16" value left in index.html');
});
test('CLAUDE.md current version matches', () => {
  assert(/\*\*Current version:\*\* v3\.17/.test(read('CLAUDE.md')));
});

// ── Landscape ───────────────────────────────────────────────────────────
test('no #landscape-block overlay anywhere', () => {
  assert(!/landscape-block/.test(html), 'index.html');
  for (const [f, s] of Object.entries(comps)) assert(!/landscape-block/.test(s), f);
  assert(!/ROTATE YOUR DEVICE/i.test(html));
});
test('no CSS orientation media query hiding content (the only one sets --hdr-r)', () => {
  const cssNC = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...cssNC.matchAll(/@media\s*([^{]*orientation[^{]*)\{([^{}]*\{[^}]*\})\s*\}/g)];
  assert.strictEqual((cssNC.match(/orientation/g) || []).length, rules.length, 'every orientation use is a simple :root rule');
  for (const m of rules) assert(/^\s*:root\s*\{\s*--hdr-r:\s*\d+px;?\s*\}\s*$/.test(m[2]), m[0]);
  assert(!/display:\s*none|visibility:\s*hidden/.test(rules.map(m => m[2]).join('')));
});
test('manifest.json is valid JSON with orientation "any"', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.strictEqual(m.orientation, 'any');
  assert.strictEqual(m.display, 'standalone');
  assert(Array.isArray(m.icons) && m.icons.length);
});

// ── Safe-area CSS vars ──────────────────────────────────────────────────
test(':root defines --safe-l / --safe-r from env() with 0px fallback', () => {
  assert(/--safe-l:\s*env\(safe-area-inset-left,\s*0px\)/.test(html));
  assert(/--safe-r:\s*env\(safe-area-inset-right,\s*0px\)/.test(html));
});
test('body pads left by --safe-l and right by --safe-r minus --corner-r', () => {
  const body = html.match(/\bbody\s*\{[^}]*padding-top[^}]*\}/);
  assert(body, 'body rule with padding-top');
  assert(/padding-left:\s*var\(--safe-l\)/.test(body[0]));
  assert(/padding-right:\s*calc\(var\(--safe-r\)\s*-\s*var\(--corner-r\)\)/.test(body[0]));
  assert(/padding-top:\s*var\(--top-gap\)/.test(body[0]));
});

// ── v3.15 corner mode / top gap CSS ─────────────────────────────────────
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
test(':root defaults --corner-r to 0px and defines --corner-h', () => {
  const root = cssNoComments.match(/(^|\n)\s*:root\s*\{([^}]*)\}/);
  assert(root, 'base :root rule');
  assert(/--corner-r:\s*0px/.test(root[2]), '--corner-r: 0px by default');
  assert(/--corner-h:\s*\d+px/.test(root[2]), '--corner-h set');
  assert(/--top-gap:\s*env\(safe-area-inset-top,\s*0px\)/.test(root[2]), 'browser-tab --top-gap is just the inset');
});
test('corner mode only in a standalone app at max-width:520px and only sets --corner-r = --safe-r', () => {
  const rules = [...cssNoComments.matchAll(/@media\s*([^{]*)\{\s*:root\s*\{([^}]*)\}\s*\}/g)];
  const corner = rules.filter(m => /--corner-r/.test(m[2]));
  assert.strictEqual(corner.length, 1, 'exactly one media rule sets --corner-r');
  assert.strictEqual(corner[0][1].trim(), '(display-mode: standalone) and (max-width: 520px)');
  assert(/^\s*--corner-r:\s*var\(--safe-r\);?\s*$/.test(corner[0][2]), corner[0][2]);
  // nothing else overrides --corner-r / --corner-h / --safe-*
  const others = (cssNoComments.match(/--corner-[rh]\s*:/g) || []).length;
  assert.strictEqual(others, 3, 'only :root (r,h) and the 520px rule assign corner vars');
});
test('standalone --top-gap: inset+32 normally, flat 32px at min-width:600px', () => {
  const rules = [...cssNoComments.matchAll(/@media\s*([^{]*)\{\s*:root\s*\{([^}]*)\}\s*\}/g)];
  const tg = rules.filter(m => /--top-gap/.test(m[2])).map(m => [m[1].trim(), m[2].trim()]);
  assert.deepStrictEqual(tg, [
    ['(display-mode: standalone)', '--top-gap: calc(env(safe-area-inset-top, 0px) + 32px);'],
    ['(display-mode: standalone) and (min-width: 600px)', '--top-gap: 32px;'],
  ]);
});
test('body::after is a fixed, opaque, non-interactive corner-r x corner-h cover at top-right', () => {
  const m = cssNoComments.match(/body::after\s*\{([^}]*)\}/);
  assert(m, 'body::after rule');
  const r = m[1];
  for (const re of [/content:\s*""/, /position:\s*fixed/, /top:\s*0\b/, /right:\s*0\b/, /width:\s*var\(--corner-r\)/,
                    /height:\s*var\(--corner-h\)/, /background:\s*#080c14/, /pointer-events:\s*none/, /z-index:\s*\d+/])
    assert(re.test(r), 'body::after ' + re);
  assert(!/left:/.test(r) && !/bottom:/.test(r), 'not stretched');
});
test('every --corner-r use in components/ is additive (calc(Npx + var(--corner-r)) or marginRight), except the bottom nav', () => {
  const bad = [];
  for (const [f, src] of Object.entries(comps)) {
    const code = stripComments(src);
    for (const m of code.matchAll(/(\w+):\s*["'`]([^"'`]*--corner-r[^"'`]*)["'`]/g)) {
      const [, prop, val] = m;
      const ok = (prop === 'marginRight' && val === 'var(--corner-r)') ||
                 (/^(padding|margin)$/.test(prop) && /calc\(\d+px \+ var\(--corner-r\)\)/.test(val)) ||
                 (f === 'App.js' && prop === 'right' && val === 'calc(var(--safe-r) - var(--corner-r))') ||
                 // v3.16: the App header additionally reserves --hdr-r (still additive)
                 (f === 'App.js' && prop === 'padding' && val === '10px calc(14px + var(--corner-r) + var(--hdr-r)) 10px 14px');
      if (!ok) bad.push(`${f}: ${prop}:${val}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});
test('every top-of-screen row adds var(--corner-r)', () => {
  const need = {
    'App.js': 4,               // header + offline / sync-error / update banners
    'EligibilityScreen.js': 1, 'GameLogScreen.js': 1, 'LiveGameScreen.js': 1,
    'PitcherDetail.js': 1, 'SeasonHistory.js': 1,
    'Settings.js': 2,          // title + sub-tabs
    'TeamPickerScreen.js': 1,  // whole page
  };
  for (const [f, n] of Object.entries(need)) {
    const uses = (stripComments(comps[f]).match(/var\(--corner-r\)/g) || []).length;
    const navUse = f === 'App.js' ? 1 : 0;
    assert(uses - navUse >= n, `${f}: ${uses - navUse} < ${n}`);
  }
  // the App banners specifically
  const app = comps['App.js'];
  assert.strictEqual((app.match(/className="offline-banner"[\s\S]{0,400}?padding:"8px calc\(16px \+ var\(--corner-r\)\) 8px 16px"/g) || []).length, 3, '3 banners');
  assert(/padding:"10px calc\(14px \+ var\(--corner-r\) \+ var\(--hdr-r\)\) 10px 14px"/.test(app), 'header');
});
test('viewport-fit=cover still set (needed for env() insets to be non-zero)', () => {
  assert(/viewport-fit=cover/.test(html));
});

test('every position:fixed element in components/ handles side insets (or is a hidden probe)', () => {
  const offenders = [];
  for (const [f, src] of Object.entries(comps)) {
    const re = /style=\{\{([^]*?)\}\}/g; let m;
    while ((m = re.exec(src))) {
      const st = m[1];
      if (!/position:\s*["']fixed["']/.test(st)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      const isProbe = /visibility:\s*["']hidden["']/.test(st) && /pointerEvents:\s*["']none["']/.test(st);
      // Modal backdrops pad their sheet by the FULL insets (sheets are tall enough to
      // reach the corner), never by the corner-adjusted value.
      const padded = /paddingLeft:\s*["']var\(--safe-l\)["']/.test(st) && /paddingRight:\s*["']var\(--safe-r\)["']/.test(st) && !/corner-r/.test(st);
      // Only the bottom nav may pin to the corner-adjusted right edge (the pill isn't near the bottom).
      const pinned = /left:\s*["']var\(--safe-l\)["']/.test(st) &&
        (/right:\s*["']var\(--safe-r\)["']/.test(st) || (f === 'App.js' && /right:\s*["']calc\(var\(--safe-r\) - var\(--corner-r\)\)["']/.test(st)));
      // v3.16 left tab rail: pinned at the left inset with a fixed width (never reaches the right side).
      const rail = f === 'App.js' && /left:\s*["']var\(--safe-l\)["']/.test(st) && /width:\s*layout\.railWidth/.test(st) && !/right:/.test(st);
      if (!(isProbe || padded || pinned || rail)) offenders.push(`${f}:${line}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});
test('bottom nav: fixed outer box pinned between insets (corner mode: full width on the right), inner bar placed with centeredColumn (no translateX)', () => {
  const app = comps['App.js'];
  const sec = app.slice(app.indexOf('layout.rail ? ('), app.indexOf('TABS.map(t=>tabButton(t, false))'));
  const styles = [...sec.matchAll(/style=\{\{([^]*?)\}\}/g)].map(m => m[1]);
  const outer = styles.find(st => /position:"fixed", bottom:0/.test(st));
  assert(outer, 'outer fixed box');
  assert(/left:"var\(--safe-l\)"/.test(outer) && /right:"calc\(var\(--safe-r\) - var\(--corner-r\)\)"/.test(outer), outer);
  assert(!/background|border/.test(outer), 'outer box is an invisible positioning box');
  const inner = styles[styles.indexOf(outer) + 1];
  assert(/\.\.\.centeredColumn\(layout\.wide \? "100%" : "min\(430px, 100%\)"\)/.test(inner), inner);
  assert(/background:/.test(inner), 'inner bar carries the background');
  assert(!/translateX/.test(sec), 'translateX centering would ignore asymmetric insets');
});
test('tabs: left rail XOR bottom bar (one ternary on layout.rail), both built from tabButton', () => {
  const app = comps['App.js'];
  assert.strictEqual((app.match(/\{layout\.rail \? \(\s*<nav aria-label="Tabs"/g) || []).length, 1);
  assert.strictEqual((app.match(/TABS\.map\(t=>tabButton\(t, true\)\)/g) || []).length, 1, 'rail');
  assert.strictEqual((app.match(/TABS\.map\(t=>tabButton\(t, false\)\)/g) || []).length, 1, 'bottom bar');
  assert.strictEqual((app.match(/TABS\.map/g) || []).length, 2, 'no third tab list');
  const nav = app.match(/<nav aria-label="Tabs" style=\{\{([^]*?)\}\}/)[1];
  for (const re of [/position:"fixed"/, /top:0/, /bottom:0/, /left:"var\(--safe-l\)"/, /width:layout\.railWidth/, /zIndex:25/, /paddingTop:"calc\(var\(--top-gap\) \+ 8px\)"/, /background:"#080c14"/])
    assert(re.test(nav), 'rail ' + re);
  // live dot is inside tabButton, so the rail gets it too
  const tb = app.slice(app.indexOf('const tabButton'), app.indexOf('...centeredColumn(colWidth)'));
  assert(/t\.id==="live" && liveGame && \(\s*<span className="live-dot"/.test(tb), 'live dot in tabButton');
  // modals stack above the rail
  for (const f of ['EditGameModal.js', 'EditGameGroupModal.js', 'EligibilityScreen.js', 'TeamPickerScreen.js'])
    for (const m of comps[f].matchAll(/position:"fixed", inset:0[^}]*zIndex:(\d+)/g)) assert(+m[1] > 25, f + ' z ' + m[1]);
});
test('App wrapper: centeredColumn(colWidth), paddingLeft railWidth only with the rail; screens in a 430 column only when wide but not two-pane (v3.17)', () => {
  const app = comps['App.js'];
  assert(/const colWidth = layout\.rail \? "100%" : layout\.wide \? "min\(1100px, 100%\)" : "min\(430px, 100%\)";/.test(app));
  assert(/minHeight:"100dvh", \.\.\.centeredColumn\(colWidth\),\s*paddingLeft: layout\.rail \? layout\.railWidth : 0,/.test(app));
  // v3.16 verification B1 kept: the 430 column is screen-centred beside the rail too (offset = rail width).
  // v3.17: every screen uses the full frame in two-pane; only wide-not-two-pane (folded Duo landscape) gets the column.
  assert(/const screenWrap = \(layout\.wide && !layout\.twoPane\)\s*\? centeredColumn\("min\(430px, 100%\)", layout\.rail \? `\$\{layout\.railWidth\}px` : "0px"\) : null;/.test(app));
  assert(!/liveTwoPane/.test(app), 'v3.16 liveTwoPane removed');
  assert(/<LiveGameScreen [^>]*twoPane=\{layout\.twoPane\}/.test(app));
  assert(/<GameLogScreen [^>]*twoPane=\{layout\.twoPane\} rail=\{layout\.rail\}/.test(app));
  assert(/<SeasonHistory [^>]*twoPane=\{layout\.twoPane\} rail=\{layout\.rail\}/.test(app));
  assert(/<Settings [^>]*twoPane=\{layout\.twoPane\}/.test(app));
  assert(!/maxWidth:430, margin:"0 auto"/.test(app), 'old fixed 430 wrapper gone');
});
test('no 100vw widths (would overflow past body side padding)', () => {
  for (const [f, s] of Object.entries(comps)) assert(!/100vw/.test(s), f);
  assert(!/100vw/.test(html));
});

test('TeamPickerScreen page is a centered <=430px column (clear of the unfolded Duo corner icons)', () => {
  const tp = comps['TeamPickerScreen.js'];
  const root = tp.match(/return \(\s*<div style=\{\{([^]*?)\}\}>/g).pop();
  assert(/minHeight:"100vh"/.test(root) && /\.\.\.centeredColumn\("min\(430px, 100%\)"\)/.test(root), root);
  assert(!/maxWidth:430|margin:"0 auto"/.test(root), 'centeredColumn replaces maxWidth + auto margins');
  assert(/padding:"0 calc\(16px \+ var\(--corner-r\)\) 40px 16px"/.test(root), 'still corner-padded');
});

// ── Rename ──────────────────────────────────────────────────────────────
test('no user-facing "Game Log" text left in components/ (besides "Game Logged!")', () => {
  const hits = [];
  for (const [f, src] of Object.entries(comps)) {
    const code = stripComments(src);
    code.split('\n').forEach((l, i) => {
      const cleaned = l.replace(/Game Logged!/g, '');
      if (/game\s+log\b/i.test(cleaned)) hits.push(`${f}: ${l.trim()}`);
    });
  }
  assert.deepStrictEqual(hits, []);
});
test('tab label is "Log Game", id still "gamelog"', () => {
  assert(/\{\s*id:"gamelog",\s*label:"Log Game"/.test(comps['App.js']));
});
test('screen heading is "LOG GAME"', () => {
  assert(/>LOG GAME</.test(comps['GameLogScreen.js']));
});
test('Live tab "Game Logged!" toast intentionally unchanged', () => {
  assert(/Game Logged!/.test(comps['LiveGameScreen.js']));
});
test('index.html/manifest have no user-facing "Game Log"', () => {
  assert(!/Game Log\b/.test(stripComments(html).replace(/<!--[\s\S]*?-->/g, '')));
  assert(!/Game Log/.test(read('manifest.json')));
});

// ── DisplayInfoSection ──────────────────────────────────────────────────
const settings = comps['Settings.js'];
test('DisplayInfoSection is defined once and only rendered behind role==="admin"', () => {
  assert.strictEqual((settings.match(/function DisplayInfoSection\b/g) || []).length, 1);
  const uses = [...settings.matchAll(/<DisplayInfoSection\b[^>]*\/?>/g)];
  assert.strictEqual(uses.length, 1, 'rendered exactly once');
  const before = settings.slice(Math.max(0, uses[0].index - 40), uses[0].index);
  assert(/role\s*===\s*"admin"\s*&&\s*$/.test(before), 'gated on role === "admin"');
  for (const [f, s] of Object.entries(comps)) if (f !== 'Settings.js') assert(!/DisplayInfoSection/.test(s), f);
});
test('DisplayInfoSection removes every listener it adds', () => {
  const body = settings.slice(settings.indexOf('function DisplayInfoSection'), settings.indexOf('function AccountSection'));
  const add = [...body.matchAll(/addEventListener\("([^"]+)",\s*(\w+)\)/g)].map(m => m[1] + ':' + m[2]).sort();
  const rem = [...body.matchAll(/removeEventListener\("([^"]+)",\s*(\w+)\)/g)].map(m => m[1] + ':' + m[2]).sort();
  assert(add.length >= 1);
  assert.deepStrictEqual(rem, add);
});
test('DisplayInfoSection re-measures at 100/350/800ms, clears pending timers on re-trigger and on unmount', () => {
  const body = settings.slice(settings.indexOf('function DisplayInfoSection'), settings.indexOf('function AccountSection'));
  assert(/\[\s*100\s*,\s*350\s*,\s*800\s*\]\.map\(\s*ms\s*=>\s*setTimeout\(\s*measure\s*,\s*ms\s*\)\s*\)/.test(body), 'delays');
  const soon = body.match(/function measureSoon\(\)\s*\{([\s\S]*?)\n    \}/);
  assert(soon, 'measureSoon');
  assert(soon[1].indexOf('clearTimeout') > -1 && soon[1].indexOf('clearTimeout') < soon[1].indexOf('setTimeout'), 'clears before re-arming');
  const cleanup = body.match(/return\s*\(\)\s*=>\s*\{([\s\S]*?)\};/);
  assert(cleanup && /timers\.forEach\(clearTimeout\)/.test(cleanup[1]), 'cleanup clears timers');
  assert(/addEventListener\("resize",\s*measureSoon\)/.test(body) && /addEventListener\("orientationchange",\s*measureSoon\)/.test(body));
  // measure() bails when the probe is gone, so a stray timer can't throw
  assert(/if\s*\(!el\)\s*return;/.test(body));
});
test('DisplayInfoSection has a Refresh button wired to the measure function', () => {
  const body = settings.slice(settings.indexOf('function DisplayInfoSection'), settings.indexOf('function AccountSection'));
  assert(/<button[^>]*onClick=\{\(\)=>measureRef\.current && measureRef\.current\(\)\}[^>]*aria-label="Refresh display info"/.test(body));
  assert(/measureRef\.current = measureSoon;/.test(body));
});
test('DisplayInfoSection is read-only (no storage / Firebase / network)', () => {
  const body = settings.slice(settings.indexOf('function DisplayInfoSection'), settings.indexOf('function AccountSection'));
  assert(!/localStorage|sessionStorage|indexedDB|__fb|fetch\(|XMLHttpRequest|sendBeacon|save\(|navigator\.userAgent|dangerouslySetInnerHTML/.test(body));
});
test('hooks used by DisplayInfoSection are destructured in the head-shell', () => {
  assert(/const \{[^}]*\buseRef\b[^}]*\} = React;/.test(html));
  assert(/const \{[^}]*\buseEffect\b[^}]*\} = React;/.test(html));
});

// ── v3.16 wide layouts ──────────────────────────────────────────────────
const vm = require('vm');
const ui = read('lib/ui-constants.js');
test('centeredColumn: width + marginRight 0 + clamp()ed marginLeft that centers on the screen within the insets', () => {
  const src = ui.match(/const centeredColumn = \(width, offset="0px"\) => \(\{[\s\S]*?\}\);/);
  assert(src, 'centeredColumn defined');
  const cc = vm.runInNewContext(src[0] + '; centeredColumn');
  const o = cc('min(430px, 100%)');
  assert.deepStrictEqual(Object.keys(o).sort(), ['marginLeft', 'marginRight', 'width']);
  assert.strictEqual(o.width, 'min(430px, 100%)'); assert.strictEqual(o.marginRight, 0);
  assert.strictEqual(o.marginLeft, 'clamp(0px, calc((100vw - min(430px, 100%)) / 2 - var(--safe-l) - 0px), calc(100% - min(430px, 100%)))');
  assert.strictEqual(cc('min(430px, 100%)', '72px').marginLeft, 'clamp(0px, calc((100vw - min(430px, 100%)) / 2 - var(--safe-l) - 72px), calc(100% - min(430px, 100%)))', 'rail offset');
  // model of that CSS (100% = body content box = vw - safe-l - bodyPadR): screen-centred when it fits
  const left = (vw, l, r, W) => { const box = vw - l - r, w = Math.min(W, box); return l + Math.min(Math.max(0, (vw - w) / 2 - l), box - w); };
  assert.strictEqual(left(678, 0, 84, 430) + 215, 339, 'folded landscape, inset right: centred');
  assert.strictEqual(left(678, 84, 0, 430) + 215, 339, 'folded landscape, inset left: centred');
  assert.strictEqual(left(450, 10, 60, 430), 10, 'too tight: pinned to the left inset');
  assert(/exposes|window\.UIConstants = \{[^}]*\bcenteredColumn\b/.test(ui), 'exported');
  assert(/const \{[^}]*\bcenteredColumn\b[^}]*\} = window\.UIConstants;/.test(html), 'destructured in head-shell');
});
test('100vw only appears inside centeredColumn (bounded by the clamp max, so it cannot overflow)', () => {
  const uses = ui.split('\n').filter(l => /100vw/.test(l));
  assert.strictEqual(uses.length, 1); assert(/marginLeft:`clamp\(0px,.*calc\(100% - \$\{width\}\)\)`/.test(uses[0]), uses[0]);
});

// useLayout run in a VM with fake React/DOM (the hook body has no JSX)
const shared = comps['shared.js'];
const ulSrc = shared.slice(shared.indexOf('function useLayout()'), shared.indexOf('// ─── Screen error boundary'));
function runLayout({ vw, vh, l = 0, r = 0 }) {
  const listeners = {}, timers = new Map(); let tid = 0, effect, state, probe = null, created = 0;
  const ctx = {
    window: { innerWidth: vw, innerHeight: vh,
      addEventListener: (t, f) => (listeners[t] = listeners[t] || []).push(f),
      removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); } },
    document: { getElementById: id => (id === 'pt-inset-probe' ? probe : null),
      createElement: () => { created++; return { style: {}, setAttribute(k, v) { this[k] = v; } }; },
      body: { appendChild: el => { probe = el; } } },
    getComputedStyle: () => ({ paddingLeft: l + 'px', paddingRight: r + 'px' }),
    setTimeout: (f, ms) => { timers.set(++tid, { f, ms }); return tid; },
    clearTimeout: id => timers.delete(id),
    useState: init => { state = typeof init === 'function' ? init() : init; return [state, u => { state = typeof u === 'function' ? u(state) : u; }]; },
    useEffect: f => { effect = f; },
  };
  vm.runInNewContext(ulSrc + '; this.out = useLayout();', ctx);
  return { ctx, get state() { return state; }, effect: () => effect, listeners, timers, probe: () => probe, created: () => created, first: ctx.out };
}
test('useLayout: wide / rail / twoPane matrix incl. real Duo + phone numbers', () => {
  const cases = [
    // [name, vw, vh, l, r, wide, rail, twoPane]
    ['phone 390x844', 390, 844, 0, 0, false, false, false],
    ['phone landscape 844x390 l=r=47 (844>=600 -> rail)', 844, 390, 47, 47, true, true, true],
    ['folded Duo portrait 457x678 r=84', 457, 678, 0, 84, false, false, false],
    ['folded Duo landscape 678x457 r=84', 678, 457, 0, 84, true, true, false],
    ['folded Duo landscape 678x457 l=84', 678, 457, 84, 0, true, true, false],
    ['unfolded Duo portrait 669x951', 669, 951, 0, 0, true, false, true],
    ['unfolded Duo landscape 951x669 r=84', 951, 669, 0, 84, true, true, true],
    ['599 portrait', 599, 900, 0, 0, false, false, false],
    ['600 portrait', 600, 900, 0, 0, true, false, false],
    ['portrait boundary 648 (content 616)', 648, 900, 0, 0, true, false, true],
    ['portrait boundary 647 (content 615)', 647, 900, 0, 0, true, false, false],
    ['rail boundary 720x500 (content 616)', 720, 500, 0, 0, true, true, true],
    ['rail boundary 719x500 (content 615)', 719, 500, 0, 0, true, true, false],
    ['rail boundary with insets 760x500 r=40', 760, 500, 0, 40, true, true, true],
    ['rail boundary with insets 759x500 r=40', 759, 500, 0, 40, true, true, false],
    ['square 700x700 is not landscape', 700, 700, 0, 0, true, false, true],
  ];
  const bad = [];
  for (const [n, vw, vh, l, r, wide, rail, two] of cases) {
    const o = runLayout({ vw, vh, l, r }).first;
    if (o.wide !== wide || o.rail !== rail || o.twoPane !== two || o.railWidth !== 72) bad.push(`${n}: ${JSON.stringify(o)}`);
  }
  assert.deepStrictEqual(bad, []);
});
test('useLayout: probe reads --safe-l/--safe-r, is hidden/inert/aria-hidden, created once', () => {
  const h = runLayout({ vw: 678, vh: 457, r: 84 });
  const p = h.probe();
  assert(p && p.id === 'pt-inset-probe' && p['aria-hidden'] === 'true');
  for (const re of [/position:fixed/, /visibility:hidden/, /pointer-events:none/, /width:0/, /height:0/, /var\(--safe-r, 0px\)/, /var\(--safe-l, 0px\)/]) assert(re.test(p.style.cssText), re);
  const cleanup = h.effect()(); // mount effect: runs update() once more
  h.listeners.resize[0](); h.listeners.resize[0]();
  assert.strictEqual(h.created(), 1, 'probe reused, not re-created per measure');
  assert(!/innerHTML|localStorage|sessionStorage|fetch\(|__fb/.test(ulSrc), 'no HTML injection / storage / network');
});
test('useLayout: resize/orientationchange re-measure now + 100/350/800ms, bursts keep 3 timers, cleanup removes everything', () => {
  const h = runLayout({ vw: 669, vh: 951 });
  const cleanup = h.effect()();
  assert.deepStrictEqual(Object.keys(h.listeners).sort(), ['orientationchange', 'resize']);
  const before = h.state;
  h.ctx.window.innerWidth = 951; h.ctx.window.innerHeight = 669;
  h.listeners.orientationchange[0]();
  assert.strictEqual(h.state.rail, true, 'immediate re-measure');
  assert.deepStrictEqual([...h.timers.values()].map(t => t.ms), [100, 350, 800]);
  for (let i = 0; i < 10; i++) h.listeners.resize[0]();
  assert.strictEqual(h.timers.size, 3, 'earlier timers cleared');
  // a late env() change is picked up by a delayed timer
  h.ctx.getComputedStyle = () => ({ paddingLeft: '0px', paddingRight: '300px' });
  [...h.timers.values()][0].f();
  assert.strictEqual(h.state.twoPane, false, 'delayed measure saw the late inset');
  // unchanged result keeps the same object (no re-render)
  const s1 = h.state; [...h.timers.values()][1].f(); assert.strictEqual(h.state, s1);
  cleanup();
  assert.strictEqual(h.timers.size, 0, 'timers cleared on unmount');
  assert.deepStrictEqual([h.listeners.resize.length, h.listeners.orientationchange.length], [0, 0]);
  assert(before.rail === false);
});
test('useLayout is defined once (shared.js); called once, unconditionally, at the top of App and of each modal host (v3.17)', () => {
  // v3.17: the 4 modal hosts call it too, to switch sheet <-> centered dialog.
  const callers = { 'App.js': 1, 'shared.js': 1, 'EditGameModal.js': 1, 'EditGameGroupModal.js': 1, 'EligibilityScreen.js': 1, 'TeamPickerScreen.js': 1 };
  for (const [f, s] of Object.entries(comps)) {
    const defs = (s.match(/function useLayout\b/g) || []).length;
    assert.strictEqual(defs, f === 'shared.js' ? 1 : 0, f);
    const calls = (stripComments(s).match(/\buseLayout\(\)/g) || []).length;
    assert.strictEqual(calls, callers[f] || 0, f + ' calls');
  }
  const app = comps['App.js'];
  const call = app.indexOf('const layout = useLayout();');
  assert(call > 0 && call < app.indexOf('if (!teamId || showTeamPicker)') && call < app.indexOf('if (!loaded)'), 'before every early return (hook order)');
  for (const f of ['EditGameModal.js', 'EditGameGroupModal.js', 'EligibilityScreen.js', 'TeamPickerScreen.js']) {
    const src = stripComments(comps[f]);
    const fnStart = src.search(/^function [A-Z]\w*\(/m);
    const body = src.slice(fnStart);
    const callAt = body.indexOf('const { wide } = useLayout();');
    assert(callAt > 0, f + ' destructures { wide }');
    // first statement of the component (nothing but the signature before it) => unconditional, before any return
    assert(/^function \w+\([^)]*\)\s*\{\s*$/.test(body.slice(0, callAt).replace(/\{[^{}]*\}/g, '')), f + ' call is the first statement');
  }
});
test('--hdr-r: 0px by default, 128px only for standalone + min-width:600px + portrait, used only in the App header', () => {
  const root = cssNoComments.match(/(^|\n)\s*:root\s*\{([^}]*)\}/);
  assert(/--hdr-r:\s*0px/.test(root[2]));
  const rules = [...cssNoComments.matchAll(/@media\s*([^{]*)\{\s*:root\s*\{([^}]*)\}\s*\}/g)].filter(m => /--hdr-r/.test(m[2]));
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0][1].trim(), '(display-mode: standalone) and (min-width: 600px) and (orientation: portrait)');
  assert(/^\s*--hdr-r:\s*128px;?\s*$/.test(rules[0][2]));
  assert.strictEqual((cssNoComments.match(/--hdr-r/g) || []).length, 2, 'only :root + that rule in CSS');
  const uses = Object.entries(comps).flatMap(([f, s]) => (stripComments(s).match(/var\(--hdr-r\)/g) || []).map(() => f));
  assert.deepStrictEqual(uses, ['App.js']);
});
const live = comps['LiveGameScreen.js'];
test('LiveGameScreen: twoPane prop defaults false; one-column order details, game, available, unavailable, finish', () => {
  assert(/function LiveGameScreen\(\{[^}]*twoPane=false[^}]*\}\)/.test(live));
  for (const n of ['detailsCard', 'inGameCard', 'availableCard', 'unavailableCard', 'finishControls'])
    assert.strictEqual((live.match(new RegExp('const ' + n + ' = \\(<>')) || []).length, 1, n);
  assert(/<>\{detailsCard\}\{inGameCard\}\{availableCard\}\{unavailableCard\}\{finishControls\}<\/>/.test(live), 'phone order');
});
test('LiveGameScreen two-pane grid: left = game + finish, right = available + unavailable + details; every section once per branch', () => {
  const g = live.match(/twoPane \? \(\s*<div style=\{\{ display:"grid", gridTemplateColumns:"minmax\(360px, 1\.4fr\) minmax\(220px, 1fr\)"[^}]*\}\}>\s*<div style=\{\{ minWidth:0 \}\}>([^<]*)<\/div>\s*<div style=\{\{ minWidth:0 \}\}>([^<]*)<\/div>/);
  assert(g, 'grid markup');
  assert.strictEqual(g[1].trim(), '{inGameCard}{finishControls}');
  assert.strictEqual(g[2].trim(), '{availableCard}{unavailableCard}{detailsCard}');
  // the Unfinished banner + header stay above both branches
  const ret = live.slice(live.lastIndexOf('return (\n    <div style={{ padding:"0 16px 110px" }}>'));
  assert(ret.indexOf('{header}') < ret.indexOf('{isStale') && ret.indexOf('{isStale') < ret.indexOf('{twoPane ?'));
});
test('LiveGameScreen: setup and "Game Logged!" states use the centered 430 narrowCol; available rows go full-width with "N left" only in two-pane', () => {
  assert(/const narrowCol = twoPane \? \{ maxWidth:430, margin:"0 auto" \} : null;/.test(live));
  assert.strictEqual((live.match(/<div style=\{\{ padding:"0 16px 110px", \.\.\.narrowCol \}\}>/g) || []).length, 2);
  assert(/flexDirection:twoPane\?"column":"row", flexWrap:twoPane\?"nowrap":"wrap"/.test(live));
  assert(/\{b\.pitchesLeft\}\{twoPane\?" left":""\}/.test(live));
});

// ── v3.17 two-pane screens + modal dialogs ─────────────────────────────
const uic = read('lib/ui-constants.js');
test('v3.17 stickyPane(rail): sticky under the header, own scroll, height bounded by dvh minus header/bottom bar/inset; exported + destructured', () => {
  const m = uic.match(/const stickyPane = rail => \(\{([^]*?)\}\);/);
  assert(m, 'stickyPane defined');
  assert(/position:"sticky"/.test(m[1]) && /top:"calc\(var\(--top-gap\) \+ 66px\)"/.test(m[1]) && /overflowY:"auto"/.test(m[1]));
  assert(/maxHeight:`calc\(100dvh - var\(--top-gap\) - 66px - \$\{rail \? "0px" : "64px"\} - env\(safe-area-inset-bottom, 0px\)\)`/.test(m[1]));
  assert(/window\.UIConstants = \{[^}]*\bstickyPane\b[^}]*\}/.test(uic));
  assert(/const \{[^}]*\bstickyPane\b[^}]*\} = window\.UIConstants;/.test(html));
});
test('v3.17 Roster two-pane: list | embedded PitcherDetail (keyed by id) or placeholder; phone drill-in unchanged', () => {
  const app = comps['App.js'];
  const i = app.indexOf('{tab==="roster" && layout.twoPane ? (');
  assert(i > 0);
  const sec = app.slice(i, app.indexOf(') : tab==="roster" && selectedPlayer ? ('));
  assert(/<EligibilityScreen [^]*?selectedId=\{selectedPlayer \? selectedPlayer\.id : null\}/.test(sec));
  assert(/\.\.\.stickyPane\(layout\.rail\)/.test(sec));
  assert(/<PitcherDetail key=\{selectedPlayer\.id\} pitcher=\{selectedPlayer\} embedded/.test(sec));
  assert(/Tap a pitcher/.test(sec), 'placeholder');
  // phone path keeps the Back-button drill-in
  assert(/\) : tab==="roster" && selectedPlayer \? \(\s*<ScreenBoundary onBack=\{\(\)=>setSelectedPlayer\(null\)\}>\s*<PitcherDetail pitcher=\{selectedPlayer\} onBack=/.test(app));
  const pd = comps['PitcherDetail.js'];
  assert(/function PitcherDetail\(\{[^}]*embedded=false[^}]*\}\)/.test(pd));
  assert(/\{!embedded && \(\s*<button onClick=\{onBack\} aria-label="Back to roster"/.test(pd));
  const el = comps['EligibilityScreen.js'];
  assert(/function EligibilityScreen\(\{[^}]*selectedId=null[^}]*\}\)/.test(el));
  assert.strictEqual((el.match(/aria-current=\{p\.id===selectedId \|\| undefined\}/g) || []).length, 2, 'both available + resting rows mark the selection');
});
test('v3.17 Season: phone order filter, totals, leaderboard, summary, games; two-pane = games | sticky filter+totals+leaderboard+summary', () => {
  const sh = comps['SeasonHistory.js'];
  assert(/function SeasonHistory\(\{[^}]*twoPane=false, rail=false[^}]*\}\)/.test(sh));
  for (const n of ['filterCard', 'totalsRow', 'leaderboardCard', 'pitcherSummary', 'gameList'])
    assert.strictEqual((sh.match(new RegExp('const ' + n + ' = \\(<>')) || []).length, 1, n);
  assert(/<>\{filterCard\}\{totalsRow\}\{leaderboardCard\}\{pitcherSummary\}\{gameList\}<\/>/.test(sh), 'phone order');
  assert(/<div style=\{\{ minWidth:0 \}\}>\{gameList\}<\/div>\s*<div style=\{\{ minWidth:0, \.\.\.stickyPane\(rail\) \}\}>\{filterCard\}\{totalsRow\}\{leaderboardCard\}\{pitcherSummary\}<\/div>/.test(sh), 'two-pane');
});
test('v3.17 Log Game: phone = details, WHO PITCHED (chips + counts), save; two-pane = details + chips | sticky counts + save; saved state centered 430', () => {
  const gl = comps['GameLogScreen.js'];
  assert(/function GameLogScreen\(\{[^}]*twoPane=false, rail=false[^}]*\}\)/.test(gl));
  for (const n of ['detailsCard', 'pickerChips', 'countRows', 'saveControls'])
    assert.strictEqual((gl.match(new RegExp('const ' + n + ' = \\(<>')) || []).length, 1, n);
  const ph = gl.slice(gl.lastIndexOf(') : ('));
  assert(ph.indexOf('{detailsCard}') < ph.indexOf('{pickerChips}') && ph.indexOf('{pickerChips}') < ph.indexOf('{countRows}') && ph.indexOf('{countRows}') < ph.indexOf('{saveControls}'), 'phone order');
  const tp = gl.slice(gl.indexOf('{twoPane ? ('), gl.lastIndexOf(') : ('));
  const right = tp.indexOf('...stickyPane(rail)');
  assert(right > 0);
  assert(tp.indexOf('{detailsCard}') < right && tp.indexOf('{pickerChips}') < right && tp.indexOf(': countRows}') > right && tp.indexOf('{saveControls}') > right);
  assert(/\.\.\.\(twoPane && saved \? \{ maxWidth:430, margin:"0 auto" \} : null\)/.test(gl));
});
test('v3.17 Settings: phone sub-tabs keep the corner-r margin; two-pane nav list | content; each section rendered once per branch', () => {
  const st = comps['Settings.js'];
  assert(/function Settings\(\{[^}]*twoPane=false[^}]*\}\)/.test(st));
  assert(/<nav aria-label="Settings sections"/.test(st));
  assert(/margin:"0 calc\(16px \+ var\(--corner-r\)\) 14px 16px"/.test(st));
  for (const n of ['<AddPitcherSection ', '<TournamentScreen ', '<AccountSection ']) assert.strictEqual(st.split(n).length - 1, 2, n);
});
test('v3.17 modals: centered dialog (maxWidth 520, all corners rounded) when wide, bottom sheet otherwise; still padded by full insets and scrollable', () => {
  for (const f of ['EditGameModal.js', 'EditGameGroupModal.js', 'EligibilityScreen.js', 'TeamPickerScreen.js']) {
    const src = comps[f];
    assert(/alignItems:wide\?"center":"flex-end"/.test(src), f + ' align');
    assert(/maxWidth:wide\?520:430/.test(src), f + ' width');
    assert(/borderRadius:wide\?20:"20px 20px 0 0"/.test(src), f + ' radius');
    assert(/maxHeight:"(92vh|85dvh|85vh)", overflowY:"auto"|maxHeight:"85vh", overflowY:"auto"/.test(src), f + ' scroll');
  }
});

// ── Collision rule ──────────────────────────────────────────────────────
test('top-level declarations: no duplicate names across components/ and lib/', () => {
  const names = {};
  const files = [...compFiles.map(f => 'components/' + f), 'lib/ui-constants.js'];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(/^(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      (names[m[1]] = names[m[1]] || []).push(f);
    }
  }
  const dups = Object.entries(names).filter(([, v]) => v.length > 1);
  assert.deepStrictEqual(dups, []);
});
test('components/: only the pre-existing App.js consts are top-level const/let', () => {
  const allowed = new Set(['App.js:TABS', 'App.js:TEAM_ID_KEY', 'App.js:TEAM_META_KEY']);
  const extra = [];
  for (const [f, src] of Object.entries(comps)) {
    for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      if (!allowed.has(`${f}:${m[1]}`)) extra.push(`${f}:${m[1]}`);
    }
  }
  assert.deepStrictEqual(extra, []);
});
test('component top-level names do not collide with head-shell names in index.html', () => {
  const shell = new Set();
  for (const m of html.matchAll(/^\s*(?:const|let)\s+\{([^}]*)\}\s*=/gm)) m[1].split(',').forEach(n => shell.add(n.split(':').pop().trim()));
  for (const m of html.matchAll(/^\s*(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)) shell.add(m[1]);
  const clashes = [];
  for (const [f, src] of Object.entries(comps))
    for (const m of src.matchAll(/^(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm))
      if (shell.has(m[1])) clashes.push(`${f}:${m[1]}`);
  assert.deepStrictEqual(clashes, []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
