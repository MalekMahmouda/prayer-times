'use strict';
const fs = require('fs');
const path = require('path');
const lines = fs.readFileSync(path.join(__dirname, '..', 'tmp', 'asar-list.txt'), 'utf8')
  .split(/\r?\n/)
  .map((l) => l.replace(/^\\+|^\/+/g, '').replace(/\\/g, '/'))
  .filter(Boolean);
const need = ['package.json', 'prayer-times.html', 'adhan.html', 'widget.html', 'preload.js', 'widget-preload.js', 'main/main.js', 'main/scheduler.js', 'main/tray.js', 'main/overlay-preload.js', 'main/json-store.js', 'js/app.js', 'js/pages.js', 'js/pages3.js', 'js/reader.js', 'js/store3.js', 'js/data.js', 'js/stats.js', 'styles/app.css', 'assets/icon.ico', 'assets/icon-256.png', 'data/quran.json'];
const missing = need.filter((f) => !lines.includes(f));
console.log(missing.length ? 'MISSING: ' + missing.join(', ') : 'All ' + need.length + ' required files in app.asar ✓');
console.log('adhan runtime bundled:', lines.some((l) => l.startsWith('node_modules/adhan/')) ? '✓' : 'NO');
console.log('asar total files:', lines.length);
