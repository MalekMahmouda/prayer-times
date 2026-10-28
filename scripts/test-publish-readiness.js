'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('js/app.js');
const dataSource = read('js/data.js');
const pages = read('js/pages.js');
const pages3 = read('js/pages3.js');
const reader = read('js/reader.js');
const compass = read('js/compass.js');
const store3Source = read('js/store3.js');
const html = read('prayer-times.html');
const css = read('styles/app.css');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }

const dataContext = vm.createContext({});
vm.runInContext(`${dataSource}\nglobalThis.__i18n = { THEMES, T };`, dataContext, { filename: 'data.js' });
const { THEMES, T } = dataContext.__i18n;

function functionSource(source, name) {
  const re = new RegExp(`(?:function|const) ${name}[^\\n]*[\\s\\S]*?^}`, 'm');
  const match = source.match(re);
  assert.ok(match, `function ${name} exists`);
  return match[0];
}

test('all built-in theme previews include their background, surface, primary and prayer colors', () => {
  assert.equal(THEMES.length, 8);
  for (const theme of THEMES) assert.equal(theme.preview.length, 4, `${theme.id} has four preview colors`);
  const oled = THEMES.find((theme) => theme.id === 'oled');
  assert.equal(oled.preview[0], '#000000');
  assert.notEqual(oled.preview[0], oled.color);
  const previewSource = functionSource(app, 'themePreview');
  const context = vm.createContext({});
  vm.runInContext(`${previewSource}\nglobalThis.preview = themePreview;`, context);
  for (const theme of THEMES) {
    const gradient = context.preview(theme);
    for (const color of theme.preview) assert.ok(gradient.includes(color), `${theme.id} includes ${color}`);
  }
});

test('swatch marks are circular and the active theme uses a ring around the color mark', () => {
  assert.match(css, /\.sw-dot\{[^}]*border-radius:50%/);
  assert.match(css, /\.sw\.active \.sw-dot\{[^}]*0 0 0 4px var\(--primary\)/);
  assert.match(css, /\.ms \.sw\{[^}]*min-width:44px;min-height:44px/);
  assert.match(css, /\.history-undo\[hidden\]\{display:none!important\}/);
  assert.match(app, /aria-pressed', String\(th\.id === S\.cfg\.theme\)/);
});

test('Theme Builder seeds all color controls from current built-in or custom tokens', () => {
  assert.match(pages3, /value="\$\{tbDraft\[k\]\}"/);
  assert.match(pages3, /function activeThemeTokens\(\)/);
  assert.match(pages3, /getPropertyValue\(cssVar\)/);
  assert.doesNotMatch(pages3, /tbDraft && tbDraft\[k\]\) \|\| '#1a6e4f'/);
  const tokenRows = [
    ['bg', 'Background', '--bg'], ['surface', 'Surface', '--surface'], ['primary', 'Primary', '--primary'], ['text', 'Text', '--text'],
    ['border', 'Border', '--border'], ['accent', 'Accent', '--gold'], ['hFajr', 'Fajr', '--h-fajr'], ['hDhuhr', 'Dhuhr', '--h-dhuhr'],
    ['hAsr', 'Asr', '--h-asr'], ['hMaghrib', 'Maghrib', '--h-maghrib'], ['hIsha', 'Isha', '--h-isha'],
  ];
  const themeFn = functionSource(pages3, 'activeThemeTokens');
  const colors = Object.fromEntries(tokenRows.map(([, , cssVar], i) => [cssVar, `#${(i + 1).toString(16).padStart(6, '0')}`]));
  const context = vm.createContext({
    TB_TOKENS: tokenRows.map(([key, , cssVar]) => [key, '', cssVar]),
    DB3: { customThemes: [] }, S: { cfg: { theme: 'oled' } }, document: { body: {} },
    getComputedStyle: () => ({ getPropertyValue: (key) => colors[key] }),
  });
  vm.runInContext(`${themeFn}\nglobalThis.seeded = activeThemeTokens();`, context);
  for (const [key, , cssVar] of tokenRows) assert.equal(context.seeded[key], colors[cssVar]);
});

test('browser/PWA hides all desktop-only controls while Electron keeps them available', () => {
  assert.match(app, /if \(!IS_DESKTOP\) document\.querySelectorAll\('\.only-desktop'\)\.forEach\(\(el\) => \{ el\.hidden = true; \}\)/);
  assert.match(app, /const IS_DESKTOP\s*=\s*!!PT/);
  assert.match(html, /id="tgSww"/);
  assert.match(html, /class="card set-card only-desktop"/);
  assert.match(html, /id="tgWidget"|id="tgMini"/);
});

test('Arabic settings and Theme Builder text are complete and Asr wording is universal', () => {
  for (const key of ['data', 'export', 'import', 'backupNote', 'themeBuilder', 'shortcuts', 'widgetTitle', 'widget', 'widgetS', 'mini', 'miniS', 'tbYourThemes', 'tbBackground', 'tbSurface', 'tbPrimary', 'tbText', 'tbBorder', 'tbAccent', 'tbFajr', 'tbDhuhr', 'tbAsr', 'tbMaghrib', 'tbIsha', 'tbPreview', 'tbSave', 'tbDelete', 'tbReset', 'tbImmutable']) {
    assert.ok(T.en.set[key], `English setting ${key}`);
    assert.ok(T.ar.set[key], `Arabic setting ${key}`);
  }
  assert.match(T.en.set.madhabS, /every method/);
  assert.match(T.ar.set.madhabS, /جميع طرق الحساب/);
  assert.ok(T.en.set.localData && T.ar.set.localData);
  for (const id of ['shData', 'slExport', 'slImport', 'backupNote', 'shThemeBuilder', 'shKeys', 'shWidget', 'slWidget', 'slWidgetS', 'slMini', 'slMiniS']) assert.match(app, new RegExp(`\\$\\('${id}'\\)\\.textContent`));
  assert.match(app, /renderThemeBuilder\(\)/);
});

test('mobile prayer history has date navigation and a reversible last state update', () => {
  for (const id of ['histPrevM', 'histDateM', 'histNextM', 'histTodayBtnM', 'histUndoM', 'histChipsM']) {
    const occurrences = html.match(new RegExp(`id="${id}"`, 'g')) || [];
    assert.equal(occurrences.length, 1, `${id} is unique`);
  }
  for (const id of ['histPrev', 'histDate', 'histNext', 'histTodayBtn', 'histUndo', 'histChips']) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} is unique`);
  assert.match(pages3, /\['histChips', 'histChipsM'\]/);
  assert.match(pages3, /Store3\.historySet\(DB3, action\.date, action\.prayer, action\.before\)/);
  assert.match(pages3, /focusRef\.focus\(\{ preventScroll: true \}\)/);
  assert.match(pages3, /\['histPrev', 'histPrevM'\]/);
  assert.match(pages3, /\['histDate', 'histDateM'\]/);
  const storeContext = vm.createContext({
    window: {}, console,
    localStorage: { getItem: () => null, setItem: () => {} },
  });
  vm.runInContext(store3Source, storeContext, { filename: 'store3.js' });
  const store = storeContext.window.Store3;
  const db = store.load();
  const date = '2026-10-28';
  assert.equal(store.historySet(db, date, 'Fajr', 'missed'), true);
  assert.equal(store.historyGet(db, date).Fajr, 'missed');
  assert.equal(store.historySet(db, date, 'Fajr', ''), true);
  assert.equal(db.history[date], undefined, 'undoing the only status removes the empty date record');
  assert.equal(store.historySet(db, date, 'NoPrayer', 'done'), false);
  assert.equal(store.historySet(db, 'not-a-date', 'Fajr', 'done'), false);
});

test('selecting a surah opens reading; audio remains on the explicit Listen control', () => {
  const block = pages.slice(pages.indexOf('window.renderSurahList ='), pages.indexOf('function qrSetPlayerVisibility'));
  assert.match(block, /role="button" tabindex="0"/);
  assert.match(block, /window\.quranOpenReader\(surah\.n\)/);
  assert.match(block, /window\.switchQTab\('read'\)/);
  assert.match(block, /e\.key === 'Enter' \|\| e\.key === ' '/);
  assert.doesNotMatch(block, /qrLoadAndPlay/);
  assert.match(reader, /mshPlay[\s\S]*?qrLoadAndPlay\(surahN - 1\)/);
});

test('static Qibla guidance never says rotation will move a static needle', () => {
  assert.match(compass, /state\.unsupported \? 'qibla\.static' : 'qibla\.noSensor'/);
  assert.match(compass, /function renderGuidance\(\)[\s\S]*?qibla\.howStatic/);
  assert.match(compass, /mode: state\.heading != null \? 'live'/);
  assert.match(T.en.qibla.howStatic, /does not react when you rotate/);
  assert.match(T.ar.qibla.howStatic, /لا يتفاعل مع تدوير الجهاز/);
  assert.match(T.en.qibla.howLive, /turn the device/);
  assert.match(T.ar.qibla.howLive, /أدر الجهاز/);
});

test('responsive mode changes preserve every page except the prayers/mobile-home alias', () => {
  const fn = functionSource(app, 'applyMMode');
  function transition(initialPage, initialMobile, nextMobile) {
    let mobile = initialMobile;
    let active = `page-${initialPage}`;
    const context = vm.createContext({
      document: {
        body: { classList: {
          contains: () => mobile,
          toggle: (_name, value) => { mobile = value; },
        } },
        querySelector: () => ({ id: active }),
      },
      buildMSwatches: () => {},
      gotoPage: (page) => { active = `page-${mobile && page === 'prayers' ? 'mhome' : page}`; },
    });
    vm.runInContext(`${fn}\napplyMMode(${nextMobile});`, context);
    return active;
  }
  for (const page of ['calendar', 'qibla', 'quran', 'names', 'dhikr', 'stats', 'downloads', 'settings']) {
    assert.equal(transition(page, false, true), `page-${page}`, `desktop → mobile keeps ${page}`);
    assert.equal(transition(page, true, false), `page-${page}`, `mobile → desktop keeps ${page}`);
  }
  assert.equal(transition('prayers', false, true), 'page-mhome');
  assert.equal(transition('mhome', true, false), 'page-prayers');
});

test('GPS accuracy thresholds and first-run protection remain unchanged from the public source', () => {
  const baseline = execFileSync('git', ['show', '947d18d8aab2241fa30c5eb1e3b21215368dae11:js/app.js'], { cwd: root, encoding: 'utf8' });
  const gpsRegion = (source) => {
    const options = source.match(/^const GPS_OPTIONS = .*?;\nconst GPS_POOR_ACCURACY_M = .*?;$/m);
    const handler = source.match(/^function applyGPSPosition\(pos, requestId, userInitiated\) \{[\s\S]*?^\}/m);
    assert.ok(options && handler, 'GPS options and guarded position handler exist');
    return `${options[0]}\n${handler[0]}`;
  };
  assert.equal(gpsRegion(app), gpsRegion(baseline));
});

console.log(`${checks} publication-readiness regression groups passed.`);
