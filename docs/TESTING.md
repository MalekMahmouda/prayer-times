# Manual & Real-Device Test Checklist (v1.3.1)

Automated coverage: `node scripts/test-scheduler.js` (47/47), `node scripts/test-contract.js` (93/93), `node scripts/check-dist.js` (all green after builds). The items below **require a real device or OS event** and cannot be automated here.

## Windows (Electron)
- [ ] **Online**: times render; no offline badge.
- [ ] **Offline** (Wi-Fi off): times unchanged (local engine), offline badge appears.
- [ ] **Sleep/wake**: sleep through a prayer → on wake, exactly one notification/adhan for the missed prayer; later prayers stay silent.
- [ ] **Startup**: times visible immediately (cached), refreshed within a second.
- [ ] **Close-to-tray**: scheduler keeps firing; tray countdown updates.
- [ ] **Notification + adhan**: overlay shows the correct prayer; volume matches profile/global.
- [ ] **Timezone change** (OS setting, app open): schedule recomputes; next prayer/countdown correct.

## Android (real device — APK versionCode 5 / versionName 1.3.1)
- [ ] **Install & first run**: location set (GPS or city); times match the desktop app for the same location/method/madhab.
- [ ] **Cross-timezone matrix (key regression)**: set the device clock/timezone to a different zone than the prayer location (e.g. phone in America/New_York, location Riyadh). Times on screen must match Riyadh wall-clock, and notifications must fire at the Riyadh prayer instants (device date ≠ location date is fine).
- [ ] **Locked screen**: notification with sound + vibration arrives at prayer time.
- [ ] **App closed / swiped from recents**: notifications still fire (boot-restore + exact alarms).
- [ ] **Battery saver / Doze**: notifications may be batched — confirm they still arrive reasonably close; the Settings page shows the honest exact-alarm status ("alarms may be delayed by the system" when not granted).
- [ ] **Do Not Disturb**: channel behaves per system policy; no crash.
- [ ] **Exact alarm grant** (Settings → Apps → Special access → Alarms & reminders): grant it, then confirm the Settings page reports exact alarms enabled.
- [ ] **Compass**: on the Qibla page the dial rotates with the device (turn until the 🕋 marker points forward); numeric bearing matches desktop; calibration hint appears when moving erratically; static-bearing hint shows on devices without a magnetometer.
- [ ] **Notification ID isolation**: change city/method/offsets → old alarms replaced, no duplicates (check with `adb shell dumpsys alarm | grep -i prayer` if handy).
- [ ] **GPS accuracy**: indoors (poor fix) with a previous location → warning shown, previous location kept.
- [ ] **Offline (airplane mode)**: times still correct; saved locations switch instantly.

### v1.3.1 additions (timezone-correctness release)
- [ ] **Day-boundary handoff (B1/B3)**: with a location ahead of the device (e.g. phone in America/New_York, location Asia/Tokyo), keep the app open across the LOCATION's midnight (Tokyo 00:00 = NY 11:00) — times must roll to the new Tokyo day at that moment, not at NY midnight; the next prayer after the location-day's Isha is tomorrow's Fajr with a sane countdown (never ~24 h inflated).
- [ ] **Fajr before device midnight (B1)**: same setup, let the location-day Fajr instant pass (Tokyo ~04:30 = NY ~15:30 previous date) → the Fajr notification/adhan must fire at the Riyadh/Tokyo instant while the device date is still yesterday.
- [ ] **Ramadan card** (during Ramadan): with a cross-timezone location, fasting/iftar countdown matches the location's prayer times, not the device clock.
- [ ] **Compass repeat visits (B5)**: open/close the Qibla page 5× quickly → the dial stays responsive, no duplicated motion; on iOS-style permission prompts, granting after leaving the page must not start the dial.
- [ ] **Qibla card display (B2)**: with a non-zero per-prayer offset set (e.g. Fajr +5), the card time and the countdown reference the SAME adjusted time (no double offset).

## Web/PWA (dist-web served over HTTP)
- [ ] **First load**: service worker registers (new cache name).
- [ ] **Offline refresh** after install: full app loads; times computed locally; offline badge appears.
- [ ] **Installed PWA**: standalone window; times correct; compass works only where `deviceorientation` is available (honest static fallback otherwise).
- [ ] **Location change / saved location / API failure**: switching cities updates times instantly; blocking the network never breaks calculation.

## Cross-platform agreement (Phase 22 spot check)
For any one location/method/madhab (e.g. Riyadh, Umm al-Qura, Hanafi), the desktop app, the Android app and the PWA must show identical Fajr→Isha times and the same Qibla bearing.

## Desktop adhan debug log
The Windows app keeps a persistent, always-on forensic log at:

    %APPDATA%\Prayer Times\azan-debug.log

It records app version + boot, every renderer config push, scheduler start,
pre-alert / prayer-time / adhan events, resolved audio file, overlay show/
reuse/dismiss, test-alert / test-overlay requests, and system resume/recovery
— each with timestamps. It self-trims at ~1 MB (older half removed). If a
notification or adhan ever fails to fire, attach this file to the bug report.

## Regression commands (must stay green before any release)
```bash
node scripts/test-scheduler.js   # 47/47
node scripts/test-contract.js    # 93/93
node scripts/check-dist.js       # exit 0 after builds
```
