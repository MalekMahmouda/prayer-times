(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PT_ENGINE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * shared/pt-engine.js — THE calculation contract for every platform.
   *
   * Electron main (`require`), the browser (classic script → window.PT_ENGINE),
   * the esbuild mobile bundle, and tests all use this one file, so Windows /
   * Android / Web cannot drift: same METHOD_MAP, same universal madhab, same
   * date convention, same rounding. Zero dependencies — callers pass the
   * adhan library in as `deps`.
   *
   * ── The adhan date convention (pinned by scripts/test-contract.js) ──
   * The adhan library reads the LOCAL calendar components (getFullYear /
   * getMonth / getDate) of its input Date, and returns Date objects whose UTC
   * components carry the wall-clock time-of-day. Therefore:
   *
   *   input:  new Date(y, m-1, d, 12)   → runtime-local noon, its LOCAL
   *                                     components are exactly (y, m, d) in
   *                                     every timezone (incl. UTC+13/+14)
   *   output: read via getUTC*()        → wall-clock of the (y, m, d) calendar
   *                                     day as an absolute instant
   *
   * The result is independent of the device timezone: the same (lat, lon,
   * y, m, d, method, madhab, offsets) produces identical instants whether the
   * device runs in Riyadh, London, New York or Tokyo. The UTC-noon variant of
   * this convention was verified equivalent for all |offset| ≤ 12 zones;
   * local-noon input additionally covers UTC+13/+14. The contract tests are
   * the authority for this convention.
   */

  const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const ALL_DAYS = [...PRAYERS, 'Sunrise'];
  const KAABA = { lat: 21.4225, lon: 39.8262 };

  /* AlAdhan method ids (js/data.js METHODS) → adhan-package method factories.
     Single copy — main/scheduler.js, js/platform.js and the mobile scheduler
     all resolve methods through here. */
  function makeMethodMap(CalculationMethod) {
    return {
      3: () => CalculationMethod.MuslimWorldLeague(),
      4: () => CalculationMethod.UmmAlQura(),
      2: () => CalculationMethod.NorthAmerica(), // AlAdhan id 2 = ISNA (18°/18°)
      1: () => CalculationMethod.Karachi(),
      5: () => CalculationMethod.Egyptian(),
      8: () => CalculationMethod.Dubai(),
      9: () => CalculationMethod.Kuwait(),
      10: () => CalculationMethod.Qatar(),
    };
  }

  /**
   * Calculation parameters for a config — THE single params builder.
   * Universal madhab: the user's Asr school applies to ALL methods (desktop
   * scheduler, Android scheduler and web all behave identically).
   */
  function paramsFor(cfg, deps) {
    const { CalculationMethod, Madhab } = deps;
    const m = Number(cfg && cfg.method);
    const map = makeMethodMap(CalculationMethod);
    const factory = map[m] || map[3];
    const params = factory();
    params.madhab = (cfg && cfg.madhab === 'hanafi') ? Madhab.Hanafi : Madhab.Shafi;
    return params;
  }

  /* Absolute-instant day computation.
     cfg: { lat, lon, tz, method, madhab, offsets }
     y/m/d: the LOCATION's local calendar date (1-based month).
     Returns { instants: {Fajr,Sunrise,Dhuhr,Asr,Maghrib,Isha} (ms),
               sun: { sunrise, sunset, dhuhr, midnight, firstThird, lastThird } (ms) }
     or null when inputs are invalid. Offsets are applied to the 5 prayers. */
  function computeDayInstant(cfg, y, m, d, deps) {
    const { Coordinates, CalculationMethod, PrayerTimes, SunnahTimes } = deps;
    const lat = Number(cfg && cfg.lat), lon = Number(cfg && cfg.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

    const date = new Date(y, m - 1, d, 12); // local-noon input — see header
    const params = paramsFor(cfg, deps);
    const pt = new PrayerTimes(new Coordinates(lat, lon), date, params);
    const utc = (dt) => Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(),
      dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds(), dt.getUTCMilliseconds());

    const off = (p) => {
      const v = cfg.offsets && cfg.offsets[p];
      const n = Number(v);
      return (v != null && v !== '' && Number.isFinite(n)) ? n : 0;
    };
    const shift = (ms, p) => ms + off(p) * 60000;

    const instants = {
      Fajr: shift(utc(pt.fajr), 'Fajr'),
      Sunrise: utc(pt.sunrise),
      Dhuhr: shift(utc(pt.dhuhr), 'Dhuhr'),
      Asr: shift(utc(pt.asr), 'Asr'),
      Maghrib: shift(utc(pt.maghrib), 'Maghrib'),
      Isha: shift(utc(pt.isha), 'Isha'),
    };

    // Night bounds: sunset → tomorrow's Fajr (same formula on all platforms).
    const nd = new Date(y, m - 1, d + 1, 12); // Date normalizes day overflow
    const fajrNext = new PrayerTimes(new Coordinates(lat, lon), nd, params).fajr;
    const sunset = utc(pt.maghrib);
    const night = fajrNext.getTime() - sunset;
    const sun = {
      sunrise: utc(pt.sunrise),
      sunset,
      dhuhr: utc(pt.dhuhr),
      midnight: sunset + night / 2,
      firstThird: sunset + night / 3,
      lastThird: sunset + night * (2 / 3),
    };

    return { instants, sun };
  }

  /* Great-circle initial bearing from (lat, lon) to the Kaaba, 0..360.
     Formula unchanged from the pre-contract app.js implementation. */
  function qiblaBearing(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
    const la = lat * Math.PI / 180, lo = lon * Math.PI / 180;
    const ml = KAABA.lat * Math.PI / 180, mlo = KAABA.lon * Math.PI / 180;
    const dL = mlo - lo;
    const y = Math.sin(dL) * Math.cos(ml);
    const x = Math.cos(la) * Math.sin(ml) - Math.sin(la) * Math.cos(ml) * Math.cos(dL);
    let b = Math.atan2(y, x) * 180 / Math.PI;
    if (b < 0) b += 360;
    return b;
  }

  function distToKaaba(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const R = 6371;
    const dLat = (KAABA.lat - lat) * Math.PI / 180, dLon = (KAABA.lon - lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * Math.PI / 180) * Math.cos(KAABA.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /* Location-local calendar date for an instant: "today" as seen in `tz`.
     Returns { y, m, d, key: 'YYYY-MM-DD' } — never uses the device timezone.
     Falls back to the device-local date when tz is empty/unknown. */
  function zonedToday(tz, now, IntlImpl) {
    const II = IntlImpl || (typeof Intl !== 'undefined' ? Intl : null);
    const at = now instanceof Date ? now : new Date(now);
    if (II && tz) {
      try {
        const f = new II.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
        });
        const parts = {};
        for (const p of f.formatToParts(at)) parts[p.type] = p.value;
        const y = Number(parts.year), m = Number(parts.month), d = Number(parts.day);
        if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
          return { y, m, d, key: `${parts.year}-${parts.month}-${parts.day}` };
        }
      } catch (e) { /* invalid tz → device-local below */ }
    }
    return {
      y: at.getFullYear(), m: at.getMonth() + 1, d: at.getDate(),
      key: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`,
    };
  }

  return {
    PRAYERS, ALL_DAYS, KAABA,
    makeMethodMap, paramsFor, computeDayInstant,
    qiblaBearing, distToKaaba, zonedToday,
  };
});
