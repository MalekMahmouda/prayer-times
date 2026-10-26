# SalahNest — Android (APK)

The Android app is a **Capacitor wrapper around the same renderer** the desktop app uses. One UI, one design system, one storage model — with a thin platform layer (`js/platform.js`, `www-build/mobile-scheduler.js`) that swaps Electron APIs for Android ones.

The visible launcher name is **SalahNest**; the Android application ID remains `com.malek.prayertimes` so existing installs and store identity are preserved.

## Architecture

```
Renderer (prayer-times.html + js/* + styles/*)   ← single source of truth
        │
        ├── Desktop: window.ptDesktop (preload contextBridge → Electron main)
        │     scheduler / tray / notifications / adhan overlay / widget
        │
        └── Mobile:  js/platform.js + window.ptMobile (Capacitor plugins)
              offline adhan engine → native local notifications
```

The renderer never calls Electron APIs directly (audited: zero `require('electron')`/IPC in renderer code). Every native touchpoint goes through the platform adapter.

## Feature mapping (Electron → Android)

| Electron | Android |
|---|---|
| BrowserWindow + preload | Capacitor WebView + bridge |
| Main-process scheduler fire loop | `LocalNotifications.schedule` (14-day window, exact alarms `allowWhileIdle`) |
| Electron Notification | Channels: `prayer` (default sound) + `adhan-<reciter>` (bundled adhan recording) + silent for muted prayers |
| Adhan overlay window | Not ported (mobile notifications instead) |
| Tray / widget / mini mode | Hidden (desktop-only cards removed from Settings) |
| `setLoginItemSettings` | `RECEIVE_BOOT_COMPLETED` restore receiver (plugin-native) |
| `ptGetDay` IPC | `Plat.getDay` → offline `adhan` lib (bundled via esbuild) |
| Electron Filesystem (backup) | Same renderer code — `localStorage`/`pt3` + file download |

## Prayer calculations

Identical engine and settings on both platforms: same `adhan` version, same AlAdhan→method map (incl. **id 2 = ISNA via `NorthAmerica()`** — a real bug where it mapped to the angle-less `Other()` was found and fixed on both), same madhab handling, same offsets. Verified: Makkah UmmAlQura times byte-identical between `main/scheduler.js` and `js/platform.js`; ISNA Chicago sane ordering (Fajr < Sunrise < … < Isha).

Sun/midnight/last-third: `SunnahTimes` on both platforms.

## Notifications & alarms

- Channels (v1.4.0): `prayer` (high/heads-up, default sound) + one `adhan-<reciter>` channel carrying the chosen BUNDLED recording from `res/raw` (channel sound is immutable, so the reciter is part of the id; stale `adhan-*` channels are deleted on every reschedule). Per-prayer mute sends the prayer-time notification on the plain `prayer` channel — the alert still arrives, silently (desktop parity).
- Window: next 14 days, refreshed on config change, app resume, and device timezone change (timezone id is part of the schedule signature). Hard-capped at 150 scheduled alarms (~500-alarm OS budget).
- Boot: `LocalNotificationRestoreReceiver` (plugin manifest) reloads pending alarms after `BOOT_COMPLETED` — no user action needed.
- Exact alarms: `SCHEDULE_EXACT_ALARM` declared; capability surfaced via `window.ptMobile.exactAlarms`. If revoked (Android 12+), delivery may be batched by the OS; in-app times are unaffected. Settings shows an "Enable exact alarms" button that opens the special-access screen (`LocalNotifications.changeExactNotificationSetting()`).
- Fire-once semantics come free: each notification has a stable id derived from `prayer|date|kind`, so reschedules never duplicate.

Android's alarm APIs can operate when the app is not running or the device is asleep, but exact-alarm and notification access, power-management behavior, reboots, and manufacturer-specific battery rules affect delivery. A powered-off phone cannot play audio. The scheduled adhan with the app closed or screen locked remains **unverified on real hardware** and is a release gate.

## Location & timezone

- `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` are declared **only** for the "Automatic location" one-shot fix. Manual city entry and saved locations never need them. Denial is non-fatal (Makkah fallback + manual entry).
- Display timezone: the phone's own timezone automatically; saved locations may carry an explicit IANA tz (used by `Intl` formatting on all platforms — no Windows APIs).

## Storage

Same keys and model as desktop (`pts`, `ptl`, `ptt`, `ptlg`, `pt3` with history/dhikrFavs/bookmarks/locations/prefs/customThemes) in WebView localStorage — persistent, LOCAL ONLY: `allowBackup="false"` since v1.4.0 so prayer history/bookmarks are never uploaded to Google (matches the privacy promise).

## Permissions (complete list + justification)

| Permission | Why |
|---|---|
| `INTERNET` | WebView content, optional AlAdhan API freshness, Quran audio streaming |
| `ACCESS_COARSE_LOCATION` | "Automatic location" (approximate is enough by default) |
| `ACCESS_FINE_LOCATION` | Precise GPS location if the user opts in |
| `POST_NOTIFICATIONS` | Prayer + pre-alert notifications (Android 13+, asked in context) |
| `SCHEDULE_EXACT_ALARM` | Reliable prayer-time alarms (Android 12+) |
| `RECEIVE_BOOT_COMPLETED` | Reschedule notifications after reboot |
| `WAKE_LOCK` | Fire alarms on time through Doze |

No contacts, SMS, phone, camera, or microphone.

## Building

Requirements: JDK 21 (Temurin), Android SDK platform 36 + build-tools 36.0.0, Node 18+. This project keeps them outside the repo (e.g. `~/.pt-android/`); point `android/local.properties` at the SDK.

```bash
npm install
npm run www            # assemble www/ from the renderer (strips desktop bridges)
npx cap sync android   # copy www + plugin web code into the Android project
npm run apk            # signed release APK
npm run aab            # signed Google Play App Bundle
npm run apk:debug      # debug APK (no signing config needed)
npm run assets:android # regenerate launcher icons + splash from assets/icon-256.png
```

Gradle writes `android/app/build/outputs/apk/release/app-release.apk` and `android/app/build/outputs/bundle/release/app-release.aab`. The prepared candidate's artifact names and SHA-256 values are recorded in `docs/RELEASE-CHECKLIST.md`.

### Signing

`android/app/build.gradle` reads `keystore/prayertimes.properties` (gitignored) for `storeFile/storePassword/keyAlias/keyPassword`. **The keystore is the only way to update the app in-place — back it up.** If the properties file is missing, release builds fail fast rather than shipping unsigned.

## Versioning

`package.json` and `android/app/build.gradle` agree on candidate `versionName 1.6.5`; Android uses `versionCode 13`. This is a local review candidate; no public tag, upload, or release has been made during this review. Increase the Android version code for every distributed update.

## Verified for the current source candidate

- `npm test`: scheduler, contract, motion, alert, UI-accessibility, and location-date suites pass.
- `npm audit --omit=dev`: zero production dependency vulnerabilities.
- `npm run web`: regenerated `dist-web/` and Android `www/` shells.
- Simulated Chromium: desktop English/Arabic controls, calendar/dhikr/Quran keyboard actions, adhan focus handling, reduced motion, and 390px RTL layout passed.
- `npm run apk` and `npm run aab` both completed successfully. `apksigner` and `jarsigner` verified the resulting signed APK/AAB, and both certificates match the existing key used for published version 1.6.4.
- The APK manifest reports package `com.malek.prayertimes`, version `1.6.5` / code `13`, min SDK 24 and target SDK 36. Official standalone BundleTool 1.18.1 validation passed for the signed AAB; its base manifest reports the same package, version and code. Play Console processing remains separate.
- **Not verified on a real phone:** especially the required scheduled adhan when the app is closed or the screen is locked, plus installation/upgrade, GPS/geocoding, notification and exact-alarm behavior, Doze, reboot recovery and OEM battery restrictions. The local ADB daemon did not start, so no device install/runtime test was performed.

## Device test checklist (needs a real phone)

- [ ] Install release APK ("unknown sources" prompt)
- [ ] First launch: notification permission explained + granted
- [ ] GPS location one-shot; denial → manual/saved location works
- [ ] Scheduled adhan fires with app out of the foreground and screen locked
- [ ] Notifications fire at prayer time with app killed / phone locked
- [ ] Pre-alerts at the configured per-prayer minutes
- [ ] Reboot → notifications still scheduled
- [ ] Timezone change (travel) → schedule refreshes
- [ ] Battery saver / Doze behavior; exact-alarm grant path
- [ ] Portrait + landscape, small + large screens, all themes, EN/AR RTL
- [ ] Quran offline (reader, search, bookmarks); audio focus on calls

## Google Play readiness

- [x] `targetSdkVersion` / `compileSdkVersion` are 36, `minSdkVersion` is 24; application ID is `com.malek.prayertimes`.
- [x] The repeatable `npm run aab` path is guarded by the release-keystore check; the 1.6.5 APK/AAB were built and their signatures verified.
- [x] The existing certificate matches the published 1.6.4 APK. Private keystore material and `android/local.properties` are intentionally excluded from source archives; provide them locally for future builds and never replace or regenerate the key.
- [x] Official standalone BundleTool 1.18.1 `validate` passed; the base manifest reports `com.malek.prayertimes`, version `1.6.5`, code `13`.
- [ ] Complete Play Console processing/review and test on real Android devices, including closed-app/screen-locked scheduled adhan, exact alarms, Doze, notification permissions, reboot restoration and OEM battery management.
- [ ] Publish a privacy-policy URL and link it both in the Play listing and inside the app; complete Data safety, location/permission, ads, target-audience, content-rating, and app-access declarations.
- [ ] Prepare the title, short/full descriptions, phone/tablet screenshots, icon, feature graphic, support contact, and localized English/Arabic listing.
- [ ] Complete Play Console account/app verification, required testing track and tester period where applicable, pre-review checks, and staged rollout.
- [ ] Install and test the signed release on real Android devices, including notification/exact-alarm permission, Doze, reboot restore, GPS denial/manual location, and audio.

## Windows distribution readiness

- An x64 NSIS installer was built from this candidate as `SalahNest-Setup-1.6.5-unsigned.exe`; it is version 1.6.5 but not Authenticode-signed.
- Configure a trusted code-signing certificate or distribute through Microsoft Store/MSIX; the current installer configuration is unsigned and can trigger SmartScreen warnings.
- Test installation, upgrade, uninstall/data retention, notifications, tray/startup behavior, and Windows Defender/SmartScreen on a clean Windows machine.
