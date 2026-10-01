# Manual & Real-Device Test Checklist (v1.3.2)

Automated coverage: `node scripts/test-scheduler.js` (53/53), `node scripts/test-contract.js` (155/155), `node scripts/check-dist.js` (all green after builds). The items below **require a real device or OS event** and cannot be automated here.

## Windows (Electron)
- [ ] **Online**: times render; no offline badge.
- [ ] **Offline** (Wi-Fi off): times unchanged (local engine), offline badge appears.
- [ ] **Sleep/wake**: sleep through a prayer → on wake, exactly one notification/adhan for the missed prayer; later prayers stay silent.
- [ ] **Startup**: times visible immediately (cached), refreshed within a second.
- [ ] **Close-to-tray**: scheduler keeps firing; tray countdown updates.
- [ ] **Notification + adhan**: overlay shows the correct prayer; volume matches profile/global.
- [ ] **Timezone change** (OS setting, app open): schedule recomputes; next prayer/countdown correct.

## Android (real device — APK versionCode 6 / versionName 1.3.2)
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

### v1.3.2 additions (Qibla + Azan reliability release)
**Qibla — real device (do these in order; the debug readout makes failures self-explaining):**
- [ ] **Debug readout visible**: under the compass status you should see `Qibla bearing: … | Device heading: … | Turn: … | Sensor: …`. If `Sensor:` stays `none` or `permission denied`, that is the defect — note it.
- [ ] **Riyadh flat test (the headline check)**: stand facing any direction, lay the phone flat, note `Qibla bearing` (Riyadh ≈ 244°). Rotate the phone 360° on the table — the dial must keep the 🕋 marker pointing at the true geographic direction at every angle, and `Turn:` must read ±180..0..−180 smoothly (0 exactly when the top of the phone aims at the Kaaba).
- [ ] **Bearing vs arrow agreement**: the numeric bearing and the physical arrow must agree (device held flat, top edge = the direction you'd walk). Try a second city (Cairo ≈ 136°, London ≈ 119°, New York ≈ 59°) via a location switch.
- [ ] **Portrait → landscape → portrait (P6)**: rotate the device upright/flat — the 🕋 must keep pointing at the SAME geographic direction (the debug line's `Device heading` shifts by exactly the screen angle when you rotate).
- [ ] **Leave/re-enter ×3 (P7)**: open/close the Qibla page three times fast — dial must stay responsive (no stacked listeners), heading returns instantly.
- [ ] **Calibration figure-∞** when `Compass unreliable` appears; the readout's `Sensor:` line should read `deviceorientationabsolute` on modern Android, `webkitCompassHeading` on iOS, `deviceorientation` at worst.

**Azan — Windows packaged build (v1.3.2):**
- [ ] **Azan OFF → ON (A1)**: toggle Azan in Settings → `azan-debug.log` shows `azan switch changed {from:false,to:true}` and the next `config push {adhanEnabled:true}` with a trigger; restart the app → the switch stays ON.
- [ ] **Overlay OFF never silences the azan (A3, the v1.3.1 coupling bug)**: turn the overlay setting OFF, keep Azan ON → at the next real prayer the adhan AUDIO must still play with no fullscreen window; the log shows `overlay hidden — azan audio plays without UI`. (Test Overlay itself stays visible only when the overlay setting is ON, by design.)
- [ ] **No repeated config pushes (A2)**: watch `azan-debug.log` for ~10 s after boot — identical `config push` lines within seconds must NOT repeat (only pushes with changed values appear).
- [ ] **Each of the six mu'adhdhins** with Test Adhan at 25% / 50% / 100% volume: correct file, correct volume, clean stop; repeat with the app minimized and from the tray.
- [ ] **Real prayer event**: notification + azan at the real time; correct reciter profile (per-prayer) and volume.
- [ ] **Output-device matrix**: default speakers, Bluetooth, headphones; sleep/resume between prayers; Volume Mixer not muted.

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

It records app version + boot, every renderer config push (with its caller
trigger), azan switch changes, scheduler start, pre-alert / prayer-time /
adhan events (with `overlayVisible`), resolved audio file, overlay
show/reuse/dismiss (including hidden audio-only playback), test-alert /
test-overlay requests, and system resume/recovery — each with timestamps. It
self-trims at ~1 MB (older half removed). If a notification or adhan ever
fails to fire, attach this file to the bug report.

## Qibla debug readout (v1.3.2)
The Qibla page shows one small diagnostic line: `Qibla bearing / Device
heading / Turn / Sensor`. Desktop intentionally shows the geographic bearing
with `Sensor: none` (it has no compass). If the arrow is wrong on a phone,
read the line: wrong `bearing` = location problem; `heading` frozen or
wrong = sensor problem; `Turn` sane but arrow wrong = screen-rotation
problem; `Sensor: permission denied` = iOS/Android permission problem.

## Regression commands (must stay green before any release)
```bash
node scripts/test-scheduler.js   # 53/53
node scripts/test-contract.js    # 155/155
node scripts/check-dist.js       # exit 0 after builds (regenerate tmp/asar-list.txt first)
```
