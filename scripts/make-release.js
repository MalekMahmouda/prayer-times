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
This is a legibility and design-consistency pass driven by an expert visual
review of the RENDERED app (42 screenshots, 8 themes, EN/AR) rather than by
measured styles alone. Full report: docs/DESIGN-REVIEW.md.

Readability
- FIXED: the hero countdown was invisible in all five LIGHT themes (~1.4:1 —
  white digits inherited onto a near-white glass chip). It now takes its ink
  from the theme's text colour and is legible in every theme.
- FIXED: the gold accent failed AA as small text on a light surface (islamic
  measured 3.20:1). A new --gold-ink token, defined in all eight themes, is
  now used for text on surfaces; --gold stays for on-gradient accents.
- Past prayer cards were dimmed to 42%; now 58% (90% on hover), so their
  times stay readable.

Consistency
- FIXED: the dashboard icon row used six unrelated emoji styles, two of them
  illegible at 21px. One 23-glyph stroke icon set now covers the dashboard
  AND the whole navigation frame (sidebar, bottom nav, More sheet, topbar).

Mobile
- FIXED: a phone's first paint was an empty screen — mobile mode was derived
  only on a resize event. It is now derived from the viewport at boot.
- FIXED: the mobile home's next-prayer name, its time and the prayer strip
  were painted only every 30th countdown tick, so a phone showed a live
  countdown under an unnamed prayer for up to half a minute. They now paint
  as soon as data arrives and on navigation to the page.
- A dedicated mobile home: gradient hero, live countdown, scrollable prayer
  strip, and a five-tab bottom bar with a More sheet.

Housekeeping
- The hero decoration is a soft bloom rather than a hard-edged 320px disc.
- 20 new contract guards pin every fix above so it cannot silently return.

Known limitations (documented, unchanged)
- No physical-device or screen-reader verification: touch targets and page
  heading semantics remain declaration / DOM-inspected only.
- Content-level emoji remain (settings card headers, the Quran tab strip,
  in-button glyphs, toast prefixes).
- Two of the eight themes (blue, emerald) were measured programmatically,
  not screenshotted — they are structural near-duplicates.

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
