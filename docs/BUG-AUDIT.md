# Bug Audit — v1.3.0 Reliability Release

Baseline: tag `v1.2.1-baseline` (commit `44d3f7e`, 43/43 scheduler checks green).
Status key: **confirmed** → **fixed** → **tested** (automated) / **manual** (needs a real device or OS event).

## Confirmed and fixed in v1.3.0

| # | Bug | Evidence at baseline | Fix | Test |
|---|-----|----------------------|-----|------|
| 1 | Android madhab only applied for methods 2/15 | `www-build/mobile-scheduler.js` paramsFor | Universal madhab via the shared contract (`shared/pt-engine.js`) | `test-contract.js` §7: mobile Asr == engine (hanafi), differs from shafi |
| 2 | **Timezone root cause**: adhan output wall-clock inherits the input Date's components; all call sites built the input from device-local time → shifted instants for cross-timezone locations | Empirical probe (Makkah, device TZ Asia/Riyadh) | `computeDayInstant()` — local-noon input, UTC-component extraction; location-local day via `zonedToday()`; renderer logic on absolute instants (`nextPrayerInfo`, countdown, past/next); location-local midnight re-render | `test-contract.js` §1 golden matrix, §2 desktop parity, §3 zonedToday, §4 midnight; §6 instants path |
| 3 | No offline IANA-tz source for GPS/manual locations | grep: only saved locations carried a timezone | `tz-lookup` dep wired on all three paths (preload, main, esbuild entry); `resolveTz()` with cache + explicit-tz precedence | `test-contract.js` §6 resolveTz offline + cache; §8 tz-lookup sanity |
| 4 | Web/PWA: `adhan-bundle.js` loaded after app.js; nothing re-triggered calculation | `build-www.js` injection at `</body>`; `init()` at app.js EOF | `engineReady` gate (2s bounded, non-permanent degraded mode + late-arrival re-trigger); shared contract now loads first | `test-contract.js` §8 load-order artifact checks |
| 5 | `netFetch()` key `url.split('?')[0]` — query collisions | `js/app.js:378` | Dedup key = full URL | `test-contract.js` §6: 3 queries → 3 requests, no cross-contamination |
| 6 | `netFetch` had no timeout — a hung request blocked its key forever | `js/app.js:377-398` | Per-request AbortController (12s); key released on timeout | `test-contract.js` §6: hang times out, healthy request unaffected, key reusable |
| 7 | Mobile scheduler cancelled ALL pending app notifications; `notif=false` path was a no-op (`cancel({notifications:[]})`) | `www-build/mobile-scheduler.js:104-158` | Our-IDs-only cancellation with persisted ID list (`ptm-notif-ids`) | `test-contract.js` §7: foreign ID never cancelled; notif=false removes only ours |
| 8 | Channel sound `notifsound.wav` referenced; no `res/raw` existed | grep + `ls android/app/src/main/res` | High-importance channel + vibration → system default sound; no sound key | `test-contract.js` §7 + `check-dist.js` §4 (no notifsound reference) |
| 9 | No compass/sensor code; Qibla showed a static bearing as if live | grep; `js/pages.js:17` | `js/compass.js`: deviceorientation(absolute) true-north heading (Android WebView + web), relative-Qibla rotation, honest static/calibration states | Artifact checks; live-heading behavior is device-manual (TESTING.md) |
| 10 | `ptMobile.exactAlarms` exposed but never surfaced | grep | Android settings shows notification + exact-alarm status with honest wording | Manual on device (TESTING.md) |
| 11 | Calendar passed no offsets/tz — could disagree with the main screen | `js/pages.js:76,115` | Calendar call sites pass `offsets` + `tz` like the dashboard | `test-contract.js` §4: calendar == dashboard incl. offset application |
| 12 | Renderer midnight re-render keyed to device-local midnight only | `js/app.js:884-891` | `scheduleMidnight()` uses the location's midnight when a timezone is known | Covered by §3/§6 semantics; cross-midnight UI is device-manual |
| 13 | Duplicate-scheduling risk on config storms | signature check only | 500ms debounce + serialized promise chain; device tz in signature | `test-contract.js` §7: 6 rapid changes → one batch; deterministic IDs |

## GPS accuracy handling (Phase 9)
Three-tier policy in `useGPS()` (`POOR_ACCURACY_M = 1000`, named constant): ≤1000m accept; >1000m with a previous location → keep previous + warn; >1000m first fix → accept + warn. `maximumAge`/`timeout` preserved. Tested: artifact checks (constant + both warning paths present). Device-level behavior: manual.

## Nominatim treated as optional (Phase 10)
Cache `rounded(2dp) → {city,country}` with 7-day TTL, ≥2s throttle, single-flight, skip-when-current, graceful failure (coordinates keep working). Tested: artifact presence; network-failure modes are manual.

## Frozen anchors
- Riyadh 2026-09-29 UmmAlQura: Fajr 04:27, Asr 15:08 (Shafi) / 16:02 (Hanafi), qibla 243.8°
- DST Europe/London 2026: spring UTC gap 1441 min, fall 1438 min; transition days keep 5+1 ordered instants
- High latitude Stockholm midsummer: finite, ordered instants (engine behavior documented — no invented fallback)

## Known pre-existing (out of scope, not regressions)
- CSP warnings for two CDN Google-Fonts (Amiri) in the packaged app — bundled fonts render instead; cosmetic log only.

---

# Bug Audit — v1.3.1 (deep pass over the shipped v1.3.0)

Method: fresh read-only audit of the whole v1.3.0 surface, then **in-process probes against the real code** for every suspicion before any edit (no bug was fixed on theory alone). Baseline: v1.3.0 (`509b553`), 43/43 scheduler + 80/80 contract green.

## Confirmed and fixed in v1.3.1

| # | Bug | Evidence (probe at audit time) | Fix | Test |
|---|-----|-------------------------------|-----|------|
| B1 | **"today" computed in the device timezone, not the location's** — renderer passed `localDateKey(instantNow())` (device-local); desktop scheduler built its fire-day from `new Date(clock())`. Device NY + Riyadh location → yesterday's times for ~7 h daily, and the location-day's Fajr (~21:30 prev device day) fell before the device-day rollover → **Fajr never fired** | Probe: 2026-09-29T20:00Z → location key `2026-10-01` vs device key `2026-09-30` | `refreshTodaySchedule()` keys the day via `Engine.zonedToday(resolveTz())`; scheduler `compute()`/`buildInfo()`/`tick()`/`notifyResumed()` derive `{y,m,d}` from `Engine.zonedToday(cfg.tz, clock())` and build `new Date(y, m-1, d, 12)`; day key + fire keys follow location-local midnight. `tz:''` keeps legacy device-local behavior | scheduler §10: Tokyo dayKey `2026-09-30` while device is on the 29th; Fajr fires at its absolute instant; info.times == zoned engine day; `tz:''` regression guard. contract §6g: sandbox `refreshTodaySchedule` picks the Tokyo day |
| B2 | **Dashboard double-applied minute offsets** — engine `getDay` strings/instants already include offsets, but prayer cards re-parsed them through `adjTime()` (+offset again) | Probe: Riyadh Fajr +5 → engine 04:32, card math 04:37 | `renderDashboard()`/`renderMHome()` + hero render from absolute `S.todaySchedule.instants[p]` once via `fmtAtLoc()` (location wall clock, honors h24); `adjTime()` only remains in the no-engine API fallback and instants-missing fallbacks | contract §6f: display of the offset instant == engine instant (04:32); source check: card loop uses the instants path, not `adjTime` |
| B3 | **`scheduleMidnight()` fired 7–30 h off** — it set *device-wall* midnight (`setHours(24)`) on a date shifted into the location's day | Probe: Tokyo location from a UTC+3 device → algorithm 33.0 h vs true 3.0 h; NY → −7.0 h | Pure `msToNextLocationMidnight(tz, now)`: forward scan on the monotone `zonedToday` day key + bisection (DST-safe by construction); empty tz → device midnight; `scheduleMidnight()` now refreshes the new location-local day | contract §6h: Tokyo + NY midnights within ±2 s of a 1 s reference scan; empty-tz fallback exact |
| B4 | **Ramadan card compared device wall clock to location strings** — `new Date().getHours()` vs `S.times` formatted in the location tz → wrong fasting/iftar windows across timezones | Code probe: device-wall minutes vs location-formatted strings | `zonedNowHM(tz)` (Intl parts, `hour % 24` for the `24:xx` quirk); `renderRamadan()` uses it | Manual (Ramadan timing); helper semantics pinned by §6h family (same Intl part handling as instantNow-era code) |
| B5 | **Compass listener leak** — `stop()` reset state but never `removeEventListener`'d the web `deviceorientation` handler → one extra handler per Qibla visit | Code audit of `js/compass.js` stop() | Handler hoisted to `state.webHandler`; stop() removes the SAME handler with the SAME capture flag; iOS permission grant after the page is left wires nothing | contract §6i: start→1 add, stop→1 remove, restart→no accumulation; late-grant adds nothing |
| B6 | **`revGeo()` returned the inflight of different coordinates** — `_revGeo.inflight` was reused regardless of target | Code audit + probe: second call with other coords bound to the first's promise | Inflight is `{key, promise}`; reuse only on key match; different-coordinate requests are skipped (not bound) | contract §6j: different coords skip; same coords single-flight — exactly ONE network call |
| B7 | **`instantNow()` dead math** — `Date.now() + (x) − (x)` degenerated to `new Date(Date.now())` | Algebraic probe | Simplified to `return new Date()` with an honest comment: absolute now is correct because all comparisons use absolute instants | Covered by existing instants-path tests (§6e) |
| B8 | **Release notes stale/false** — claimed the installer "is not code-signed yet" (it is), no per-version notes | Read of `scripts/make-release.js` | Signing note corrected; concise "What's new in {version}" section (v1.3.1 lists B1–B7 user-facing fixes) | Verified in generated `release/RELEASE-NOTES.txt` |

## Verified correct — deliberately NOT changed (v1.3.1)
- **pushMobile timing on Android**: the engine-bundle loads after app.js, so the first `setConfig` is a no-op — but the signature stays unset, so the `load`-event retry schedules correctly.
- **`+p.hour % 24`**: Intl's `hour12:false` can emit hour `24`; the modulo handles it (probed at 00:30 Riyadh → correct).
- **Calendar digit round-trips** (`fmt(timeStrToDate(str, date))`): identity — parse and reformat never cross a day boundary for HH:MM.
- **Golden engine matrix**: no engine file touched in v1.3.1; anchors re-verified green.

## Test totals after v1.3.1
`scheduler 47/47` (+4), `contract 93/93` (+13), `check-dist` green. Artifacts: desktop 1.3.1, Android versionCode 5 / 1.3.1.

# Bug Audit — v1.3.2 (Qibla + Azan reliability)

Method: diagnose FIRST, then the smallest confirmed fix. Geographic layer
probed against 6 reference cities BEFORE touching anything; azan pipeline
traced end-to-end with azan-debug.log; the release was never modified
mid-diagnosis. Baseline: v1.3.1 + forensic logging (`2eb6267`), 47/47
scheduler + 101/101 contract, tag `v1.3.2-baseline`.

## Phase A — Qibla: separate geographic bearing from device heading

The ENGINE was verified correct first and deliberately left untouched:
Riyadh 243.80°, Cairo 136.14°, London 118.99°, New York 58.48°,
Tokyo 293.02°, Karachi 267.74° (max deviation 0.52° from published
values). The wrong arrow was a compass/heading-layer defect:

| # | Bug | Evidence | Fix | Test |
|---|-----|----------|-----|------|
| Q1 | **Relative alpha trusted as absolute north** — plain `deviceorientation` events were accepted even when the sensor only provided gyro-relative data, so "north" drifted and the arrow pointed wrong | W3C Device Orientation §3.1/§6: alpha is counter-sense to compass heading; only absolute data defines north | Web handler accepts ONLY `webkitCompassHeading` (iOS), `deviceorientationabsolute`, or `deviceorientation` with `absolute === true`; relative-only readings are rejected → honest static mode instead of a wrong arrow | contract §6i2: relative reading rejected; absolute accepted; iOS priority |
| Q2 | **No screen-rotation compensation** — sensors report the natural-portrait frame; rotating the phone to landscape rotated the Qibla with the screen | W3C Screen Orientation §2.2 (angle = CCW from natural) + Device Orientation §3.1 (device frame stays natural-portrait) | `heading = norm360(raw − screen.orientation.angle)` with legacy `window.orientation` fallback | contract §6i2: 100°→10° at angle 90; portrait→landscape→portrait cycles; legacy fallback |
| Q3 | **Unsigned turn math + weak validation** — the arrow had no signed direction semantics; NaN/Infinity/absurd sensor values were accepted | v1.3.2 plan P4/P5 | Signed turn `((bearing − heading + 540) % 360) − 180` drives needle + readout; strict validation (non-finite and |v|>1e6 rejected; normalized to 0≤h<360) | contract §6i2: −20→340, 380→20, 360→0, ±180 edge, invalid-value matrix |
| Q4 | (hardening) **Sensor lifecycle** extended to the new event types; late iOS permission grants after leaving the page wire nothing (epoch guard) | B5 follow-up | One handler per active period, removed with the same type+capture flag; 3 open/close cycles → exactly 3 adds / 3 removes | contract §6i2 lifecycle block |

Debug readout (P8): the Qibla page now shows `Qibla bearing / Device
heading / Turn / Sensor` — desktop shows the geographic bearing with
`Sensor: none` and never pretends to have a live compass.

## Phase B — Azan: state pipeline first, then audio

| # | Bug | Evidence | Fix | Test |
|---|-----|----------|-----|------|
| A1 | **Azan switch ambiguity** — renderer sent `adhan`, main persisted only type/volume, scheduler gated on `cfg.adhan`; the boot log showed `"adhan":false` while the user believed azan was enabled | azan-debug.log config lines (the #1 clue of the plan) | ONE canonical switch `adhanEnabled` (strict boolean), normalized ONCE at the main IPC boundary, mirrored into the scheduler on both keys + a store mirror; toggle clicks and every real push are logged with their caller | scheduler §10 truth table (canonical wins over conflicting legacy; string forms normalized); contract §10 |
| A2 | **Repeated identical config pushes within ~4 s** (init + GPS/revGeo + language paths) | azan-debug.log: several `config update` lines in a row | `pushCfg()` fingerprints the payload; identical consecutive pushes are dropped; any real change always flows through | contract §10: dedup + trigger logging |
| A3 | **Overlay toggle silently disabled azan AUDIO** — audio played only inside `if (store.get('adhanOverlayEnabled'))`; overlay OFF = no adhan at all | main.js `fireAdhanEvent` audit (P15) | Decoupled: overlay VISIBILITY (`opts.visible`) and audio are independent; overlay-off plays the SAME lifecycle through the hidden overlay window; logs `azan audio plays without UI` | scheduler §10 azan-OFF/ON notification matrix; contract §10 decouple checks |
| A4 | **Audio failures unclassifiable** | P14 plan | Instrumentation retained + extended: renderer push triggers via `pt:debug`, `adhan event {overlayVisible}`, real DOMException names + MEDIA_ERR_* codes from the overlay page | azan-debug.log pipeline (TESTING.md matrices) |

Bundled audio verified (P12): all six MP3s exist, non-trivial size, resolve
to `file://` paths, are packaged in app.asar (asar-list check) with the
asar-unpack preference — not just alafasy.

## Test totals after v1.3.2
`scheduler 53/53` (+6), `contract 155/155` (+54), `check-dist` green.
Artifacts: desktop Setup-1.3.2.exe, Android versionCode 6 / versionName 1.3.2.

## v1.3.3 — Test Adhan pipeline, CSP scheme fix, reciter endpoints

| # | Bug | Evidence | Fix | Test |
|---|-----|----------|-----|------|
| T1 | **Desktop Test Adhan streamed from the CDN instead of the real pipeline** — the in-app `<audio>` preview failed silently and surfaced the cryptic `🔇 🔊` toast (adhan-fail emoji + the old `toast.beep: '🔊'` string) | user report; playAdhanBrowser() rejects without any CSP/diagnostic signal | `testAdhan()` on desktop routes through `PT.testOverlay()` (bundled recording, configured volume, the actual overlay, azan-debug.log trace); CDN preview kept for web/PWA; honest `toast.adhanFail` / `toast.adhanOverlay` i18n keys (en+ar) | contract §11: desktop branch returns before the CDN path; old `🔊` beep toast string gone |
| T2 | **CSP host rules without an explicit scheme never matched on file:// pages** (CSP3: schemeless hosts match the document scheme) — blocked the adhan preview, Quran streaming AND Arabic web fonts on desktop; browser/PWA unaffected | CSP3 §host-source matching; everything remote dead only in Electron | all remote hosts in the meta CSP are `https:`-prefixed (fonts, geocoding, media incl. new `*.mp3quran.net`) — matches on both http(s) and file:// | contract §11: every CSP host token in prayer-times.html is scheme-prefixed or self/data |
| T3 | **Streaming Quran reciters 403** — cdn.islamic.network audio-surah serves only Alafasy + Abdul Basid now | upstream endpoint audit 2026-10 | per-reciter URL templates: islamic.network for the two live editions, mp3quran.net full-surah servers for Sudais/Husary/Minshawi (`{n3}` zero-padded naming) | contract §8 artifact checks extend to the new template fields |

## Test totals after v1.3.3
`scheduler 60/60`, `contract 170/170` (+15), `check-dist` green.
Artifacts: desktop Setup-1.3.3.exe, Android versionCode 7 / versionName 1.3.3.

## v1.4.0 — REVIEW.docx fix pass (third-party review, 2026-10-05)

Method: every finding re-verified against the code BEFORE fixing (review
claims were accurate; two were corrected in scope: the Quran “reader” is a
page, not an overlay, and `changeExactNotificationSetting()` takes no
arguments). Desktop findings R1–R5 + mobile R6–R12:

| # | Bug | Evidence | Fix | Test |
|---|-----|----------|-----|------|
| R1 | **Next prayer never advanced** — tick() refreshed only the countdown; after Fajr the tray/widget/mini still showed Fajr until midnight | probe: stale name + live countdown to Dhuhr | `info.next.ms` exposed; tick() recomputes when `now >= next.ms`; main.js pushes updateTray + broadcastInfo every tick | scheduler: advance + boundary tests |
| R2 | **Notification time in device tz** — NY device + Riyadh location announced 21:29 for a 04:29 Fajr | probe | event payloads formatted with `fmtInTz(at, cfg.tz)` | scheduler: tz-format test |
| R3 | **Tray icon click wiped the menu** — a second click handler called rebuild(null) | tray.js:38 | handler deleted; left-click opens only | source check |
| R4 | **AppUserModelID mismatch** — com.prayertimes.desktop vs appId com.malek.prayertimes (toasts may never show on installed builds) | main.js:45 vs package.json | set to com.malek.prayertimes | source check |
| R5 | **tz-lookup in sandboxed preload always failed** — window.tzLookup undefined on desktop; GPS/city locations got tz: | preload.js require under sandbox:true | bridge removed; pt:update-config resolves empty tz in MAIN via tz-lookup | source check |
| R6 | **Qibla marker 90° clockwise** — translate(78px) moved along the rotated x-axis (bearing is measured from north/up) | screenshot: bearing 244/h heading 242, marker at 3 o’clock | `rotate(b) translateY(-78px) rotate(-b)` in compass.js + pages.js | contract §12 geometry |
| R7 | **Sleep-gap adhan burst** — every prayer missed during sleep fired back-to-back on resume | tick() recovery window covers the whole gap | 15-min recovery cap: ≤15 min late plays (recovered), beyond = notification only, logged `missed-too-long` | scheduler: boundary tests (±1 ms) |
| R8 | **Settings file corruptible** — direct writeFileSync, crash mid-write = silent reset | json-store.js | write to `.tmp` + rename (atomic) | source check |
| R9 | **Android adhan settings lied** — controls shown, pushMobile never sent adhan fields, CDN-only Test Adhan | review + code | per-reciter `adhan-<type>` channels with res/raw sounds (scripts/gen-android-raw.js), offline Test Adhan from www/adhans/, honest UI (volume/overlay hidden, notes added) | contract §12 + device matrix |
| R10 | **Per-prayer mute skipped the whole Android notification** (desktop parity broken) | mobile-scheduler.js:140 continue | mute now only re-routes to the plain channel — the alert always arrives | contract §12 source check + device matrix |
| R11 | **7-day notification cliff** | DAYS=7, MAX_NOTIFS=80 | DAYS=14, MAX_NOTIFS=150 (< ~500 alarm budget) | source check |
| R12 | **No way to grant exact alarms** | status line only, no button | Settings button → `changeExactNotificationSetting()` | source check + device |

Also in this pass (smaller findings): `--hidden` autostart flash
(gated ready-to-show), adhan.html CSP https-prefixed, Android back button
closes sheets/modals first, compass debug line opt-in
(`localStorage.ptCompassDebug=1`), coords LTR + N/E labels, top-bar
truncation, PWA SHELL += pt-engine/compass, `allowBackup=false`, keystore
guard (assembleRelease fails loudly), @capacitor/* moved to
devDependencies (installer slimmed), electron pinned 41.1.0, `npm test` +
GitHub Actions CI, ISC LICENSE + in-app credits, stale README/label fixes.

## Test totals after v1.4.0
`scheduler 74/74`, `contract 205/205 with dist present (200 on a fresh clone — the §10 packaging checks summarize as one placeholder without dist/)`, `check-dist` green.
Artifacts: desktop Setup-1.4.0.exe, Android versionCode 8 / versionName 1.4.0.

## v1.5.0 — expert visual design pass (2026-10-10)

Method: the app was RENDERED and looked at — 42 screenshots across three
viewports, 8 themes, EN/AR — rather than only measuring computed styles. Six
defects were found this way and fixed; the countdown one is a P0 (unreadable
in five of eight themes). Full report: docs/DESIGN-REVIEW.md.

| # | Defect | Evidence | Fix |
|---|--------|----------|-----|
| F1 | Hero countdown invisible in all 5 light themes (~1.4:1) — inherited `#fff` onto a near-white `--glass` | before/60 vs after/60 | `.hero-cd { color: var(--text) }` |
| F2 | A phone's first paint was an empty screen — m-mode derived only on resize | before/39 vs after/39 | derive mode at boot |
| F3 | `--gold` failed AA as small text on a light surface (islamic 3.20:1) | before/05 vs after/05 | new `--gold-ink` token in all 8 themes |
| F4 | Dashboard icon row was six unrelated emoji, two illegible at 21px | before/63 vs after/63 | one 23-glyph stroke set, extended to all navigation chrome |
| F5 | Past prayer cards dimmed to 42% | after/01 | 58%, hover 90% |
| F11 | Mobile hero + prayer strip painted only on the countdown's 30th tick | after/40, after/70 | repaint from `renderAll()` and `gotoPage('mhome')` |

Open, documented, not fixed: F6 (no content-page headings), F7 (empty states),
F8–F10 (composition / redundancy / minor inconsistencies).

## Test totals after v1.5.0
`scheduler 74/74`, `contract 284/284` (+20 §16 guards, +1 §12 Android version-lockstep guard), `check-dist` green.
Artifacts: desktop Setup-1.5.0.exe, Android versionCode 9 / versionName 1.5.0.

