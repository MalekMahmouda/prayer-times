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
- Fixed "today" following the active location's timezone on every platform —
  dashboard, calendar and scheduler day boundaries no longer shift when the
  device lives in a different timezone than the prayer location
- Fixed per-prayer minute adjustments being applied twice on the dashboard
  and mini-home prayer cards (display now formats the engine instant once)
- Fixed the location-midnight refresh timer (up to 7–30 h off for far
  timezones) — now exact and DST-safe in the location's timezone
- Fixed Ramadan fasting/iftar countdown comparing device time against the
  location's prayer times
- Fixed a Qibla compass listener leak when visiting the page repeatedly
- Fixed concurrent reverse-geocode requests for different coordinates
  interfering with each other

Data & Privacy
--------------
All personal data (settings, history, bookmarks, locations, themes, dhikr
progress) is stored locally under %APPDATA%\\Prayer Times. Nothing is sent
anywhere. Uninstalling keeps your data; use Settings > Data Management to
export or import a backup at any time.

Notes
-----
- The Windows installer is code-signed. On machines that do not yet trust
  the certificate, Windows SmartScreen may still show a warning on first
  run; choose "More info" > "Run anyway" if you trust this build.
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
