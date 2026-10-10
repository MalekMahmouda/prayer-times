# Manual & Real-Device Test Checklist (v1.3.2)

Automated coverage: `node scripts/test-scheduler.js` (74/74), `node scripts/test-contract.js` (255/255), `node scripts/check-dist.js` (all green after builds). The items below **require a real device or OS event** and cannot be automated here.

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
- [ ] **Compass**: on the Qibla page the dial rotates with the device and the centered needle points at the Qibla (turn until the needle points to the top of the dial); entering the ±2° window shows "Aligned" and buzzes ONCE; numeric bearing matches desktop; calibration hint appears when moving erratically; static-bearing hint shows on devices without a magnetometer.
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
- [ ] **Riyadh flat test (the headline check)**: stand facing any direction, lay the phone flat, note `Qibla bearing` (Riyadh ≈ 244°). Rotate the phone 360° on the table — the needle must keep pointing at the true geographic direction at every angle (no 0°/360° jumps, no long-way spins across the seam), and `Turn:` must read ±180..0..−180 smoothly (0 exactly when the top of the phone aims at the Kaaba).
- [ ] **Bearing vs arrow agreement**: the numeric bearing and the physical arrow must agree (device held flat, top edge = the direction you'd walk). Try a second city (Cairo ≈ 136°, London ≈ 119°, New York ≈ 59°) via a location switch.
- [ ] **Portrait → landscape → portrait (P6)**: rotate the device upright/flat — the needle must keep pointing at the SAME geographic direction (the debug line's `Device heading` shifts by exactly the screen angle when you rotate).
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

## One real azan event, line by line (v1.3.2)
A complete, healthy event leaves EXACTLY this trace. When the azan fails,
the trace simply stops at the failing boundary — find the last line that
exists and read its meaning:

| Boundary | Expected azan-debug.log line |
|----------|------------------------------|
| 1. Settings toggle | `[renderer] adhan toggle → ON/OFF` |
| 2. Renderer push | `[renderer] config push {"adhanEnabled":true,…,"trigger":…}` |
| 3. IPC normalization | `config update from renderer {…}` (plus `azan switch changed` when it flips) |
| 4. Scheduler accepts | `scheduler config accepted {"adhanEnabled":true,…}` |
| 5. Day schedule | `scheduler schedule computed {"times":"Fajr 04:32,Dhuhr 12:12,…"}` |
| 6. Prayer due | `prayer window entered {"prayer":"Dhuhr","time":"12:12"…}` |
| 7. Decision | `adhan event emitted {"prayer":"Dhuhr","volume":0.5…}` — or `adhan skipped {"azanOn":false,"perPrayerMuted":false…}` WITH the reason |
| 8. Main receives | `adhan event {…,"overlayVisible":true}` |
| 9. File probe | `audio file OK {"path":"…","bytes":…}` (or `audio file MISSING`) |
| 10. Overlay window | `overlay window created {"visible":true}` → `overlay shown` (or `overlay hidden — azan audio plays without UI`) |
| 11. Page + payload | `overlay page loaded` → `adhan:show payload sent` → `[overlay] adhan:show received` |
| 12. Source set | `[overlay] audio.src set {"src":"file://…","volume":0.5}` → `audio.load() issued` |
| 13. Decode | `[overlay] audio canplay (file decoded by the OS) {"duration":…}` |
| 14. play() | `[overlay] audio.play() resolved — adhan audio is playing` (a REJECTED line here names the exact DOMException) |
| 15. Output | `[overlay] audio playing (output device active) {"paused":false,"muted":false,"volume":1,"readyState":4…}` |
| 16. End | `[overlay] audio ended` → `[overlay] overlay closing {"reason":"audio ended"}` → `overlay dismissed` → `overlay window closed` |

Reading a truncated trace: stops after 7 with `adhan skipped` → the azan
switch or a per-prayer mute (the reason fields say which); stops after 9
with `audio file MISSING` → packaging/path problem; stops at 11/12 →
overlay page failed to load (`overlay page load FAILED` names it); `audio
error event {"code":4,"detail":"…MEDIA_ERR_SRC_NOT_SUPPORTED…"}` at 12/13 →
codec/packaging; `play() REJECTED {"detail":"NotAllowedError…"}` at 14 →
autoplay/output-device class.

**Chromium accepted play() but you hear nothing:** 14 succeeded, 15 never
appeared. The state dumps now settle WHERE it died:
- `overlay closing {"reason":"audio ended"}` exists but you heard nothing →
  the media element ran to completion with a **silent output**: Windows
  Volume Mixer (per-app volume/selected device), muted speakers, Bluetooth
  routed elsewhere. Nothing code-side to fix.
- `overlay closing {"reason":"user stop button"/"user Escape key"}` → you
  (or something focusing the overlay) dismissed it before audio was audible.
- `overlay closing {"reason":"max duration reached (6 min)"}` with no
  `audio paused`/`ended` before it → the element stalled silently; compare
  its `readyState`/`networkState` and any `audio stalled`/`audio waiting`
  lines.
- `audio paused {"paused":true,…}` you did not cause → something paused the
  element (the dump names the state at that moment).

**CONFIRMED on this machine (2026-10-01, packaged 1.3.2 test instance):**
the full Electron output chain WORKS — window-level `audioMuted:false` on
both windows, element state `paused:false muted:false volume:1
readyState:4`, `webContents audio-state-changed {"muted":false}` (Chromium
confirmed a live, unmuted audio stream), and `currentTime` advancing.
Therefore, if the speakers stay silent during a real event, the remaining
suspect is Windows per-app audio routing — check **Settings → System →
Sound → Volume mixer** WHILE the azan plays: the Prayer Times app entry
must not be at 0/muted, and its per-app output device must be the speakers
(a stale Bluetooth/headphone assignment silences exactly one app while VLC
and system sounds stay fine — this matches every observation so far).

Also confirm the file itself (all six shipped MP3s are verified MPEG-1
Layer III with ID3 tags): play `assets\adhans\<file>.mp3` from the install
directory directly in VLC — if VLC is silent too, the problem is the
Windows output device, not the app.

## Qibla debug readout (v1.3.2)
The Qibla page shows one small diagnostic line: `Qibla bearing / Device
heading / Turn / Sensor`. Desktop intentionally shows the geographic bearing
with `Sensor: none` (it has no compass). If the arrow is wrong on a phone,
read the line: wrong `bearing` = location problem; `heading` frozen or
wrong = sensor problem; `Turn` sane but arrow wrong = screen-rotation
problem; `Sensor: permission denied` = iOS/Android permission problem.

## Regression commands (must stay green before any release)
```bash
node scripts/test-scheduler.js   # 74/74 (v1.4.0: +tick-advance / tz / recovery-boundary)
node scripts/test-contract.js    # 255/255 with dist (250 on a fresh clone; §10 packaging checks need dist/) — includes the v1.5 Qibla needle/alignment/haptic suite and §14 full-screen azan + attribution
node scripts/check-dist.js       # exit 0 after builds (regenerate tmp/asar-list.txt first)
```
The contract prints a different total depending on `dist/` presence: the
packaging checks run for real when `dist/win-unpacked` exists and are
summarized as one pending check when it does not (a fresh CI clone).

## v1.4.0 review-fix verification (third-party REVIEW.docx pass)

### Qibla needle (v1.5 audit — rim 🕋 marker replaced)
The v1.4.0 rim marker (`rotate(b) translateY(-78px) rotate(-b)`) is GONE.
One centered needle now points at the qibla on screen: angle =
bearing − heading, tracked unwrapped so motion stays smooth across the
0°/360° seam; the rose dial still keeps its N mark on true north. The
static render (pages.js) rests the needle at the bare bearing, north-up.
**Device checks:** face the Qibla (status line Turn ≈ 0°) — the needle
must rest straight UP and the status must read "Aligned" with exactly ONE
vibration; rotate the phone 90° — the needle swings a quarter turn with
it; leave and re-enter the ±2° window — exactly one more buzz per entry,
none while holding; status returns to "Live compass" when outside the window.

### Full-screen Azan surface + attribution (v1.4.0)
One presentation surface (`#azanOverlay`) is shared by the Test Adhan button
and the automatic prayer-time event on Android and the web build. The desktop
app keeps its own always-on-top Electron overlay window (`adhan.html`).
- **Test Adhan (Android)**: Settings → Test Adhan must open the full-screen
  Azan screen (Arabic prayer heading, live clock, "Adhan is playing…", Stop and
  Close) AND play the bundled recording offline; Close/Stop stops the audio and
  returns to Settings with the bottom nav intact. No prayer alarm is created and
  the next-prayer countdown is unchanged.
- **Automatic (Android, app in the FOREGROUND)**: with a prayer time passing,
  the delivered notification must also present the same full-screen Azan screen.
  Pre-alerts ("… in N minutes") must NOT open it.
- **Automatic (Android, screen locked / app backgrounded)**: only the system
  notification + channel sound — the app must NOT launch over the lock screen.
  This is a platform restriction, not a defect.
- **Hardware Back** while the azan screen is open closes the screen first, then
  walks page history, then exits — never exits on the first press.
- **Attribution**: Settings shows an About card with the Arabic supplication
  `يرجى الدعاء ليا ولوالدي` (RTL) and `Developed by Malek Mahmoud`, plus the same
  credit in the page footer; the Arabic UI shows `تطوير: Malek Mahmoud`.

### Android adhan sound matrix (physical device — user-run)
| # | Config | Expected notification |
|---|--------|-----------------------|
| 1 | Azan ON, prayer unmuted | prayer-time notification plays the chosen bundled adhan (channel `adhan-<reciter>`) |
| 2 | Azan ON, prayer muted | prayer-time notification ARRIVES, silent (plain channel) — never skipped |
| 3 | Azan OFF | prayer-time notification with the normal default sound |
| 4 | Pre-alert | always the normal default sound — never the adhan |
Also verify: fresh install creates only `prayer` + current `adhan-*`; upgrading from v1.3.x deletes stale `adhan-*` channels on the first reschedule; switching the reciter re-routes future notifications to the new channel.

### Scheduler recovery + next-prayer advance (desktop)
- Sleep 30+ minutes past Fajr with azan ON → notification fires once, NO adhan overlay (recovery cap 15 min; the boundary `now − at ≤ 15 min → plays`, `> 15 min → notification only` is unit-pinned).
- Let a prayer time pass with the app open: tray, widget and mini mode must show the NEW next prayer within 30 s (no more "Fajr 04:29 in 07:02:13" at noon).
- New York device + Riyadh location: the prayer notification must say the Riyadh wall-clock time (04:xx), not 21:xx.

### Mobile misc
- Android hardware Back closes the More sheet / location modal before exiting.
- Compass debug line hidden by default; `localStorage.ptCompassDebug=1` re-enables it.
- Coordinates read `24.7555°N, 46.7804°E` left-to-right in the Arabic UI; the top-bar location truncates from the END.
- PWA: second visit with airplane mode must still load (SHELL now bundles js/pt-engine.js + js/compass.js).
- Exact alarms: Settings → "Enable exact alarms" opens the Android special-access screen; status line updates after returning.

### Deferred (documented, not fixed)
- Umm al-Qura Ramadan Isha (~120 min after Maghrib): verify against an OFFICIAL calendar before Ramadan 2027; adhan-js may not encode the Ramadan exception.
- Quran lock-screen/background playback (needs a foreground service + media session).

## Test Adhan on desktop (v1.3.3)
Settings → Test Adhan no longer streams from the CDN inside the app window.
On desktop it triggers the REAL pipeline (`PT.testOverlay()`): bundled
recording, configured volume, the actual fullscreen overlay, and the full
azan-debug.log boundary trace — exactly what a prayer-time event does. The
cryptic `🔇 🔊` toast came from the old CDN `<audio>` preview failing
(schemeless CSP hosts never matched on `file://`) plus an emoji-only i18n
string; both are gone. The CDN preview remains the web/PWA path.
