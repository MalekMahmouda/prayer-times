'use strict';

/**
 * Builds the installable Web app into dist-web/:
 *   1. runs the www pipeline (renderer + fonts + adhan bundle)
 *   2. adds PWA layer: manifest.webmanifest, sw.js (offline app shell),
 *      web.css polish, meta tags.
 * Serve dist-web/ with any static server; installable + fully offline after
 * the first visit.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist-web');

// ── 1. Reuse the www pipeline, but into dist-web/ ──
// build-www.js hardcodes www/, so build there and copy, then add PWA files.
execSync('npm run www', { stdio: 'inherit', cwd: ROOT });
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'www'), DIST, { recursive: true });

// ── 2. index.html: PWA wiring ──
let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
html = html.replace(
  '<link rel="stylesheet" href="styles/fonts.css">',
  `<link rel="stylesheet" href="styles/fonts.css">
<link rel="stylesheet" href="styles/web.css">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#0e6b43">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/icon-256.png">
<link rel="icon" type="image/png" href="icons/icon-256.png">`
);
html = html.replace('</body>', '  <script src="sw-reg.js"></script>\n</body>');
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// ── 3. web.css — polish layer on top of the app's own tokens ──
fs.writeFileSync(path.join(DIST, 'styles', 'web.css'), `/* ── Web build polish layer (loaded only in the PWA build) ── */
body.web-mode::before{content:'';position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(60% 42% at 18% -4%,var(--primary-soft),transparent 62%),
             radial-gradient(48% 38% at 88% 108%,rgba(185,138,47,.14),transparent 64%)}
body.web-mode .app{max-width:1560px;margin:0 auto;box-shadow:0 0 0 1px var(--border),0 24px 70px rgba(15,40,30,.14)}
body.web-mode .topbar{padding-top:max(0px,env(safe-area-inset-top))}
body.web-mode .card{border-radius:20px}
body.web-mode .btn{border-radius:13px}
body.web-mode .bnav{max-width:560px;margin:0 auto;border-radius:20px 20px 0 0;border:1px solid var(--border);border-bottom:none}
@media(min-width:769px){body.web-mode .mushaf-wrap{max-width:900px}}
body.web-mode .mushaf{box-shadow:0 18px 44px rgba(80,58,12,.16),var(--shadow)}
@media(display-mode:standalone){body.web-mode .topbar{padding-top:env(safe-area-inset-top)}}
`);

// ── 4. manifest.webmanifest (icons from assets) ──
const icons = [192, 256, 512].filter((s) => fs.existsSync(path.join(ROOT, 'assets', `icon-${s}.png`)))
  .map((s) => ({ src: `icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any maskable' }));
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: 'Prayer Times — Islamic Companion',
  short_name: 'Prayer Times',
  description: 'Prayer times, Quran, Qibla, Dhikr and more — offline, private, no account.',
  lang: 'en',
  dir: 'ltr',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#f4f1e8',
  theme_color: '#0e6b43',
  icons,
}, null, 2));

// ── 5. sw.js — offline app shell (cache key changes every build) ──
const CACHE = 'pt-cache-' + new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const SHELL = ['index.html', 'styles/app.css', 'styles/fonts.css', 'styles/web.css', 'js/app.js', 'js/pages.js', 'js/pages3.js', 'js/reader.js', 'js/store3.js', 'js/data.js', 'js/platform.js', 'js/adhan-bundle.js', 'js/pt-engine.js', 'js/compass.js', 'data/quran.json', 'manifest.webmanifest', ...fs.readdirSync(path.join(ROOT, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`), ...fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => /^icon-(16|32|48|64|128|256)\.png$/.test(f)).map((f) => `icons/${f}`)];
fs.writeFileSync(path.join(DIST, 'sw.js'), `/* Prayer Times service worker — offline app shell (v1) */
const CACHE = '${CACHE}';
const SHELL = ${JSON.stringify(SHELL)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // adhan audio streams straight from network
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
`);

// ── 6. sw-reg.js — registration + web-mode class ──
fs.writeFileSync(path.join(DIST, 'sw-reg.js'), `/* PWA registration (web build only) */
document.body.classList.add('web-mode');
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
`);

console.log('dist-web/ built:', fs.readdirSync(DIST).join(', '));
