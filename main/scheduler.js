'use strict';

/**
 * Prayer scheduler — runs in the Electron MAIN process.
 *
 * Computes prayer times locally (offline) with the `adhan` package and keeps
 * a 30-second fire loop that survives renderer suspension and window close.
 * The renderer (AlAdhan API) remains the display source of truth; this module
 * is the independent firing source for alerts/adhan.
 *
 * NOTE: computed times use the system timezone. This is exact for the normal
 * case (user is physically at the configured location). For a far-away manual
 * city, display times still come from the AlAdhan API (timezone-correct);
 * only main-process alerts/adhan would fire on system-localclock times.
 */

const { Coordinates, CalculationMethod, PrayerTimes, Prayer, Madhab, SunnahTimes } = require('adhan');
const { EventEmitter } = require('events');

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// AlAdhan method IDs (used by the renderer UI) → adhan-package methods
const METHOD_MAP = {
  3: () => CalculationMethod.MuslimWorldLeague(),
  4: () => CalculationMethod.UmmAlQura(),
  2: () => CalculationMethod.Other(),
  1: () => CalculationMethod.Karachi(),
  5: () => CalculationMethod.Egyptian(),
  8: () => CalculationMethod.Dubai(),
  9: () => CalculationMethod.Kuwait(),
  10: () => CalculationMethod.Qatar(),
};

function createScheduler() {
  // Events: 'pre-alert' (prayer, minutes), 'adhan' (prayer), 'times-updated'
  const bus = new EventEmitter();

  const state = {
    cfg: null,          // { lat, lon, method, offsets{}, notifMin, notif, beep, adhan, adhanPerPrayer{}, lang, hijriOffsetDays }
    pt: null,           // PrayerTimes for today (local)
    dayKey: null,       // 'YYYY-MM-DD' (local) the times belong to
    fired: new Set(),   // fire-once keys: '<prayer>|<dayKey>|pre|<min>' / '<prayer>|<dayKey>|adhan'
    lastInfo: null,     // payload sent to tray/renderer
  };

  const todayKey = (d = new Date()) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const hhmmss = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return [h, m, ss].map((v) => String(v).padStart(2, '0')).join(':');
  };

  function paramsFor(cfg) {
    const m = Number(cfg.method);
    const factory = METHOD_MAP[m] || METHOD_MAP[3];
    const params = factory();
    // ISNA and Other follow the user's Asr school (Shafi standard / Hanafi).
    if (m === 2 || m === 15) {
      params.madhab = cfg.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
    }
    return params;
  }

  // Full day info for an arbitrary ISO date — used by the calendar & sun section.
  function getDay(dateISO, overrides) {
    const cfg = { ...(state.cfg || {}), ...(overrides || {}) };
    if (!Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) return null;
    const date = new Date(`${dateISO}T12:00:00`); // midday avoids DST edge cases
    if (isNaN(date.getTime())) return null;
    const pt = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), date, paramsFor(cfg));
    const st = new SunnahTimes(pt);
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const off = (p) => (cfg.offsets && cfg.offsets[p]) || 0;
    const sunset = pt.timeForPrayer(Prayer.Maghrib);
    const midnight = st.middleOfTheNight;
    // First third = sunset + one third of the full night (sunset → tomorrow's Fajr)
    const tomorrow = new Date(date); tomorrow.setDate(tomorrow.getDate() + 1);
    const fajrNext = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), tomorrow, paramsFor(cfg)).fajr;
    const firstThird = new Date(sunset.getTime() + (fajrNext.getTime() - sunset.getTime()) / 3);
    return {
      date: dateISO,
      timings: {
        Fajr: hhmm(new Date(pt.fajr.getTime() + off('Fajr') * 60000)),
        Sunrise: hhmm(pt.sunrise),
        Dhuhr: hhmm(new Date(pt.dhuhr.getTime() + off('Dhuhr') * 60000)),
        Asr: hhmm(new Date(pt.asr.getTime() + off('Asr') * 60000)),
        Maghrib: hhmm(new Date(pt.maghrib.getTime() + off('Maghrib') * 60000)),
        Isha: hhmm(new Date(pt.isha.getTime() + off('Isha') * 60000)),
      },
      sun: {
        sunrise: hhmm(pt.sunrise),
        sunset: hhmm(pt.maghrib),
        dhuhr: hhmm(pt.dhuhr),
        midnight: hhmm(midnight),
        firstThird: hhmm(firstThird),
        lastThird: hhmm(st.lastThirdOfTheNight),
      },
      hijriOffsetDays: 0,
    };
  }

  function compute(cfg) {
    const coords = new Coordinates(cfg.lat, cfg.lon);
    const dayKey = todayKey();
    const date = new Date();
    const pt = new PrayerTimes(coords, date, paramsFor(cfg));

    state.cfg = cfg;
    state.pt = pt;
    state.dayKey = dayKey;

    // Schedule keys are per computed day; a day rollover naturally allows re-firing.
    return { pt, dayKey };
  }

  // True fire datetimes for today, with per-prayer minute offsets applied.
  function scheduleFor(pt) {
    return PRAYERS.map((p) => {
      const base = pt.timeForPrayer(Prayer[p]);
      const off = (state.cfg && state.cfg.offsets && state.cfg.offsets[p]) || 0;
      const t = new Date(base.getTime() + off * 60000);
      return { prayer: p, at: t, hhmm: hhmm(t) };
    });
  }

  function recompute() {
    if (!state.cfg || state.cfg.lat == null) return;
    const { pt, dayKey } = compute(state.cfg);
    // Drop fire-keys of other days so tomorrow's prayers can fire.
    for (const k of [...state.fired]) if (!k.endsWith(`|${dayKey}`)) state.fired.delete(k);
    state.lastInfo = buildInfo(pt, dayKey);
    bus.emit('times-updated', state.lastInfo);
  }

  function buildInfo(pt, dayKey) {
    const cfg = state.cfg || {};
    const sched = scheduleFor(pt).map((e) => ({ ...e, ms: e.at.getTime() }));
    const now = Date.now();
    let next = sched.find((e) => e.ms > now);
    let tomorrowFirst = null;
    if (!next) {
      // All of today's prayers passed — compute tomorrow's Fajr.
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const pt2 = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), tomorrow, paramsFor(cfg));
      const fajrOff = (cfg.offsets && cfg.offsets.Fajr) || 0;
      const at = new Date(pt2.timeForPrayer(Prayer.Fajr).getTime() + fajrOff * 60000);
      tomorrowFirst = { prayer: 'Fajr', at, hhmm: hhmm(at), ms: at.getTime() };
      next = tomorrowFirst;
    }
    return {
      dayKey,
      method: cfg.method,
      lang: cfg.lang || 'en',
      times: sched.map(({ prayer, hhmm: hm }) => ({ prayer, time: hm })),
      next: next ? { prayer: next.prayer, hhmm: next.hhmm, countdown: hhmmss(next.ms - now) } : null,
    };
  }

  // The renderer validates config before sending; this is a light sanity pass.
  function isSane(cfg) {
    return cfg && Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon)
      && Math.abs(cfg.lat) <= 90 && Math.abs(cfg.lon) <= 180
      && (cfg.offsets == null || typeof cfg.offsets === 'object');
  }

  function tick() {
    const cfg = state.cfg;
    if (!cfg || state.pt == null) return;

    // Day rollover → recompute for the new day.
    if (todayKey() !== state.dayKey) recompute();

    const sched = scheduleFor(state.pt);
    const now = Date.now();
    const dayKey = state.dayKey;

    for (const { prayer, at } of sched) {
      const elapsedMs = now - at.getTime();

      // Pre-prayer alert: exactly cfg.notifMin before, 25s grace window.
      const preMin = Math.min(60, Math.max(1, cfg.notifMin || 10));
      const preAt = at.getTime() - preMin * 60000;
      const preKey = `${prayer}|${dayKey}|pre|${preMin}`;
      if (cfg.notif && elapsedMs < 0 && now >= preAt && now - preAt <= 25000 && !state.fired.has(preKey)) {
        state.fired.add(preKey);
        bus.emit('pre-alert', { prayer, minutes: preMin, lang: cfg.lang || 'en' });
      }

      // Adhan at prayer time: 25s grace window so system sleep/resume still fires it.
      const adhanKey = `${prayer}|${dayKey}|adhan`;
      if (elapsedMs >= 0 && elapsedMs <= 25000 && !state.fired.has(adhanKey)) {
        state.fired.add(adhanKey);
        // Notification at prayer time (renderer's cfg.notif equivalent).
        if (cfg.notif) bus.emit('prayer-time', { prayer, time: hhmm(at), lang: cfg.lang || 'en' });
        // Adhan audio: global toggle AND per-prayer toggle must both allow it.
        const adhanOn = cfg.adhan && !(cfg.adhanPerPrayer && cfg.adhanPerPrayer[prayer] === false);
        if (adhanOn) bus.emit('adhan', { prayer, time: hhmm(at), lang: cfg.lang || 'en' });
      }
    }

    // Refresh tray countdown strings.
    if (state.lastInfo) {
      const next = state.lastInfo.next;
      if (next) {
        const sched2 = scheduleFor(state.pt);
        const e = sched2.find((x) => x.ms > now) || null;
        next.countdown = e ? hhmmss(e.ms - now) : hhmmss(0);
      }
    }
  }

  return {
    bus,
    getDay,
    updateConfig(cfg) {
      if (!isSane(cfg)) return { ok: false, error: 'invalid config' };
      const prev = state.cfg;
      state.cfg = cfg;
      // (Re)compute whenever config or the day changed.
      if (!prev || prev.lat !== cfg.lat || prev.lon !== cfg.lon || prev.method !== cfg.method
        || JSON.stringify(prev.offsets || {}) !== JSON.stringify(cfg.offsets || {})
        || !state.pt) {
        recompute();
      }
      return { ok: true };
    },
    getInfo() { return state.lastInfo; },
    recompute,
    tick,
    _state: state,
  };
}

module.exports = { createScheduler, PRAYERS };
