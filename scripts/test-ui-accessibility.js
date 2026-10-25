'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('prayer-times.html');
const app = read('js/app.js');
const pages = read('js/pages.js');
const reader = read('js/reader.js');
const css = read('styles/app.css');
const earlyLocale = read('js/early-locale.js');
const buildWeb = read('scripts/build-web.js');
const buildWww = read('scripts/build-www.js');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS', name); }

test('saved Arabic sets RTL metadata before styles and ships in both web builds', () => {
  assert.match(html, /js\/early-locale\.js[\s\S]*?styles\/app\.css/);
  assert.match(earlyLocale, /localStorage\.getItem\('ptlg'\) === 'ar'/);
  assert.match(earlyLocale, /document\.documentElement\.dir = 'rtl'/);
  assert.match(buildWww, /'early-locale\.js'/);
  assert.match(buildWeb, /'js\/early-locale\.js'/);
});

test('sidebar theme and Asr options are translated in both languages', () => {
  assert.match(html, /id="sbThemeLbl"/);
  assert.match(app, /sidebarTheme\.textContent = t\('set\.theme'\)/);
  assert.match(app, /madhabSelect\.options\[0\]\.textContent = t\('set\.shafi'\)/);
  assert.match(app, /madhabSelect\.options\[1\]\.textContent = t\('set\.hanafi'\)/);
});

test('icon-only navigation and reader controls receive localized accessible names', () => {
  assert.match(app, /const iconButtonLabels = \{/);
  assert.match(app, /button\.setAttribute\('aria-label', label\)/);
  assert.match(app, /navJump\.setAttribute\('aria-label', t\('nav\.settings'\)\)/);
});

test('calendar days are native buttons with a readable date and selected state', () => {
  assert.match(pages, /<button type="button" class="cal-cell[\s\S]*?aria-label="\$\{dateLabel\}" aria-pressed="\$\{isSel\}"/);
  assert.match(pages, /querySelectorAll\('\.cal-cell\[data-d\]'\)/);
});

test('dhikr counter is a named button and Space does not double-count from controls', () => {
  assert.match(html, /<button class="dhikr-ring" id="dhikrRing" type="button" aria-describedby="dhikrHint"/);
  assert.match(pages, /ring\.setAttribute\('aria-label', `\$\{t\('dhikr\.count'\)\}/);
  assert.match(pages, /target\.closest\('button,a,input,select,textarea,\[contenteditable="true"\]'\)/);
});

test('Quran verses, search results, and bookmarks support keyboard activation', () => {
  assert.match(reader, /class="ayah-inline[\s\S]*?role="button" tabindex="0"/);
  assert.match(reader, /el\.addEventListener\('keydown', \(e\) => \{[\s\S]*?openVpop/);
  assert.match(reader, /class="qs-hit"[^\n]*role="button" tabindex="0"/);
  assert.match(reader, /class="bmm"[^\n]*role="button" tabindex="0"/);
  assert.match(reader, /aria-label="\$\{S\.lang === 'ar' \? 'إزالة العلامة المرجعية' : 'Remove bookmark'\}"/);
});

test('full-screen adhan dialog has focus handling, Escape close, and a tab trap', () => {
  assert.match(html, /id="azanOverlay"[^>]*role="dialog"[^>]*tabindex="-1"/);
  assert.match(app, /let _azanOpener = null/);
  assert.match(app, /const opener = _azanOpener/);
  assert.match(app, /if \(_azanOpen\) \{[\s\S]*?e\.key === 'Escape'[\s\S]*?e\.key === 'Tab'[\s\S]*?dialog\.contains\(document\.activeElement\)/);
});

test('reduced-motion media query removes transitions', () => {
  const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, 'reduced-motion media query exists');
  assert.match(block[1], /transition-property:none\s*!important/);
  assert.match(block[1], /transition-duration:0s\s*!important/);
  assert.doesNotMatch(block[1], /transition-duration:\.15s/);
});

console.log(`${tests} UI accessibility regression checks passed.`);
