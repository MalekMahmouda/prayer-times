'use strict';

/**
 * Copies the six bundled adhan recordings into the Android res/raw folder so
 * notification channels can play the real adhan (v1.4.0):
 *   assets/adhans/alafasy.mp3 → android/app/src/main/res/raw/alafasy.mp3
 *   (…same for nafees, dubai, zahrani, turkey, classic)
 *
 * Android resource names must be lowercase alphanumeric — all six ids are.
 * The channel sound name in www-build/mobile-scheduler.js resolves
 * `res/raw/<type>` — keep the two in sync.
 *
 * Run: node scripts/gen-android-raw.js   (wired into `npm run apk`)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'adhans');
const DEST = path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'raw');

const TYPES = ['alafasy', 'nafees', 'dubai', 'zahrani', 'turkey', 'classic'];
// assets/adhans ships `default.mp3` for the alafasy id (desktop resolver).
const FILE_FOR = { alafasy: 'default.mp3' };

fs.mkdirSync(DEST, { recursive: true });
let copied = 0;
for (const type of TYPES) {
  const name = FILE_FOR[type] || `${type}.mp3`;
  const src = path.join(SRC, name);
  if (!fs.existsSync(src)) {
    console.error(`gen-android-raw: missing ${path.relative(ROOT, src)}`);
    process.exit(1);
  }
  const dest = path.join(DEST, `${type}.mp3`);
  const srcBuf = fs.readFileSync(src);
  if (fs.existsSync(dest) && fs.readFileSync(dest).equals(srcBuf)) continue; // up to date
  fs.writeFileSync(dest, srcBuf);
  copied++;
  console.log(`  ${path.relative(ROOT, src)} → ${path.relative(ROOT, dest)} (${srcBuf.length} bytes)`);
}
// Prune any raw adhan mp3 we no longer ship (keeps res/raw clean).
for (const f of fs.readdirSync(DEST)) {
  if (f.endsWith('.mp3') && !TYPES.includes(f.replace(/\.mp3$/, ''))) {
    fs.unlinkSync(path.join(DEST, f));
    console.log(`  removed stale ${f}`);
  }
}
console.log(`gen-android-raw: ${copied} file(s) copied, res/raw ready`);
