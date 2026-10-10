================================
FULL CODE AUDIT REPORT
================================

Repository:            Prayer Times V3 (local checkout) — Electron Windows + Android APK + web PWA
Commit before:         0ed52d5  (tag v1.4.0 — tree clean except known untracked dirs)
Commit after:          uncommitted — no commit was requested; full change set shown in `git diff` / `git status`
                       (modified: android manifest, js/compass.js, js/data.js, js/pages.js, js/store3.js,
                       js/app.js, prayer-times.html, scripts/test-contract.js, styles/app.css,
                       docs/TESTING.md; added: docs/AUDIT-REPORT.md)

BUILD
✓ Web        `npm run www` → www/ built (439 ms); `node scripts/build-web.js` → dist-web/ built
             (sw.js SHELL includes pt-engine.js + compass.js; needle + i18n verified in bundle)
✓ Electron   `npx electron-builder --win nsis` → dist/Prayer-Times-Setup-1.4.0.exe
             121,509,574 B, signed, blockmap written (NOTE: first attempt failed in the 7-Zip
             compression step with a transient "Insufficient system resources" system error;
             immediate serial retry succeeded — installer was never partial, retry verified)
✓ Android    `node scripts/gen-android-raw.js && npx cap sync android && node scripts/apk-gradle.js
             assembleRelease` → BUILD SUCCESSFUL (6m57s cold + 1m46s incremental rebuild so the
             final HTML fix ships) → app-release.apk 51,978,759 B (sha256 f8246d4736793263…);
             aapt badging: com.malek.prayertimes versionCode 8 / 1.4.0, VIBRATE present,
             dir="ltr" fix verified inside the APK (unzip -p)

TESTS
✓ Unit tests              node scripts/test-scheduler.js → 74/74 ALL GREEN (exit 0)
✓ Integration tests       node scripts/test-contract.js  → 244/244 ALL GREEN (exit 0)
                           (baseline was 205; +39 new checks; fresh-clone ≈ 239 without dist/)
✓ Qibla tests             §1 golden bearing matrix (7 cities), §1b spec sweep (Riyadh 243.8776°,
                           Makkah-city 318.5409°, Cairo 136.1373°, London 118.9872°, New York 58.4817°,
                           all 0 ≤ b < 360; at the Kaaba itself → exactly 0, never NaN),
                           §12 needle geometry + alignment-math wraparound, §6k behavioral suite
✓ Lifecycle tests         §6i (start→1 listener, stop→0, remount→exactly one, late iOS permission
                           grant wires nothing), §6i2 validation/rotation, §6k remount disarms haptic
✓ Prayer tests            scheduler suite: 5 prayers fire once, notifMin=0, sleep/resume recovery
                           (15-min cap boundaries), midnight rollover, next-prayer advance,
                           adhan dedup + skip-reason logging, tz-correct payloads, DST pairs
✓ Settings tests          notifMin=0 (never falsy), volume clamp 0..1, atomic json-store writes,
                           store3 validate-on-load/save/import, §13 streak persistence semantics
✓ Packaging               node scripts/check-dist.js → PASS (37/37 required asar files, 6 adhan
                           mp3s, fonts, quran.json, www shell, android shell)
Lint                       none configured in this project (no lint script exists — reported honestly)
Type checking             none configured (plain-JS project; `node --check` executed on every
                           edited JS file — all pass)

BUGS FOUND

P0: (none)

P1: (none)

P2:
- [pages.js showCalDay] async race: a slow `Plat.getDay` for a previously clicked calendar day
  could resolve AFTER a newer day was selected and overwrite the day panel with stale times
  (classic stale-response write; also fired after calNav hid the panel).
- [store3.js streaks] longest-streak computed with exact `86400000 ms` diffs between local-noon
  dates — across a DST spring-forward/fall-back the gap is 23 h/25 h, so a valid consecutive
  streak RESET at the first DST boundary of the run.

P3:
- [app.js makkahFallback] first-run fallback location (Makkah) was announced only by the location
  chip — no toast explaining the app had chosen a default city for you.
- [prayer-times.html #setCoords] Settings coordinates lacked the `dir="ltr"` that the v1.4.0 fix
  already gave the Qibla page's #coordsDisp — same `24.7555°N, 46.7804°E` content under RTL.
- [app.js pushCfg] dead local `actLoc` (declared, never used) — removed.
- [docs/TESTING.md] regression-command counts stale (said 205/205; map-rose section still
  described the deleted rim 🕋 marker) — updated to 244/244 + needle wording.
- [packaging informational] asar entry total 164 vs baseline 166 (all 37 REQUIRED files present,
  adhan+tz-lookup bundled; the delta is in non-required packaging entries — no runtime impact,
  not root-caused).

FIXES IMPLEMENTED

1. QIBLA NEEDLE (Phase 6): removed the rotating-ring Kaaba 🕋 marker; added one centered needle
   (`#qNeedle`, sibling of the rotating rose inside `.compass`) whose screen angle = bearing −
   heading, tracked as an UNWRAPPED angle advanced by the shortest-path delta — smooth motion,
   no jitter, no long-way spin across 0°/360°. Static render (no sensor) rests the needle at the
   bare bearing, north-up. No Riyadh value is hard-coded anywhere in production code.
2. ALIGNMENT ±2°: `ALIGNED_TOL = 2` with the existing signed shortest angular difference
   (359↔1 wraparound inclusive); status line shows a new "Aligned" message while inside the window.
3. HAPTIC: one `navigator.vibrate(80)` on ENTERING the aligned state only; re-armed by leaving it
   and by every page visit; guarded try/catch + typeof check (desktop/iOS silently no-op).
   AndroidManifest.xml gained the missing `android.permission.VIBRATE` (without it the WebView
   vibration API silently does nothing on Android).
4. CONTRACT §12 REWRITTEN (not weakened): asserts the rim marker is GONE (no `kaabaMark` anywhere),
   the needle is driven in both live and static paths, tolerance is exactly 2, the haptic is
   guarded, VIBRATE is declared; numeric needle-geometry + shortest-difference checks replace the
   old rim-marker geometry checks.
5. NEW TESTS: §1b bearing spec sweep (5 cities + range + at-Kaaba degenerate case), §6k
   behavioral alignment/haptic suite (16 checks incl. wraparound at exactly 0°, ±2 boundary
   inclusive/2.5 exclusive, no-vibrate device, remount re-arm, needle DOM transform congruence),
   §13 DST-safe streak behavior + stale-calendar-response guard + honest-fallback assertion.
   The §6 sandbox dummy now records `style.transform` writes so the live needle DOM output is
   assertable.
6. P2 RACE FIX: monotonic `calDaySeq` in showCalDay — stale async responses return without writing.
7. P2 DST FIX: streaks compare consecutive CALENDAR day keys (setDate +1 → localDateKey) instead
   of exact-ms diffs.
8. HONESTY/UX P3s: Makkah default-location toast (en+ar i18n), `dir="ltr"` on #setCoords,
   dead variable removed, TESTING.md rewritten for the needle (device checks now include
   "exactly ONE vibration per alignment entry") and counts bumped.
9. i18n lockstep: `qibla.live` / `qibla.howText` rewritten for the needle (en+ar) — no remaining
   user-facing text references the removed 🕋 marker.

QIBLA
- Riyadh expected: ~244°
- Actual:          243.8776° at the spec coordinates (24.7555, 46.7804); golden-matrix Riyadh
                    243.8° ±0.05; bearing through the live compass layer ≈ 244° (contract P8)
- Range:           0 ≤ bearing < 360 proven for Riyadh/Makkah/Cairo/London/New York + exactly 0
                    from a due-south point + exactly 0 at the Kaaba (never NaN/Infinity)
- Alignment:       ±2° with shortest angular difference — boundary |turn|=2 aligned, 2.5 not;
                    359↔0 and 0↔359 wraparound proven behaviorally (heading 359 vs bearing 0 → turn +1)
- Haptic:          enter→exactly 1 vibration; remain (±1.5° drift)→no repeat; leave→re-armed;
                    re-enter→2nd; missing navigator.vibrate→alignment still works, no crash;
                    remount→fresh arm→one more. (Simulated-vibration harness — real-device feel NOT TESTED)
- Sensor lifecycle: exactly one listener per visit, zero accumulation across 3 cycles, late iOS
                    permission grant after stop wires nothing (pre-existing, still green)
- Physical device: NOT TESTED — requires physical Android device (real magnetometer, real haptic)

PRAYER TIMES
- Golden matrix frozen 2026-09-29: 7 locations × 6 times × 2 madhabs identical to frozen values
- Desktop scheduler == shared engine parity (shafi+hanafi), location-tz day boundaries,
  DST spring/fall pairs, midnight rollover, next-prayer advance within the tick, 15-min recovery
  cap boundaries (10 min fires, exactly 15 fires, 15 min + 1 s does not), adhan dedup keys,
  per-prayer mute keeps the notification, notifMin=0 semantics — all executed and green
- Countdown/timezone display: `fmtInTz` payloads, `msToNextLocationMidnight` (±2 s) green

AUDIO
- Overlay pipeline reviewed end-to-end: main resolves bundled file (asar-unpacked aware) →
  payload boundary logged → overlay page plays with configured volume, unmuted, sink rebind on
  device change, 6-min force-close, error/ended/pause boundaries logged to azan-debug.log
- Quran player is a deliberate GLOBAL player (controls persist across pages) — audio continuing
  after leaving the Quran page is by design with visible controls, not a leak
- Reciter fallback (one retry to Alafasy), autoplay-rejection handling, output-device rebind
  (qrAudio + overlay) reviewed — no unhandled paths found
- Playback itself: NOT TESTED — requires live audio output device (Test Adhan is user-run per TESTING.md)

LOCATION
- GPS granted/denied/unavailable/timeout/low-accuracy tiers reviewed; denied vs unavailable
  toasts distinguished (err.code===1); poor accuracy keeps the previous location with a warning
- Reverse geocoding is single-flight per coordinate (behaviorally proven), never cross-binds
- No silent Riyadh fallback anywhere; the first-run Makkah default now announces itself via toast
- Live permission prompts: NOT TESTED — requires live GPS permission

ANDROID
- Manifest: INTERNET, COARSE+FINE location (GPS button only), NEW VIBRATE (alignment haptic);
  allowBackup=false; configChanges handles rotation without recreation
- Back-button chain (More sheet → location modal → text modal → history → exit) reviewed ✓
- Mobile scheduler: 14-day horizon, 150 cap, deterministic our-IDs-only cancellation, per-reciter
  adhan channels with stale-channel cleanup, mute → silent channel (never skipped), exact-alarm
  status + one-tap grant, resume rescheduling, signature dedup including tz/DST — all reviewed
- APK: built via gen-android-raw + cap sync + apk-gradle assembleRelease → BUILD SUCCESSFUL
  (6m57s cold + 1m46s incremental rebuild so the final HTML fix ships in the web assets) →
  app-release.apk 51,978,759 B (sha256 prefix f8246d4736793263); aapt d badging verified:
  package com.malek.prayertimes, versionCode 8, versionName 1.4.0, and
  `android.permission.VIBRATE` PRESENT in the shipped binary (plus INTERNET, COARSE+FINE
  location, POST_NOTIFICATIONS, SCHEDULE_EXACT_ALARM, WAKE_LOCK, RECEIVE_BOOT_COMPLETED);
  `unzip -p <apk> assets/public/index.html` confirms the dir="ltr" fix is inside the package
- On-device matrix (channels, Doze, exact alarms, rotation, haptics): NOT TESTED — requires physical Android device

ELECTRON
- Every IPC channel traced renderer → preload → main with matching contracts: pt:update-config,
  set-close-to-tray, set-start-with-windows, set-overlay-enabled, test-alert, test-overlay,
  get-info, get-version, get-day, debug, set-theme, widget/mini toggle+expand+get-theme,
  overlay:dismiss/debug, navigate/info events — no unmatched channel, no unvalidated passthrough
- Preload surface is minimal (no require, no tz-lookup), contextIsolation+sandbox on all four
  window types, nodeIntegration false, VALID_PAGES whitelist on navigation
- single-instance lock, AppUserModelId match, close-to-tray vs window-all-closed consistency,
  --hidden gating, tray update loop (30 s menu rebuilds — harmless), atomic settings store,
  capped forensic log — reviewed ✓

RTL
- CSS uses 0 physical left/right properties (21 logical-property usages) — clean
- Coordinates forced LTR on BOTH surfaces now (#coordsDisp + #setCoords); top-bar truncation
  from the end (v1.4.0) unchanged; Arabic blocks carry dir="rtl" in templates
- i18n needle strings updated in ar as well (aligned/live/howText + Makkah toast)
- Full visual Arabic pass (clipping/alignment across all modals): NOT TESTED — requires GUI run
  on device/preview

PERFORMANCE
- Sensor render throttled to ~10 fps with 1 s watchdog; needle CSS transition .18 s (no rAF storm)
- Countdown 1 s tick with 30 s dashboard re-render; schedule fetch hourly; midnight timer reschedules
- Listener balance audited: compass add/remove 1:1 (tested), all other listeners are one-time
  init wiring (load/DOMContentLoaded/online/offline) — no navigation-time accumulation
- json-store/debug-log size-capped; no unbounded structures found

SECURITY
- Full-repo credential grep (password|token|secret|api_key|apikey|cookie|session|private_key):
  no credentials; only design-token identifiers, the documented gitignored keystore properties,
  and an attribution doc hit
- CSP on all three documents verified by tests (every host token scheme-prefixed; media-src
  covers the two Quran streaming hosts; adhan overlay allows self/file/https CDN only)
- No API keys in repo (AlAdhan + Nominatim used keyless, endpoints HTTPS); localStorage holds
  preferences only; allowBackup=false; logs carry coordinates/prayer times only (user's own data)

REMAINING ISSUES
- Physical Android device matrix: NOT TESTED — requires physical Android device
- Live GPS permission flows: NOT TESTED — requires live GPS permission
- Live audio playback: NOT TESTED — requires live audio output device
- Visual RTL/responsive spot checks across 360×800…1920×1080: NOT executed in this session
  (static/CSS analysis only) — recommended as a quick manual pass in TESTING.md
- asar entry total 164 vs 166 baseline (informational; required-file contract green)
- No settings "reset to defaults" control exists (defaults load on fresh install; backup-import
  acts as the reset path) — observation only, not a defect
- Deferred from v1.4.0 (documented): Umm al-Qura Ramadan Isha verification before Ramadan 2027;
  Quran lock-screen/background playback

COMMANDS EXECUTED
- git log/status (baseline: 0ed52d5, clean tree; end: diff shown below)
- node scripts/test-scheduler.js                → 74/74   (run twice: baseline + post-fix)
- node scripts/test-contract.js                 → 244/244 (baseline 205; run 4× through the work)
- node scripts/check-dist.js                    → PASS (after each asar rebuild)
- node --check js/compass.js js/pages.js js/data.js js/app.js js/store3.js scripts/test-contract.js
- npm run www                                   → built
- node scripts/build-web.js                     → dist-web built
- npx electron-builder --win nsis               → built (1st attempt: 7-Zip transient resource
  error, no artifact produced; 2nd attempt: exit 0, signed installer + blockmap)
- npx asar list dist/win-unpacked/resources/app.asar > tmp/asar-list.txt   (run twice)
- node scripts/gen-android-raw.js && npx cap sync android && node scripts/apk-gradle.js assembleRelease
- C:/Users/malek/.pt-android/android-sdk/build-tools/35.0.0/aapt.exe d badging (APK verify)
- Full `git diff` captured verbatim: docs/AUDIT-DIFF.txt (583 lines)
- Repository-wide greps: credentials sweep, listener/timer balance, JSON.parse guarding,
  id-reference ↔ HTML cross-check (111 app.js ids + 86 pages.js ids all resolve)

FINAL STATUS
PASS WITH WARNINGS
(gates: 74/74 + 244/244 + check-dist green; web/electron/android builds executed; warnings =
the hardware/permission/live-service items explicitly marked NOT TESTED above, plus one
transient electron-builder resource error that succeeded on immediate retry)
