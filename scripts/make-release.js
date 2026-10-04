'use strict';

/**
 * Assembles the release/ folder after a successful installer build:
 *   release/Prayer-Times-Setup-<version>.exe  (copied from dist/)
 *   release/SHA256SUMS.txt
 *   release/RELEASE-NOTES.txt
 *   release/TEST-CHECKLIST.md
 * Run: npm run release   (after npm run package:installer)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'release');

const pkg = require(path.join(ROOT, 'package.json'));
const version = pkg.version;
const exeName = `Prayer-Times-Setup-${version}.exe`;
const exePath = path.join(DIST, exeName);

const NOTES = `Prayer Times ${version}
======================

Islamic desktop companion — prayer times, Quran, Dhikr, Qibla, calendar,
99 Names, prayer history & statistics, Ramadan mode, desktop widget.

Highlights
----------
- Native Windows installer (Program Files, per-machine)
- System tray with live next-prayer countdown
- Offline prayer calculations with 8 calculation methods + madhab option
- Fullscreen Adhan overlay with 6 muadhdhin choices and per-prayer profiles
- Bundled verified Quran text (Tanzil / Saheeh International) — reader,
  search and bookmarks work fully offline
- Prayer history and statistics (record-based, stored locally only)
- Multiple saved locations with timezone support
- Desktop mini widget and Mini Mode
- Backup & restore of all personal data (JSON)
- 8 built-in themes + custom theme builder
- English / Arabic with full RTL

What's new in ${version}
------------------------
Azan & audio
- Test Adhan on Windows now plays through the REAL pipeline — the same
  bundled recording, configured volume and fullscreen overlay used at
  prayer time, fully offline. Previously the test streamed from a CDN
  inside the app window; when that silently failed the app showed the
  cryptic "🔇 🔊" toast. The CDN preview remains for the web/PWA build.
- Fixed the renderer Content-Security-Policy: host rules without an
  explicit scheme never matched on desktop (file://) pages, silently
  blocking the adhan preview, streaming Quran audio and the Arabic web
  fonts. Hosts are now scheme-prefixed and match everywhere.
- Repaired the streaming Quran reciters: cdn.islamic.network now serves
  only two editions (Alafasy, Abdul Basid); As-Sudais, Al-Husary and
  Al-Minshawi moved to their mp3quran.net full-surah servers.

Qibla
- Map-rose rendering: the dial rotates by the device heading, so the
  Kaaba marker on the rim always sits at the TRUE qibla direction
  (previously the Kaaba spun decoratively in the dial's center)
- Compass hardening: if the primary orientation channel stays silent
  for 3 s the fallback channel opens automatically; both listeners are
  removed together when the Qibla page closes

Azan reliability
- One authoritative adhanEnabled switch: OFF stays OFF and ON stays ON
  after restarts (the earlier adhan:false state confusion)
- The overlay toggle now controls visibility only — disabling the
  fullscreen overlay no longer silences the azan audio
- Every azan event leaves a complete boundary-by-boundary trace in
  azan-debug.log, and all six bundled mu'adhdhin recordings are
  verified end-to-end (file, size, packaging, resolver)
- Audio output hardening: the overlay re-binds to the default output
  device when it changes mid-playback (setSinkId), and window/element
  audio state is diagnosable via azan-debug.log

Data & Privacy
--------------
All personal data (settings, history, bookmarks, locations, themes, dhikr
progress) is stored locally under %APPDATA%\\Prayer Times. Nothing is sent
anywhere. Uninstalling keeps your data; use Settings > Data Management to
export or import a backup at any time.

Notes
-----
- The Windows installer is not code-signed, so Windows SmartScreen may
  show a warning on first run; choose "More info" > "Run anyway" if you
  trust this build. SHA-256 checksums ship alongside the installer.
`;

const CHECKLIST = `# Manual Test Checklist — Prayer Times ${version}

Run this on a clean Windows machine (or a fresh VM) if possible.

## Install
- [ ] Double-click ${exeName}; SmartScreen note: choose "More info" > "Run anyway"
- [ ] Choose install directory (default Program Files works)
- [ ] Optional desktop shortcut checkbox works
- [ ] Launch-after-install checkbox works
- [ ] App launches and tray icon appears

## First run
- [ ] Location configures (GPS or city search); prayer times appear
- [ ] Countdown ticks; next-prayer highlight correct
- [ ] Themes switch (try OLED + Sahara); Arabic toggle works with RTL

## Core features
- [ ] Quran reader loads a surah offline; search finds text; bookmark an ayah
- [ ] Dhikr counter and library persist counts
- [ ] Record today's prayers in Prayer Record; check Stats page
- [ ] Calendar shows the month; CSV export works
- [ ] Qibla bearing + distance displayed

## Reliability
- [ ] Close window -> still in tray -> tray Open restores, tray Quit exits
- [ ] Launch app twice -> single instance (existing window focused)
- [ ] Widget toggle: always-on-top, draggable, correct prayer, closes
- [ ] Mini Mode: expand returns full window; no duplicate notifications
- [ ] Enable "Start with Windows", reboot Windows -> app auto-starts (tray)
- [ ] Disable "Start with Windows" -> no longer auto-starts
- [ ] Offline: disconnect network -> calculations, Quran, history all still work

## Data lifecycle
- [ ] Uninstall -> app removed, shortcuts removed
- [ ] Reinstall -> previous history/bookmarks/locations/themes still present
- [ ] Upgrade install over existing version -> data intact, no duplicates
`;

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex').toUpperCase();
}

function main() {
  if (!fs.existsSync(exePath)) {
    console.error(`Installer not found: ${exePath}`);
    console.error('Run "npm run package:installer" first.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const dest = path.join(OUT, exeName);
  fs.copyFileSync(exePath, dest);

  const hash = sha256(dest);
  fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'),
    `${hash}  ${exeName}\nAlgorithm: SHA-256\nVersion: ${version}\nBuilt: ${new Date().toISOString()}\n`);
  fs.writeFileSync(path.join(OUT, 'RELEASE-NOTES.txt'), NOTES);
  fs.writeFileSync(path.join(OUT, 'TEST-CHECKLIST.md'), CHECKLIST);

  console.log(`release/ ready`);
  console.log(`  ${exeName}`);
  console.log(`  SHA-256: ${hash.slice(0, 32)}...`);
  console.log(`  SHA256SUMS.txt, RELEASE-NOTES.txt, TEST-CHECKLIST.md`);
}

main();
