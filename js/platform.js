'use strict';

/**
 * platform.js — single platform adapter for the shared renderer.
 *
 * The renderer must never call Electron APIs directly; everything native goes
 * through either the desktop bridge (window.ptDesktop, exposed by preload.js)
 * or this module, which picks the right implementation per platform:
 *
 *   Desktop  → window.ptDesktop (Electron main process)
 *   Android  → Capacitor plugins + window.ptMobile (local notifications)
 *   Browser  → graceful no-ops / offline computation
 *
 * On Android/browser the adhan library is bundled (www/js/adhan-bundle.js sets
 * window.__ptAdhan), so prayer days can be computed fully offline here — the
 * same engine and method map the desktop scheduler uses.
 *
 * Loaded as a classic script on every platform; exposes window.Plat.
 */

(function () {
  const isElectron = () => !!(typeof window !== 'undefined' && window.ptDesktop);
  const isAndroid = () => {
    if (typeof window === 'undefined' || !window.Capacitor) return false;
    try { return window.Capacitor.isNativePlatform(); } catch (e) { return false; }
  };

  /* ── Version (About line) ── */
  function getVersion() {
    if (isElectron() && window.ptDesktop.getVersion) return window.ptDesktop.getVersion();
    return Promise.resolve(null); // caller falls back to its own label
  }

  /* ── Offline prayer-day computation (mirrors main/scheduler.js getDay) ── */

  const ADHAN_MAP = {
    3: (CM) => CM.MuslimWorldLeague(),
    4: (CM) => CM.UmmAlQura(),
    2: (CM) => CM.NorthAmerica(), // AlAdhan id 2 = ISNA (18°/18°)
    1: (CM) => CM.Karachi(),
    5: (CM) => CM.Egyptian(),
    8: (CM) => CM.Dubai(),
    9: (CM) => CM.Kuwait(),
    10: (CM) => CM.Qatar(),
  };

  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  function fmtInTz(d, tz) {
    if (!tz) return hhmm(d);
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
    } catch (e) { return hhmm(d); }
  }

  function computeDayOffline(dateISO, cfg) {
    const deps = window.__ptAdhan;
    cfg = cfg || {};
    if (!deps || !Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) return null;
    const { Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab } = deps;

    const date = new Date(`${dateISO}T12:00:00`);
    if (isNaN(date.getTime())) return null;

    const m = Number(cfg.method);
    const factory = ADHAN_MAP[m] || ADHAN_MAP[3];
    const params = factory(deps.CalculationMethod);
    // Universal: the user's Asr school applies to ALL methods. On desktop the
    // main-process scheduler does the same — both sources stay identical.
    params.madhab = cfg.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;

    const pt = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), date, params);
    const st = new SunnahTimes(pt);
    // Tomorrow's Fajr bounds the night (sunset → fajrNext) for first-third.
    const tomorrow = new Date(date); tomorrow.setDate(tomorrow.getDate() + 1);
    const fajrNext = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), tomorrow, params).fajr;
    const tz = cfg.tz || '';
    const f = (d) => fmtInTz(d, tz);
    const off = (p) => (cfg.offsets && cfg.offsets[p]) || 0;
    const shift = (d, p) => new Date(d.getTime() + off(p) * 60000);

    return {
      date: dateISO,
      timings: {
        Fajr: f(shift(pt.fajr, 'Fajr')),
        Sunrise: f(pt.sunrise),
        Dhuhr: f(shift(pt.dhuhr, 'Dhuhr')),
        Asr: f(shift(pt.asr, 'Asr')),
        Maghrib: f(shift(pt.maghrib, 'Maghrib')),
        Isha: f(shift(pt.isha, 'Isha')),
      },
      sun: {
        sunrise: f(pt.sunrise),
        sunset: f(pt.maghrib),
        dhuhr: f(pt.dhuhr),
        midnight: f(st.middleOfTheNight),
        // First third = sunset + (nextFajr − sunset)/3 — the same formula the
        // main-process scheduler uses (NOT a midpoint between the middle and
        // last thirds).
        firstThird: f(new Date(pt.maghrib.getTime() + (fajrNext.getTime() - pt.maghrib.getTime()) / 3)),
        lastThird: f(st.lastThirdOfTheNight),
      },
    };
  }

  /**
   * Unified getDay used by the dashboard, calendar, and sun sections.
   * Desktop → main-process scheduler; Android/browser → offline computation.
   */
  async function getDay(dateISO, opts) {
    if (isElectron() && window.ptDesktop.getDay) {
      try {
        const day = await window.ptDesktop.getDay(dateISO, opts || {});
        if (day) return day;
      } catch (e) { /* fall through to offline */ }
    }
    return computeDayOffline(dateISO, opts);
  }

  window.Plat = {
    isElectron, isAndroid, getVersion, getDay, computeDayOffline,
  };
})();
