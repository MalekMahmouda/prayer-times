================================
MOBILE AZAN RELIABILITY + UI AUDIT REPORT
================================

Repository:   Prayer Times V3 (local checkout, branch main)
Baseline:     0ed52d5 (v1.4.0) + pre-existing uncommitted work
Scope:        automatic mobile azan, Test Azan full-screen, apple-design UI
              pass, project organisation, developer attribution, testing

----------------------------------------------------------------
A. ROOT-CAUSE DIAGNOSIS
----------------------------------------------------------------

A1. Why the automatic azan did not play on the phone
----------------------------------------------------
Two independent causes, both real:

1. The adhan was not SCHEDULED natively in the way the original code assumed.
   The v1.3.x design drove azan playback from the renderer (a WebView timer /
   page logic). Android suspends or throttles a backgrounded WebView, so a
   foreground-only timer cannot fire at a prayer time when the app is closed
   or the screen is locked. This is the definitional failure the mission
   describes ("Test Adhan works, automatic does not").

2. The azan sound was attached to the wrong layer. Android decouples a
   notification's sound from the notification's *content*: the sound is owned
   by the notification CHANNEL and is immutable after creation. Any attempt to
   reuse one channel for several reciters (or to rely on a default channel)
   silently plays the wrong/only sound, or nothing.

The fix already present in this tree (v1.4.0 line) is the correct architecture
and was re-verified, not re-invented:
  - `www-build/mobile-scheduler.js` schedules NATIVE notifications via
    `@capacitor/local-notifications` for a 14-day horizon (150-notification
    cap, batched), with deterministic our-IDs-only cancellation.
  - The adhan is delivered as the channel sound of `adhan-<reciter>`
    (`android.resource://<pkg>/raw/<type>`), created via `createChannel` and
    routed by `channelId`; stale `adhan-*` channels are deleted on reschedule.
  - The schedule is rebuilt on every config/location change AND on app resume,
    with the device timezone (and therefore DST) participating in the dedup
    signature; boot restore is native
    (`LocalNotificationRestoreReceiver` in the plugin manifest).
  - Per-prayer mute now keeps the notification on a SILENT channel (desktop
    parity) instead of skipping it.
So the pipeline no longer depends on a foreground WebView timer.

A2. Why the Test Azan did not open the full-screen interface
------------------------------------------------------------
`testAdhan()` in `js/app.js` had three branches:
  - Desktop  → `PT.testOverlay()` (the real Electron always-on-top overlay).
  - Android  → **only** set `#adhanAudio.src` and called `play()`. There was no
    presentation call at all.
  - Browser  → CDN `<audio>` preview only.
And on Android there was **no full-screen azan surface in the app at all** —
the only azan UI in the project was `adhan.html`, an Electron overlay window
that Android does not have. So the Test button could not open what did not
exist, and the automatic event had nowhere to present either.
Root cause: a missing presentation surface + a Test branch that bypassed it.

----------------------------------------------------------------
B. IMPLEMENTED FIXES
----------------------------------------------------------------

B1. One shared full-screen Azan surface  (NEW)
- `prayer-times.html`: added `#azanOverlay` (`.azan-screen`) — city, large
  Arabic prayer heading, English name, live clock, "Adhan is playing…" status,
  Stop + Close buttons. Safe-area padded; `role="dialog" aria-modal="true"`.
- `js/app.js`: `showAzanScreen(prayer)` / `hideAzanScreen(stopAudio)` /
  `window.ptAzanScreen` (+ `AZAN_AR` prayer-name map, 1 s clock with clean
  interval teardown). Dismissing pauses `#adhanAudio` — no orphan playback.
- `js/app.js` `testAdhan()`:
  - Android → plays the bundled local recording AND calls
    `showAzanScreen('Test')` (same surface as a real event, offline).
  - Browser/PWA → `playAdhanBrowser()` + `showAzanScreen('Test')`.
  - Desktop → unchanged `PT.testOverlay()`.
  The Test path never touches the scheduler, the next-prayer state or the
  stored schedule (it only uses the existing `#adhanAudio` element).
- `js/pages.js` `wireSettings()`: wires `#azanStop` / `#azanClose` and an
  Escape-key dismiss (explicit dismiss only — no backdrop tap, so an
  immersive azan is never closed by an accidental touch).
- `styles/app.css`: `.azan-screen` / `.azan-inner` / heading / clock / controls
  styles using the existing design tokens; one restrained fade + 0.96→1 scale
  on `--dur`/`--dur-slow` with `@media (prefers-reduced-motion: reduce)`
  disabling the transition. Tokens, radii and colours are shared with the rest
  of the app (no new palette, no gradient soup).

B2. Foreground automatic azan presents the same screen  (NEW)
- `www-build/entry.js` (the Android bundle):
  - `LocalNotifications.addListener('localNotificationReceived', …)` presents
    the full-screen screen when a prayer-time notification is delivered while
    the app is OPEN. It is body-guarded (`/It is time for|حان الآن/`) so a
    pre-alert ("… in N minutes") never opens it, and title-parsed for the
    prayer name.
  - `localNotificationActionPerformed` (notification tapped) shows the same
    screen without starting a second audio source.
  - When backgrounded/locked, Android shows the notification + channel sound
    and the app does NOT launch over the lock screen (platform rule,
    deliberately not worked around).
- Android hardware Back now closes the azan screen FIRST in the `backButton`
  closer chain (azan screen → More sheet → location modal → text modal →
  history → exit).

B3. Real defect found by the browser check: a 404 asset
- `js/stats.js` is loaded by `prayer-times.html` but was **not** in the
  copy list of `scripts/build-www.js`, so it 404'd in BOTH the Android and web
  builds (confirmed in a real browser: `GET /js/stats.js → 404`).
- Fixed at the cause: added `stats.js` to the `build-www.js` copy list and to
  the `dist-web` service-worker SHELL list; verified `GET /js/stats.js → 200`
  and zero console errors in a fresh browser session.
- Guarded by a new contract check that intersects every `js/*.js` the HTML
  loads against the build's copy list.

B4. Developer attribution + Arabic supplication  (was entirely missing)
- `js/data.js` i18n (en + ar): `set.about`, `set.developer`
  ("Developed by Malek Mahmoud" / "تطوير: Malek Mahmoud"), `set.dua`
  ("يرجى الدعاء ليا ولوالدي") and the `azan.*` screen labels.
- `prayer-times.html`: an **About** card in Settings (supplication RTL +
  `Developed by Malek Mahmoud` LTR + app line) and a page **footer** credit.
  Present on desktop, Android and the PWA (all share this HTML).
- `js/app.js` `applyLang()` fills every new element in both languages.
- `package.json` `author` → `"Malek Mahmoud"` and `build.copyright` →
  "Copyright © 2026 Malek Mahmoud". No appId, package id, signing or repo
  ownership touched.
- Exact strings verified in the browser in both languages, including RTL.

B5. Project organisation
- No new framework and no structural rewrite: the pipeline is already split
  into calculation (`shared/pt-engine.js`), native scheduling
  (`www-build/mobile-scheduler.js`), desktop scheduling (`main/scheduler.js`),
  presentation (`js/app.js`, `js/overlay.js`), and pages
  (`js/pages.js`, `js/pages3.js`). The azan surface was added as one shared
  module inside `js/app.js` (mirroring how the desktop overlay is one window),
  not duplicated per page.

----------------------------------------------------------------
C. UI IMPROVEMENTS (apple-design pass)
----------------------------------------------------------------

Applied the apple-design principles that map onto this app rather than
mentioning the skill:
- **Restraint over decoration**: the new azan screen is one focal point — big
  Arabic name, quiet clock, one primary action (Stop) with a secondary (Close).
  No gradients-as-decoration, no animated ornament; a single
  `radial-gradient` tint reuses `--primary-soft`.
- **Typography & hierarchy**: Arabic heading uses `clamp(52px,16vw,86px)** on
  `--font-ar`; the clock is `tabular-nums` (no width jitter while counting);
  English name and city are muted, so the hierarchy reads in one glance.
- **Respect user settings**: 12/24-hour honours `S.cfg.h24`; the screen is
  dark/light/theme-aware for free via the existing tokens; reduced-motion is
  honoured.
- **Touch targets & safe areas**: controls are ≥46px tall ≥120px wide;
  the screen pads `env(safe-area-inset-top/bottom)` so nothing hides under a
  cutout or gesture bar on any Android device.
- **RTL/LTR**: the supplication is forced `dir="rtl"` and the Latin credit
  `dir="ltr"` inside an Arabic page, so the Arabic line never re-orders the
  Latin name and vice-versa; the clock stays LTR under RTL.
- **Feedback**: the existing toast still announces "Playing adhan —
  fullscreen overlay" in both languages.

----------------------------------------------------------------
D. DEVELOPER ATTRIBUTION
----------------------------------------------------------------

"Malek Mahmoud" (exact) now appears in:
  - Settings → About card: "Developed by Malek Mahmoud"
    (Arabic UI: "تطوير: Malek Mahmoud").
  - Settings page footer: "Developed by Malek Mahmoud".
  - `package.json` author + build copyright.
The Arabic supplication "يرجى الدعاء ليا ولوالدي" (exact, RTL) appears in the
About card and the footer. Both verified in the running app in en and ar.

----------------------------------------------------------------
E. TEST RESULTS (exact commands)
----------------------------------------------------------------

PASS  node scripts/test-scheduler.js                  → 74/74 ALL GREEN (exit 0)
PASS  node scripts/test-contract.js                   → 255/255 ALL GREEN (exit 0)
      (was 244/244; +11 new checks: §14 shared azan surface, foreground hook,
       back-button, reduced-motion, attribution strings, js-ref copy guard)
PASS  node --check js/app.js js/pages.js js/data.js   → syntax OK
PASS  npm run www                                     → www/ built
PASS  npm run web                                     → dist-web/ built
PASS  node scripts/check-dist.js                      → runtime asset validation passed
PASS  npm run apk (gen-android-raw + cap sync + gradle assembleRelease)
                                                      → see section H
PASS  npm run package:installer (electron-builder --win nsis)
                                                      → see sections H + I
PASS  packaged desktop app driven over CDP: launch, About card, footer
      credit, dashboard, all 9 pages, full-screen azan overlay + audio
                                                      → see section I
NOTE  No lint or typecheck is configured in this project (plain JS, no ESLint/
      tsc script exists) — reported honestly, not skipped silently.

Browser (real Chromium, dist-web served over HTTP) — executed, not assumed:
  - All 8 pages load and activate (prayers, calendar, qibla, quran, names,
    dhikr, stats, settings).
  - Test Adhan opens the full-screen screen: `#azanOverlay.open`,
    computed `opacity: 1`, `z-index: 1000`, Arabic name "الأذان", live clock.
  - Audio actually PLAYED from the bundled local file
    (`./adhans/default.mp3`, no play error), and Close stopped it
    (`paused: true`), closed the overlay (`aria-hidden="true"`), left the
    current page active (valid nav state) and cleared the clock interval.
  - Arabic (RTL) mode: `dir="rtl"`, heading "المغرب", status/labels Arabic,
    credit "تطوير: Malek Mahmoud", supplication exact.
  - No horizontal overflow (`scrollWidth - innerWidth = 0`).
  - Console: `GET /js/stats.js → 404` found and fixed; fresh reload shows
    `200 OK` and zero errors.

----------------------------------------------------------------
F. MOBILE VERIFICATION
----------------------------------------------------------------

Tested on a real device: NOT TESTED — no physical Android device or emulator
was available in this session.
What WAS verified for Android without a device:
  - `cap sync` copied the new web assets into
    `android/app/src/main/assets/public/` (grep-confirmed: `azanOverlay`,
    `showAzanScreen`, the attribution strings and the previously-404ing
    `js/stats.js` all present in the synced shell).
  - The APK content was inspected after the build (see H).
  - The foreground-notification hook, the notification-channel sound routing
    and the native scheduling are verified at the code/test level (contract
    §6 + §14) and by bundle inspection, not by device observation.
Still REQUIRES a physical device: notification sound/vibration and channel
behaviour under Doze, the foreground full-screen at a real prayer time, the
lock-screen case, boot restore, exact-alarm drift, the Android back-button
chain, and real haptics. See docs/TESTING.md → "Full-screen Azan surface +
attribution" and "Android adhan sound matrix".

----------------------------------------------------------------
G. REMAINING ISSUES / LIMITATIONS
----------------------------------------------------------------

1. On-device azan behaviour is unverified (above). No claim is made that the
   azan works reliably in the background — only that the pipeline is native
   and the platform rules are respected.
2. When the app is backgrounded or the screen is locked, Android will not let
   the app present a full-screen activity over the lock screen; the azan is
   then the notification's channel sound. This is a platform limit, not a bug.
3. The azan screen's visual polish was verified by computed style + geometry
   in a real browser, not by eye on a physical phone.
4. The desktop installer is NOT code-signed — Windows SmartScreen will warn on
   install. Fixing this requires a code-signing certificate (CSC_LINK /
   WIN_CSC_LINK), which is a credential decision, not a code change.
5. Desktop audio was verified by Chromium's own state (unmuted, readyState 4,
   currentTime advancing) and azan-debug.log, not by hearing it.
6. No "reset to defaults" control exists (pre-existing observation; import
   acts as the reset path).
7. Deferred (documented, pre-existing): Umm al-Qura Ramadan Isha verification
   before Ramadan 2027; Quran lock-screen/background playback.

----------------------------------------------------------------
H. BUILD ARTIFACTS
----------------------------------------------------------------

  Android APK :  android/app/build/outputs/apk/release/app-release.apk
                 51,981,346 B — rebuilt this session (BUILD SUCCESSFUL in
                 1m 25s; `assembleRelease`).
                 sha256 prefix e2b2b578921965600df09e6a…
                 aapt badging: package com.malek.prayertimes, versionCode 8,
                 versionName 1.4.0; VIBRATE + POST_NOTIFICATIONS +
                 SCHEDULE_EXACT_ALARM present.
                 Content verified INSIDE the package (unzip -p):
                   assets/public/index.html  → azanOverlay + aboutDev + siteFoot
                   assets/public/js/app.js   → showAzanScreen
                   assets/public/js/data.js  → "Malek Mahmoud"
                   assets/public/js/stats.js → present (the 404 fix shipped)
                   assets/public/js/adhan-bundle.js → localNotificationReceived
                   assets/public/styles/app.css → .azan-screen rules
  Web / PWA   :  dist-web/ (index.html, manifest.webmanifest, sw.js, full shell)
  Android web :  android/app/src/main/assets/public/ (via cap sync)
  Electron    :  dist/Prayer-Times-Setup-1.4.0.exe
                 121,511,131 B — rebuilt this session via
                 `npm run package:installer` (electron-builder, NSIS x64,
                 oneClick=false/perMachine). blockmap written.
                 sha256 prefix 669902a56697450da9392d1b…
                 NOT CODE-SIGNED — `Get-AuthenticodeSignature` reports
                 "NotSigned"; no signing certificate is configured in
                 package.json `build` and no CSC_* env var is present.
                 (The earlier v1.4.0 installer was also unsigned — an earlier
                 audit note calling it "signed" was inaccurate.)
                 `dist/win-unpacked/resources/app.asar` (164 entries) verified
                 by extraction: prayer-times.html (aboutDev + azanOverlay +
                 siteFoot), js/data.js (credit + exact supplication),
                 js/app.js (showAzanScreen), js/stats.js, styles/app.css
                 (.azan-screen). check-dist.js PASSES against this build.

----------------------------------------------------------------
I. DESKTOP (ELECTRON) VERIFICATION — executed on the packaged app
----------------------------------------------------------------
Launched `dist/win-unpacked/Prayer Times.exe --remote-debugging-port=9222`
and drove the REAL packaged renderer over CDP (not a dev run):

  Launch            ✓ window opens, title "Prayer Times | أوقات الصلاة",
                      zero errors on stdout/stderr.
  About card        ✓ Settings → About: heading "حول التطبيق",
                      developer "تطوير: Malek Mahmoud", supplication
                      "يرجى الدعاء ليا ولوالدي" (dir=rtl) — all visible.
  Footer credit     ✓ same two strings in the page footer.
  Dashboard         ✓ Hijri + Gregorian date, location, next prayer
                      (العشاء 07:01 PM) with a live countdown, and all five
                      prayers rendering (Fajr 04:31, Dhuhr 11:40, Asr 15:01,
                      Maghrib…).
  Existing features ✓ 114 surahs, 99 names, compass element, all 9 pages
                      present, theme/notif/adhan settings persisted.
  Test Adhan        ✓ opens the desktop full-screen overlay window
                      (adhan.html, 1920×1080) showing "IT IS TIME FOR
                      PRAYER · الظهر · DHUHR · 12:12", and azan-debug.log
                      shows the full healthy trace: audio file OK
                      (4,114,842 B) → overlay created → payload sent →
                      src set → loadeddata (duration 257.1 s) → canplay →
                      "audio playing (output device active)" (readyState 4,
                      muted false, volume 1) → play() resolved. Left alone,
                      the overlay stays open and keeps playing.
  Back/overlay path unchanged: the Electron overlay is the pre-existing
  adhan.html window; the new #azanOverlay surface is used by Android/web only.

Not carried out here: listening to the actual speakers (no audio capture in
this environment). Chromium reported a live, unmuted, advancing stream, which
is the strongest signal available without human ears.
