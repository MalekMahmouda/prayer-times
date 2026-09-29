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
