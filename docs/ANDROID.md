# Prayer Times — Android (APK)

The Android app is a **Capacitor wrapper around the same renderer** the desktop app uses. One UI, one design system, one storage model — with a thin platform layer (`js/platform.js`, `www-build/mobile-scheduler.js`) that swaps Electron APIs for Android ones.

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
| Main-process scheduler fire loop | `LocalNotifications.schedule` (3-day window, exact alarms `allowWhileIdle`) |
| Electron Notification | Local notification channel `prayer` (high, heads-up) |
| Adhan overlay window | Not ported (mobile notifications instead) |
| Tray / widget / mini mode | Hidden (desktop-only cards removed from Settings) |
| `setLoginItemSettings` | `RECEIVE_BOOT_COMPLETED` restore receiver (plugin-native) |
| `ptGetDay` IPC | `Plat.getDay` → offline `adhan` lib (bundled via esbuild) |
| Electron Filesystem (backup) | Same renderer code — `localStorage`/`pt3` + file download |

## Prayer calculations

Identical engine and settings on both platforms: same `adhan` version, same AlAdhan→method map (incl. **id 2 = ISNA via `NorthAmerica()`** — a real bug where it mapped to the angle-less `Other()` was found and fixed on both), same madhab handling, same offsets. Verified: Makkah UmmAlQura times byte-identical between `main/scheduler.js` and `js/platform.js`; ISNA Chicago sane ordering (Fajr < Sunrise < … < Isha).

Sun/midnight/last-third: `SunnahTimes` on both platforms.

## Notifications & alarms

- Channels: `prayer` (high/heads-up, vibration) — created on first schedule.
- Window: next 3 days, refreshed on config change, app resume, and device timezone change (timezone id is part of the schedule signature).
- Boot: `LocalNotificationRestoreReceiver` (plugin manifest) reloads pending alarms after `BOOT_COMPLETED` — no user action needed.
- Exact alarms: `SCHEDULE_EXACT_ALARM` declared; capability surfaced via `window.ptMobile.exactAlarms`. If revoked (Android 12+), delivery may be batched by the OS; in-app times are unaffected.
- Fire-once semantics come free: each notification has a stable id derived from `prayer|date|kind`, so reschedules never duplicate.

## Location & timezone

- `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` are declared **only** for the "Automatic location" one-shot fix. Manual city entry and saved locations never need them. Denial is non-fatal (Makkah fallback + manual entry).
- Display timezone: the phone's own timezone automatically; saved locations may carry an explicit IANA tz (used by `Intl` formatting on all platforms — no Windows APIs).

## Storage

Same keys and model as desktop (`pts`, `ptl`, `ptt`, `ptlg`, `pt3` with history/dhikrFavs/bookmarks/locations/prefs/customThemes) in WebView localStorage — persistent, backed up by Android's `allowBackup` where the OS allows.

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

Requirements: JDK 21 (Temurin), Android SDK platform 35 + build-tools 35, Node 18+. This project keeps them outside the repo (e.g. `~/.pt-android/`); point `android/local.properties` at the SDK.

```bash
npm install
npm run www            # assemble www/ from the renderer (strips desktop bridges)
npx cap sync android   # copy www + plugin web code into the Android project
npm run apk            # signed release APK
npm run apk:debug      # debug APK (no signing config needed)
npm run assets:android # regenerate launcher icons + splash from assets/icon-256.png
```

Outputs land in `android/app/build/outputs/apk/` and are copied to `release-apk/` with SHA-256 checksums.

### Signing

`android/app/build.gradle` reads `keystore/prayertimes.properties` (gitignored) for `storeFile/storePassword/keyAlias/keyPassword`. **The keystore is the only way to update the app in-place — back it up.** If the properties file is missing, release builds fail fast rather than shipping unsigned.

## Versioning

`versionName` mirrors the desktop release (1.1.0); `versionCode` is an integer that must increase with every distributed build.

## Tested here (build-level)

- Web bundle smoke test in a browser: dashboard, hero countdown, sun section from the offline engine, calendar, Arabic RTL, themes.
- `aapt badging`: package/id/label/permissions/SDK levels.
- `apksigner verify`: v2 scheme, cert `CN=Prayer Times, O=Malek`.
- Desktop regression suite: 4/4 (ISNA ordering, Makkah unchanged, madhab Asr delta, DST day) + clean Electron boot.

## Device test checklist (needs a real phone)

- [ ] Install release APK (SmartScreen equivalent: "unknown sources" prompt)
- [ ] First launch: notification permission explained + granted
- [ ] GPS location one-shot; denial → manual/saved location works
- [ ] Notifications fire at prayer time with app killed / phone locked
- [ ] Pre-alerts at the configured per-prayer minutes
- [ ] Reboot → notifications still scheduled
- [ ] Timezone change (travel) → schedule refreshes
- [ ] Battery saver / Doze behavior; exact-alarm grant path
- [ ] Portrait + landscape, small + large screens, all themes, EN/AR RTL
- [ ] Quran offline (reader, search, bookmarks); audio focus on calls

## Play Store notes (future)

- Target SDK must track current Play requirements (built against 36).
- `allowBackup` + keystore strategy: Play App Signing recommended.
- Consider an AAB (`bundleRelease`) instead of APK for Play distribution.
- Privacy policy URL required (app is offline-first; only optional network calls are location lookup / Quran audio).
