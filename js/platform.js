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

  /* ── Offline prayer-day computation (delegates to the shared contract) ── */

  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  function fmtInTz(d, tz) {
    if (!tz) return hhmm(d);
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
    } catch (e) { return hhmm(d); }
  }

  /* Shared contract (shared/pt-engine.js, classic script before app.js) +
     the adhan lib bundled in adhan-bundle.js (window.__ptAdhan). Desktop has
     neither — getDay() uses the main-process scheduler there. The engine is
     the SAME file the desktop scheduler uses, so results cannot drift. */
  function computeDayOffline(dateISO, cfg) {
    const E = window.PT_ENGINE;
    const deps = window.__ptAdhan;
    cfg = cfg || {};
    if (!E || !deps || !Number.isFinite(Number(cfg.lat)) || !Number.isFinite(Number(cfg.lon))) return null;
    const md = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || ''));
    if (!md) return null;
    const day = E.computeDayInstant(cfg, Number(md[1]), Number(md[2]), Number(md[3]), deps);
    if (!day) return null;
    const tz = cfg.tz || '';
    const f = (ms) => fmtInTz(new Date(ms), tz);
    const timings = {};
    for (const p of E.ALL_DAYS) timings[p] = f(day.instants[p]);
    return {
      date: dateISO,
      timings,
      sun: {
        sunrise: f(day.sun.sunrise),
        sunset: f(day.sun.sunset),
        dhuhr: f(day.sun.dhuhr),
        midnight: f(day.sun.midnight),
        firstThird: f(day.sun.firstThird),
        lastThird: f(day.sun.lastThird),
      },
      // Absolute instants (ms) — logic layers (countdown, past/next) compare
      // these; the HH:MM strings above are display-only.
      instants: { ...day.instants },
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
