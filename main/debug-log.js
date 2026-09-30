'use strict';

/**
 * debug-log.js — persistent forensic log for the adhan / notification pipeline.
 *
 * File: <userData>/azan-debug.log → %APPDATA%\Prayer Times\azan-debug.log
 * (the same folder that already holds pt-desktop.json).
 *
 * Design rules:
 *   - ALWAYS on: the whole point is to explain "why did my adhan not fire"
 *     after the fact, when debug flags were never set.
 *   - Synchronized appends (appendFileSync) so a crash loses nothing.
 *   - Never throws: logging must not be able to break the app.
 *   - Size-capped: when the file passes ~1 MB the OLDER HALF is trimmed on
 *     the next write, so it can never grow unbounded.
 *   - Plain Node — no Electron import — so tests can drive it directly.
 */

const fs = require('fs');
const path = require('path');

const MAX_BYTES = 1024 * 1024; // trim threshold (~1 MB)

let file = null; // absolute log path once initialized

function pad(n, w = 2) { return String(n).padStart(w, '0'); }
function stamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + ` ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function fmt(p) {
  if (p && typeof p === 'object') { try { return JSON.stringify(p); } catch (e) { return '[object]'; } }
  return String(p);
}

/* Keep the newest half + a marker. Never throws. */
function rotate() {
  try {
    const buf = fs.readFileSync(file);
    const keep = buf.slice(Math.floor(buf.length / 2));
    fs.writeFileSync(file, `\n── log trimmed ${stamp()} (older half removed, ${buf.length} → ${keep.length + 64} bytes) ──\n${keep}`);
  } catch (e) { /* ignore */ }
}

function line(msg) {
  if (!file) return;
  try {
    fs.appendFileSync(file, `[${stamp()}] ${msg}\n`);
    try { if (fs.statSync(file).size > MAX_BYTES) rotate(); } catch (e) { /* ignore */ }
  } catch (e) { /* disk full / locked — logging must never break the app */ }
}

function azlog(...parts) { line(parts.map(fmt).join(' ')); }

/* Initialize with the app's userData directory. Safe to call once at boot. */
azlog.init = function init({ dir, version = '?', packaged = true }) {
  try {
    file = path.join(dir, 'azan-debug.log');
    try { if (fs.statSync(file).size > MAX_BYTES) rotate(); } catch (e) { /* first run */ }
    line(`── azan-debug start | v${version} | packaged=${!!packaged} | pid=${process.pid} ──`);
  } catch (e) { file = null; }
  return file;
};

module.exports = azlog;
