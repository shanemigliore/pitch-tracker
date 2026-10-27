#!/usr/bin/env node
/**
 * Static (dependency-free) verification of the iPhone Duo layout rules:
 * v3.14 - side safe-area insets, landscape allowed, "Game Log" -> "Log Game"
 *         rename, admin-only DisplayInfoSection.
 * v3.15 - narrow-screen "corner mode" (--corner-r / --corner-h, body::after
 *         corner cover, top rows add var(--corner-r), full-width bottom nav,
 *         modal sheets keep the full inset), flat 32px --top-gap in a wide
 *         Home Screen app, DisplayInfoSection delayed re-measure + Refresh.
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
test('version is v3.15 (minor bump from v3.14)', () => {
  assert.strictEqual(html.match(/const APP_VERSION = "([^"]+)";/)[1], 'v3.15');
  assert.strictEqual((html.match(/v3\.14/g) || []).length, 0, 'no stale v3.14 left in index.html');
});
test('CLAUDE.md current version matches', () => {
  assert(/\*\*Current version:\*\* v3\.15/.test(read('CLAUDE.md')));
});

// ── Landscape ───────────────────────────────────────────────────────────
test('no #landscape-block overlay anywhere', () => {
  assert(!/landscape-block/.test(html), 'index.html');
  for (const [f, s] of Object.entries(comps)) assert(!/landscape-block/.test(s), f);
  assert(!/ROTATE YOUR DEVICE/i.test(html));
});
test('no CSS orientation media query hiding content', () => {
  assert(!/@media\s*\(orientation/.test(html));
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
                 (f === 'App.js' && prop === 'right' && val === 'calc(var(--safe-r) - var(--corner-r))');
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
  assert(/padding:"10px calc\(14px \+ var\(--corner-r\)\) 10px 14px"/.test(app), 'header');
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
      if (!(isProbe || padded || pinned)) offenders.push(`${f}:${line}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});
test('bottom nav is pinned between insets (corner mode: full width on the right) and centered (no translateX/100% width)', () => {
  const nav = comps['App.js'].match(/Bottom nav[\s\S]*?style=\{\{([^]*?)\}\}/);
  assert(nav);
  assert(/left:"var\(--safe-l\)"/.test(nav[1]) && /right:"calc\(var\(--safe-r\) - var\(--corner-r\)\)"/.test(nav[1]));
  assert(/margin:"0 auto"/.test(nav[1]) && /maxWidth:430/.test(nav[1]));
  assert(!/translateX/.test(nav[1]), 'translateX centering would ignore asymmetric insets');
});
test('no 100vw widths (would overflow past body side padding)', () => {
  for (const [f, s] of Object.entries(comps)) assert(!/100vw/.test(s), f);
  assert(!/100vw/.test(html));
});

test('TeamPickerScreen page is a centered <=430px column (clear of the unfolded Duo corner icons)', () => {
  const tp = comps['TeamPickerScreen.js'];
  const root = tp.match(/return \(\s*<div style=\{\{([^]*?)\}\}>/g).pop();
  assert(/minHeight:"100vh"/.test(root) && /maxWidth:430/.test(root) && /margin:"0 auto"/.test(root), root);
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
