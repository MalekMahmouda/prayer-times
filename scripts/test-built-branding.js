'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS', name); }

test('generated Pages document carries the approved browser and social title', () => {
  const html = read('dist-web/index.html');
  assert.match(html, /<title>SalahNest \| Prayer Times/);
  assert.match(html, /og:site_name" content="SalahNest/);
  assert.match(html, /id="sbTitle">SalahNest</);
});

test('generated PWA installation metadata carries the approved name', () => {
  const manifest = JSON.parse(read('dist-web/manifest.webmanifest'));
  assert.equal(manifest.name, 'SalahNest — Islamic Companion');
  assert.equal(manifest.short_name, 'SalahNest');
  assert.equal(manifest.start_url, './index.html');
  assert.equal(manifest.scope, './');
});

test('generated Android web shell carries SalahNest in the title and app UI', () => {
  const html = read('www/index.html');
  const data = read('www/js/data.js');
  assert.match(html, /<title>SalahNest \| Prayer Times/);
  assert.match(html, /id="sbTitle">SalahNest</);
  assert.match(data, /appName: 'SalahNest'/);
  assert.match(data, /title: 'حمّل تطبيق SalahNest'/);
});

if (fs.existsSync(path.join(root, 'android/app/src/main/assets/public/index.html'))) {
  test('Capacitor native asset copy carries the same approved brand', () => {
    const html = read('android/app/src/main/assets/public/index.html');
    const data = read('android/app/src/main/assets/public/js/data.js');
    const config = JSON.parse(read('android/app/src/main/assets/capacitor.config.json'));
    assert.match(html, /<title>SalahNest \| Prayer Times/);
    assert.match(html, /id="sbTitle">SalahNest</);
    assert.match(data, /appName: 'SalahNest'/);
    assert.equal(config.appName, 'SalahNest');
    assert.equal(config.appId, 'com.malek.prayertimes');
  });
}

console.log(`${tests} generated-branding checks passed.`);
