#!/usr/bin/env node
/**
 * Static (dependency-free) verification for v3.14: iPhone Duo side safe-area
 * insets, landscape allowed, "Game Log" -> "Log Game" rename, admin-only
 * DisplayInfoSection, version bump.
 * Run with: node tests/duo-layout-v314.verify.test.js
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
test('version is v3.14 (minor bump from v3.13)', () => {
  assert.strictEqual(html.match(/const APP_VERSION = "([^"]+)";/)[1], 'v3.14');
  assert.strictEqual((html.match(/v3\.13/g) || []).length, 0, 'no stale v3.13 left in index.html');
});
test('CLAUDE.md current version matches', () => {
  assert(/\*\*Current version:\*\* v3\.14/.test(read('CLAUDE.md')));
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
test('body pads left/right by the vars', () => {
  const body = html.match(/\bbody\s*\{[^}]*padding-top[^}]*\}/);
  assert(body, 'body rule with padding-top');
  assert(/padding-left:\s*var\(--safe-l\)/.test(body[0]));
  assert(/padding-right:\s*var\(--safe-r\)/.test(body[0]));
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
      const padded = /paddingLeft:\s*["']var\(--safe-l\)["']/.test(st) && /paddingRight:\s*["']var\(--safe-r\)["']/.test(st);
      const pinned = /left:\s*["']var\(--safe-l\)["']/.test(st) && /right:\s*["']var\(--safe-r\)["']/.test(st);
      if (!(isProbe || padded || pinned)) offenders.push(`${f}:${line}`);
    }
  }
  assert.deepStrictEqual(offenders, []);
});
test('bottom nav is pinned between insets and centered (no translateX/100% width)', () => {
  const nav = comps['App.js'].match(/Bottom nav[\s\S]*?style=\{\{([^]*?)\}\}/);
  assert(nav);
  assert(/left:"var\(--safe-l\)"/.test(nav[1]) && /right:"var\(--safe-r\)"/.test(nav[1]));
  assert(/margin:"0 auto"/.test(nav[1]) && /maxWidth:430/.test(nav[1]));
  assert(!/translateX/.test(nav[1]), 'translateX centering would ignore asymmetric insets');
});
test('no 100vw widths (would overflow past body side padding)', () => {
  for (const [f, s] of Object.entries(comps)) assert(!/100vw/.test(s), f);
  assert(!/100vw/.test(html));
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
