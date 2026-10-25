# SalahNest — Release Readiness

## Bottom line

The published site and source are **not ready for a new Google Play or Windows release yet**. The current source is version **1.6.4** (Android `versionCode 12`); this audit did not change the version, publish anything, create a tag, or upload a file. The live Pages site remains `https://malekmahmouda.github.io/prayer-times/` at Pages commit `c45f29d00ee139f952fa05867e138c72eba509c8`; its source baseline is `e8d649563f2dfa5cee859ae923aa944c5ea81987`.

The owner approved **SalahNest** as the visible product name for this unpublished candidate.

A local-only candidate branch, `candidate/release-audit-2026-10-25`, contains the fixes below. Its generated web outputs are `dist-web/` (Pages/PWA) and `www/` (Android/Capacitor web shell). Neither has been pushed to GitHub Pages.

## What the candidate fixes

- Fills Arabic translation gaps for the theme label and Asr-school options, and gives icon-only controls localized accessible names.
- Makes calendar dates, Dhikr counting, Quran verses/search results/bookmarks keyboard-operable; adds focus trapping/restoration for the full-screen Adhan dialog.
- Removes residual transitions when reduced motion is requested.
- Applies a saved Arabic preference before styles load, avoiding an initial English/LTR render on reload.
- Uses the selected location’s calendar date for the AlAdhan API fallback when a timezone is known, including an `Intl` fallback if the local calculation engine is unavailable. If no location timezone can be resolved, the app still has to fall back to the device date.
- Adds regression tests and CI steps for the generated web shells, alerts, accessibility, and location-date behavior; corrects stale 1.5.0 documentation to 1.6.4.
- Applies the approved **SalahNest** name to the website/PWA, Android app labels, desktop installer/tray, widgets, and notifications, while preserving the existing app IDs, URLs, and data folder.

## What passed

- Automated suites: **74** scheduler, **298** calculation/contract, **7** motion, **46** alert/notification, **8** UI-accessibility, and **3** location-date checks all pass.
- Branding tests: **9** source-level checks and **4** generated Pages/PWA/Android-shell checks pass, including the Capacitor native asset copy.
- `npm audit --omit=dev` reports **zero production dependency vulnerabilities**.
- `npm run web` successfully builds both `dist-web/` and `www/`; every PWA precache entry exists.
- Chromium on desktop and a 390px phone-width viewport passed the tested English/Arabic controls, calendar and Dhikr keyboard actions, Quran interaction, Adhan focus handling, reduced motion, and RTL overflow checks; no browser errors were observed.
- The live Pages site’s service worker controlled the app, had a versioned shell cache, and reloaded the app successfully while offline in an isolated browser profile.
- A separate startup check confirmed saved Arabic sets `lang="ar"` and `dir="rtl"` before the CSS and main app script load.

These are source and simulated-browser checks—not a physical-device or end-to-end store certification. The test sweep exercises key controls, not every possible screen reader, handset, Android OEM, or Windows configuration.

## Remaining blockers and limits

### Website / PWA

- The app shell works offline after its first successful cache install; the first visit itself still needs a network connection.
- The service worker installs a new version and claims clients, but there is no update notice or foreground auto-reload. An already-open tab can keep running old JavaScript until it is refreshed; the worker may already be serving new cached files. Treat this as a reload-required update, not a seamless in-app updater.
- Browser prayer alerts are foreground-only and can stop when the page is closed or locked; browser notification sounds are silent, and Adhan playback depends on browser audio/autoplay permission. The settings UI discloses these limits.

### Location, timezone, and Adhan

- GPS accuracy/denial, live AlAdhan/Nominatim geocoding, timezone lookup on a real device, and behavior across travel/DST were not tested on hardware or against a live location session.
- Android scheduling code is present, including notification and exact-alarm permission flows, but Android 12+ exact alarms, Doze/battery restrictions, OEM process killing, reboot restore, lock-screen audio, and notification-channel settings need real-device testing.
- A potential startup race remains unconfirmed: native scheduling can receive an early configuration before the mobile bundle/timezone helper is ready; the later configuration push is intended to correct it. Verify on a phone with device and prayer-location timezones different.
- The `npm run apk` script generates Android raw Adhan resources before Gradle. A direct Gradle build from a clean tree may omit those generated resources.

### Google Play

- Source configuration already targets API 36; this meets Google Play’s stated requirement for new apps and updates from August 31, 2026 ([target API policy](https://developer.android.com/google/play/requirements/target-sdk)).
- The project currently has an APK build script, but no documented/repeatable signed AAB release path or AAB artifact. New Play apps must use an Android App Bundle ([official AAB guide](https://developer.android.com/guide/app-bundle)).
- The required private signing keystore/configuration is absent from this checkout, and Android SDK/Gradle/apksigner/adb are unavailable in this environment. No candidate APK or AAB was built or signed. Never create a replacement key for an existing published app.
- No in-app/store privacy-policy URL was found. Before review, complete the privacy-policy and app-content declarations, location/permission disclosures, target-audience/content rating, and listing assets/localizations ([Google Play review checklist](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en)).
- No Play Console listing, signed bundle, merged-manifest check, testing track, or store review was completed.

### Windows

- The repository config can build a Windows x64 NSIS installer, but no installer was built from this candidate and there is no Windows packaging/signing CI job.
- The installer has no configured code-signing certificate and source release notes identify the public installer as unsigned. That creates SmartScreen trust friction; Microsoft recommends a signed installer or Store MSIX for public distribution ([Windows signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)).
- No Windows install/upgrade/uninstall/data-retention, tray, startup, notification, or clean-machine Defender/SmartScreen test was possible here.
- There is no Electron auto-updater configured. New installer releases would require a manual download/install unless an update mechanism or Store distribution is chosen.

## Existing files that are not release outputs

Two already-staged files exist outside the candidate repository: `/workspace/Prayer-Times-1.6.4.apk` (SHA-256 `10aab42136477125e1162ba04fea9d928bc31f7c09bac8102005c65aa4498808`) and `/workspace/Prayer-Times-Setup-1.6.4.exe` (SHA-256 `b50db5c51fd4727df79a47c667030c21d273142b2d4dfae5aa0fa7316b05b580`). They are **not** candidate releases: the APK’s packaged `js/app.js` and `js/pages.js` differ from the audited candidate, and its signature could not be independently verified because `apksigner` is unavailable. The EXE’s Authenticode signature and exact source provenance could not be checked here. Do not upload either as the current audit build.

## Approved product name: SalahNest

“Prayer Times” is already used by multiple products: [Google Play: Islamic Prayer Times & Tracker](https://play.google.com/store/apps/details?id=whizpool.salahalarm&hl=en_US), [App Store: Prayer times!](https://apps.apple.com/us/app/prayer-times/id563334488), and [App Store: Prayer Times – Qibla & Salah](https://apps.apple.com/us/app/prayer-times-qibla-salah/id430204572). Exact-name searches previously found no “SalahNest” app title or GitHub repository; this is not trademark or legal clearance.

The candidate now uses SalahNest in app titles, PWA metadata, installer labels, Android launcher labels, widgets, tray labels, and test notifications. The Android ID (`com.malek.prayertimes`), npm package name (`prayertimes`), repository slug, existing site/release URLs, and stored-data folder (`%APPDATA%\\Prayer Times`) are unchanged. Electron is explicitly pinned to the legacy user-data folder so the new `productName` cannot move existing settings.

## Publish checklist

- [x] Preserve current release version `1.6.4` / Android `versionCode 12`; no tag, push, release, or upload performed.
- [x] Build and test the isolated web/Android-shell candidate; all current local suites pass.
- [x] Owner approved SalahNest; visible app branding updated in the unpublished candidate.
- [x] Keep Android/application IDs, package name, repository slug, existing URLs, and data folder unchanged.
- [ ] Restore the existing Android signing material in a secure build environment; add and test a signed AAB path; verify signing certificate and merged manifest.
- [ ] Complete privacy policy, Play app-content declarations, localized store listing, screenshots/icon/feature graphic, testing track, and review.
- [ ] Install the signed Android build on real devices; verify GPS, timezone changes, notification/exact-alarm permissions, Doze, reboot restore, lock-screen Adhan, audio, and upgrade.
- [ ] Choose a Windows distribution/update strategy; sign or submit an MSIX to the Store; test install, upgrade, data retention, SmartScreen, and native integration on Windows.
- [ ] Decide whether PWA and desktop should offer an update prompt/reload flow; keep Android updates store-managed unless a separate updater is intentionally designed.
- [ ] Only after approval, prepare new version/tag/release artifacts, then publish the updated Pages build and store submissions.
