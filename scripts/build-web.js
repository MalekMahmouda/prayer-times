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

// Canonical public URL — every SEO hint below points at it. Keep in sync with
// the gh-pages remote (scripts/build-web.js is the ONLY deploy pipeline).
const SITE_URL = 'https://malekmahmouda.github.io';
const SITE_PATH = '/salahnest/';
const SITE = SITE_URL + SITE_PATH;
const SITE_TITLE = 'SalahNest | Prayer Times — أوقات الصلاة، مسبحة، قرآن، قبلة، تقويم هجري';
const SITE_DESC = 'Free offline prayer times app: accurate Muslim prayer times with adhan notifications, Qibla compass, full Quran reader with mushaf verses, electronic tasbih (dhikr counter), Hijri calendar, and 99 Names of Allah. Works with no account — install or use right in the browser.';
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
<meta name="description" content="${SITE_DESC}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${SITE}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}">
<meta property="og:title" content="${SITE_TITLE}">
<meta property="og:description" content="${SITE_DESC}">
<meta property="og:image" content="${SITE}assets/social-preview.png">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ar_AR">
<meta property="og:site_name" content="SalahNest">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${SITE_TITLE}">
<meta name="twitter:description" content="${SITE_DESC}">
<meta name="twitter:image" content="${SITE}assets/social-preview.png">
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="#f7f6f0">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icons/icon-256.png">
<link rel="icon" type="image/png" href="icons/icon-256.png">`
);
html = html.replace('</body>', '  <script src="sw-reg.js"></script>\n</body>');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${SITE_TITLE}</title>`);
fs.writeFileSync(path.join(DIST, 'index.html'), html);

// ── 3. web.css — polish layer on top of the app's own tokens ──
fs.writeFileSync(path.join(DIST, 'styles', 'web.css'), `/* ── Web build polish layer (loaded only in the PWA build) ── */
body.web-mode .app{max-width:1560px;margin:0 auto;border-inline:1px solid var(--border)}
body.web-mode .topbar{padding-top:max(0px,env(safe-area-inset-top))}
body.web-mode .card{border-radius:16px}
body.web-mode .btn{border-radius:13px}
body.web-mode .bnav{max-width:560px;margin:0 auto;border-radius:16px 16px 0 0;border:1px solid var(--border);border-bottom:none}
@media(min-width:769px){body.web-mode .mushaf-wrap{max-width:900px}}
body.web-mode .mushaf{box-shadow:0 18px 44px rgba(80,58,12,.16),var(--shadow)}
@media(display-mode:standalone){body.web-mode .topbar{padding-top:env(safe-area-inset-top)}}
`);

// ── 4. manifest.webmanifest (icons from assets) ──
const icons = [192, 256, 512].filter((s) => fs.existsSync(path.join(ROOT, 'assets', `icon-${s}.png`)))
  .map((s) => ({ src: `icons/icon-${s}.png`, sizes: `${s}x${s}`, type: 'image/png', purpose: 'any maskable' }));
fs.writeFileSync(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({
  name: 'SalahNest — Islamic Companion',
  short_name: 'SalahNest',
  description: 'SalahNest: prayer times, Quran, Qibla, Dhikr and more — offline, private, no account.',
  lang: 'en',
  dir: 'ltr',
  start_url: './index.html',
  scope: './',
  display: 'standalone',
  orientation: 'any',
  background_color: '#f7f6f0',
  theme_color: '#f7f6f0',
  icons,
}, null, 2));

// ── 4b. SEO files: robots.txt + sitemap.xml (canonical URL is the gh-pages site) ──
fs.writeFileSync(path.join(DIST, 'robots.txt'),
`User-agent: *
Allow: /

Sitemap: ${SITE}sitemap.xml
`);
const today = new Date().toISOString().slice(0, 10);
// A sitemap of ONE url, because there is one url. The app is a single document
// whose "pages" are hash routes (#/prayers, #/downloads …); fragments are not
// part of a URL for crawlers, so listing them here would be noise Google has to
// throw away — it finds those states by crawling the document itself. The old
// list also carried data/, fonts/*.txt, robots.txt and the manifest, i.e. exactly
// the assets that add no discovery value and spend crawl budget.
// Generated, never hand-edited in the gh-pages checkout, so a redeploy cannot
// silently shrink it back to whatever someone committed last.
const SITEMAP_URLS = [
  { path: '', changefreq: 'weekly', priority: '1.0' },
];
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Prayer Times — the whole app is this one URL (#/… routes are fragments) -->
${
  SITEMAP_URLS.map((u) => `  <url>\n    <loc>${SITE}${u.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')
}
</urlset>
`);

// ── 4c. Branded Pages error document ──
// GitHub Pages serves this file with HTTP 404 for missing paths. Keep it
// standalone so broken routes remain helpful even when app assets are absent.
const notFoundHtml = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <meta name="description" content="That SalahNest page could not be found. Return to the prayer times app.">
  <link rel="icon" type="image/png" href="${SITE}icons/icon-256.png">
  <title>Page not found | SalahNest</title>
  <style>
    :root{color-scheme:light; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; color:#243e35; background:#f7f6f0}
    *{box-sizing:border-box}
    body{min-height:100vh; margin:0; display:grid; place-items:center; padding:24px}
    main{width:min(100%,520px); padding:clamp(28px,7vw,52px); border:1px solid #dedfd4; border-radius:24px; background:#fffefa; box-shadow:0 12px 30px rgba(29,55,43,.07)}
    .brand{margin:0 0 24px; color:#245d4d; font-size:.82rem; font-weight:750; letter-spacing:.12em; text-transform:uppercase}
    .code{margin:0; color:#8f6208; font-size:.8rem; font-weight:700; letter-spacing:.14em}
    h1{margin:10px 0 12px; font-size:clamp(2rem,7vw,3rem); line-height:1.08; letter-spacing:-.04em}
    p{color:#606d64; line-height:1.65}
    a{display:inline-flex; margin-top:12px; padding:12px 18px; border-radius:12px; background:#245d4d; color:#fff; font-weight:700; text-decoration:none}
    a:focus-visible{outline:3px solid #8f6208; outline-offset:3px}
    a:hover{background:#1b493c}
  </style>
</head>
<body>
  <main aria-labelledby="error-title">
    <p class="brand">SalahNest</p>
    <p class="code">404 · PAGE NOT FOUND</p>
    <h1 id="error-title">We couldn’t find that page.</h1>
    <p>The address may be incorrect, or the page may have moved. Your prayer times and app data are unchanged.</p>
    <a href="${SITE}">Return to SalahNest</a>
  </main>
</body>
</html>
`;
fs.writeFileSync(path.join(DIST, '404.html'), notFoundHtml);

// ── 5. sw.js — offline app shell (cache key changes every build) ──
const CACHE = 'pt-cache-' + new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const SHELL = [
  'index.html', 'styles/app.css', 'styles/motion.css', 'styles/fonts.css',
  'styles/companion.css', 'styles/web.css', 'js/early-locale.js',
  'js/web-alerts.js', 'js/app.js', 'js/motion.js', 'js/pages.js', 'js/pages3.js',
  'js/reader.js', 'js/store3.js', 'js/data.js', 'js/platform.js', 'js/adhan-bundle.js',
  'js/pt-engine.js', 'js/compass.js', 'js/stats.js', 'js/extras.js',
  'data/quran.json', 'manifest.webmanifest',
  'assets/salahnest-mark.png', 'assets/social-preview.png',
  ...fs.readdirSync(path.join(ROOT, 'assets', 'adhans')).filter((f) => f.endsWith('.mp3')).map((f) => `adhans/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'fonts')).filter((f) => f.endsWith('.woff2')).map((f) => `fonts/${f}`),
  ...fs.readdirSync(path.join(ROOT, 'assets')).filter((f) => /^icon-(16|32|48|64|128|192|256|512)\.png$/.test(f)).map((f) => `icons/${f}`),
];
fs.writeFileSync(path.join(DIST, 'sw.js'), `/* Prayer Times service worker — offline app shell (v1) */
const CACHE = '${CACHE}';
const SHELL = ${JSON.stringify(SHELL)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pt-cache-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL('./index.html#/prayers', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) { await existing.focus(); return existing.navigate(target); }
    return self.clients.openWindow(target);
  }));
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
