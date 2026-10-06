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
This release is a full hardening pass driven by an external code review —
24 findings fixed, two deferred with notes (see docs/BUG-AUDIT.md, section
"v1.4.0 — REVIEW.docx fix pass").

Qibla
- FIXED the Kaaba marker landing 90° clockwise on the map rose (it moved
  along the rotated x-axis instead of the up axis, so facing the Qibla put
  the marker at 3 o'clock). Live compass AND the static desktop map.
- Compass debug readout is now opt-in (localStorage.ptCompassDebug=1)

Prayer times & alerts (desktop)
- The tray, widget and mini mode now ADVANCE to the next prayer the moment
  one passes (previously they kept showing the passed prayer until midnight)
- Prayer notifications show the time in your LOCATION's timezone, not the
  device's (New York device + Riyadh location now says 04:29, not 21:29)
- Waking from sleep no longer replays stale adhans: a prayer missed by more
  than 15 minutes sends the notification only
- Timezone detection for GPS/manual locations fixed (resolved in the main
  process — the sandboxed renderer could never do it)
- Windows toasts now group under the app correctly (AppUserModelId match)
- Tray left-click no longer wipes the prayer list from its menu
- Settings survive a crash mid-write (atomic write + rename)
- Auto-start with Windows never flashes the window

Android
- The azan now PLAYS: prayer-time notifications carry the chosen bundled
  adhan recording (new per-reciter notification channels, works offline).
  Per-prayer "off" = a silent notification (the alert still arrives).
- Notifications now cover 14 days ahead instead of 7
- "Enable exact alarms" button when Android shows them off
- Test Adhan plays the bundled recording offline (no CDN needed)
- Hardware Back closes sheets/modals before exiting the app
- Privacy: app data excluded from Google backups (allowBackup=false)

Web / PWA
- Offline install now includes the calculation engine + compass (full
  offline after the first visit, as documented)

Housekeeping
- ISC LICENSE + in-app credits (Quran text: Tanzil, translation: Saheeh
  International, adhan recordings courtesy of AlAdhan.com)
- Runtime dependencies slimmed (installer size), electron pinned to an
  exact version, npm test script + GitHub Actions CI
- Android release builds fail loudly if the signing keystore is missing

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
