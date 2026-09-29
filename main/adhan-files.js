'use strict';

/**
 * Adhan audio resolution — main process.
 *
 * Priority:
 *   1. Bundled local file from assets/adhans/ (works fully offline)
 *   2. The ONLINE CDN url (optional fallback; needs internet)
 *
 * Known adhan ids → bundled file names (assets/adhans/):
 *   alafasy → default.mp3 (Mishary Alafasy), nafees, dubai, zahrani, turkey, classic
 */

const path = require('path');
const fs = require('fs');

const BUNDLED_DIR = path.join(__dirname, '..', 'assets', 'adhans');

const ADHAN_BUNDLES = {
  alafasy: 'default.mp3',
  default: 'default.mp3',
  nafees: 'nafees.mp3',
  dubai: 'dubai.mp3',
  zahrani: 'zahrani.mp3',
  turkey: 'turkey.mp3',
  classic: 'classic.mp3',
};

// Online fallback (optional — only used when the bundled file is missing).
const ADHAN_ONLINE = {
  alafasy: 'https://cdn.aladhan.com/audio/adhans/a9.mp3',
  nafees: 'https://cdn.aladhan.com/audio/adhans/a1.mp3',
  dubai: 'https://cdn.aladhan.com/audio/adhans/a4.mp3',
  zahrani: 'https://cdn.aladhan.com/audio/adhans/a11-mansour-al-zahrani.mp3',
  turkey: 'https://cdn.aladhan.com/audio/adhans/a2.mp3',
  classic: 'https://cdn.aladhan.com/audio/adhans/a7.mp3',
};

/** Clamp a volume setting into the valid 0.0–1.0 range. */
function clampVolume(v, fallback = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

/** fs.existsSync that never throws (per Windows path quirks / permissions). */
function exists(p) {
  try { return !!p && fs.existsSync(p); } catch (e) { return false; }
}

/**
 * Resolve a mu'adhdhin id to a playable source.
 * Returns { src, kind: 'bundled' | 'online' | 'custom', file? }.
 * `customLocalPath` (optional) is an absolute path to a user-chosen audio file.
 */
function resolveAdhanAudio(adhanId, customLocalPath) {
  const id = typeof adhanId === 'string' && adhanId ? adhanId : 'alafasy';

  // 0. User-configured local file (highest priority — explicit user choice).
  if (typeof customLocalPath === 'string' && customLocalPath && customLocalPath !== '' && exists(customLocalPath)) {
    return { src: customLocalPath.startsWith('file:')
      ? customLocalPath
      : 'file://' + customLocalPath.replace(/\\/g, '/'), kind: 'custom' };
  }

  // 1. Bundled local file — primary, offline-safe. Prefer the asar-unpacked
  //    real file (packaged builds) so <audio> streams a normal mp3.
  const file = ADHAN_BUNDLES[id] || ADHAN_BUNDLES.default;
  const abs = path.join(BUNDLED_DIR, file);
  const unpacked = abs.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
  const chosen = exists(unpacked) ? unpacked : abs;
  if (exists(chosen)) {
    return { src: 'file://' + chosen.replace(/\\/g, '/'), kind: 'bundled', file };
  }

  // 2. Online CDN — optional fallback only.
  const online = ADHAN_ONLINE[id] || ADHAN_ONLINE.alafasy;
  return { src: online, kind: 'online' };
}

module.exports = { resolveAdhanAudio, clampVolume, ADHAN_BUNDLES, ADHAN_ONLINE, BUNDLED_DIR };
