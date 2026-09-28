'use strict';

/**
 * Assembles the mobile web app into www/ for Capacitor:
 *   www/index.html        ← prayer-times.html (rewritten: desktop bridge → Android)
 *   www/styles/app.css    ← copied
 *   www/js/*.js           ← app.js, pages.js, pages3.js, reader.js, store3.js, data.js, adhan-bundle.js
 *   www/data/quran.json   ← bundled Quran dataset
 *   www/icons/icon-*.png  ← app icons for the webapp
 *
 * All rewrites apply to the index.html copy only — the desktop renderer is untouched.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

function rm(p) { fs.rmSync(p, { recursive: true, force: true }); }
function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

rm(WWW);
fs.mkdirSync(WWW, { recursive: true });

// ── 1. Bundle the adhan lib + mobile scheduler bridge for the browser ──
execSync(
  `npx esbuild www-build/entry.js --bundle --format=iife ` +
  `--outfile=${JSON.stringify(path.join(WWW, 'js', 'adhan-bundle.js'))} --minify`,
  { stdio: 'inherit', cwd: ROOT }
);

// ── 2. Copy static assets ──
cp(path.join(ROOT, 'styles', 'app.css'), path.join(WWW, 'styles', 'app.css'));
cp(path.join(ROOT, 'styles', 'fonts.css'), path.join(WWW, 'styles', 'fonts.css'));
fs.mkdirSync(path.join(WWW, 'fonts'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'fonts'))) {
  if (f.endsWith('.woff2')) cp(path.join(ROOT, 'fonts', f), path.join(WWW, 'fonts', f));
}
for (const f of ['app.js', 'pages.js', 'pages3.js', 'reader.js', 'store3.js', 'data.js', 'platform.js']) {
  cp(path.join(ROOT, 'js', f), path.join(WWW, 'js', f));
}
cp(path.join(ROOT, 'data', 'quran.json'), path.join(WWW, 'data', 'quran.json'));
for (const icon of fs.readdirSync(path.join(ROOT, 'assets'))) {
  if (icon.startsWith('icon-')) cp(path.join(ROOT, 'assets', icon), path.join(WWW, 'icons', icon));
}

// ── 3. index.html: copy + rewrites ──
let html = fs.readFileSync(path.join(ROOT, 'prayer-times.html'), 'utf8');

// 3a. remove desktop-only preload bridges
html = html.replace(/<script src="preload\.js"><\/script>\s*/g, '');

// 3b. inject the mobile scheduler bundle just before </body>
html = html.replace(
  '</body>',
  '  <script src="js/adhan-bundle.js"></script>\n</body>'
);

fs.writeFileSync(path.join(WWW, 'index.html'), html);
console.log('www/ built:', fs.readdirSync(WWW).join(', '));
