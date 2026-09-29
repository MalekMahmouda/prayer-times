'use strict';

/**
 * Prayer scheduler — runs in the Electron MAIN process.
 *
 * THE authoritative source for when prayers happen. Computes times locally
 * with the `adhan` package, keeps a short fire loop that survives renderer
 * suspension, window close, tray-only mode — and detects missed windows
 * after system sleep/resume via interval comparison (not a tiny fixed
 * grace window), so a prayer that arrived while the machine slept still
 * fires exactly once.
 *
 * Fire logic (per tick):
 *   1. Record now; if the local date changed → recalc today's schedule.
 *   2. Window = [lastTickAt − graceMs, now]. Every scheduled instant inside
 *      the window is processed (pre-alert / prayer-time / adhan), each once,
 *      tracked by keys 'YYYY-MM-DD:Prayer:prealert' and 'YYYY-MM-DD:Prayer:adhan'.
 *   3. Old-day keys are pruned on rollover so yesterday can never fire after
 *      midnight — and tomorrow's fresh keys are unblocked.
 *
 * notifMin = 0 is valid (alert exactly at prayer time); parsing is explicit
 * (never `Number(x) || 10`), invalid → default, out-of-range → clamped.
 *
 * Volume resolution for the adhan event: per-prayer profile → global → 1,
 * always clamped to 0.0–1.0.
 *
 * Logging: dev-only (PT_DEBUG=1 or unpackaged Electron). Production stays quiet.
 */

const { Coordinates, CalculationMethod, PrayerTimes, Prayer, Madhab, SunnahTimes } = require('adhan');
const { EventEmitter } = require('events');
const { clampVolume } = require('./adhan-files');

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// Grace: how far BEFORE the window-start a scheduled instant may still count.
// A tick arriving 5 min late (sleep) still owns a prayer that fell 5 min ago.
const GRACE_MS = 5 * 60 * 1000;

// AlAdhan method IDs (used by the renderer UI) → adhan-package methods
const METHOD_MAP = {
  3: () => CalculationMethod.MuslimWorldLeague(),
  4: () => CalculationMethod.UmmAlQura(),
  2: () => CalculationMethod.NorthAmerica(), // AlAdhan id 2 = ISNA (18°/18°)
  1: () => CalculationMethod.Karachi(),
  5: () => CalculationMethod.Egyptian(),
  8: () => CalculationMethod.Dubai(),
  9: () => CalculationMethod.Kuwait(),
  10: () => CalculationMethod.Qatar(),
};

function createScheduler() {
  // Events: 'pre-alert', 'prayer-time', 'adhan', 'times-updated'
  const bus = new EventEmitter();

  const state = {
    cfg: null,
    pt: null,
    dayKey: null,
    firedPrayerKeys: new Set(), // 'YYYY-MM-DD:Prayer:prealert' / ':adhan'
    lastTickAt: Date.now(),
    lastScheduleDate: null,     // local YYYY-MM-DD the in-memory schedule belongs to
    lastInfo: null,
    clock: () => Date.now(),    // replaceable for tests (fake clock)
  };

  let logEnabled = null;
  function dlog(...args) {
    if (logEnabled == null) {
      logEnabled = process.env.PT_DEBUG === '1'
        || (!!process.versions.electron && !process.env.NODE_DISABLE_COLORS && !appIsPackaged());
    }
    if (logEnabled) console.log('[Scheduler]', ...args);
  }
  function appIsPackaged() {
    try { return require('electron').app.isPackaged; } catch (e) { return false; }
  }
  function elog(...args) {
    console.error('[Scheduler]', ...args); // errors always logged (rare)
  }

  const todayKey = (d) => {
    const x = d || new Date(state.clock());
    const y = x.getFullYear(), m = String(x.getMonth() + 1).padStart(2, '0'), dd = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const hhmmss = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return [h, m, ss].map((v) => String(v).padStart(2, '0')).join(':');
  };

  // Display formatting in the ACTIVE LOCATION's IANA timezone when provided
  // (firing logic always uses absolute instants and needs no conversion).
  function fmtInTz(d, tz) {
    if (!tz) return hhmm(d);
    try {
      return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
    } catch (e) { return hhmm(d); }
  }

  /**
   * Explicitly parse and validate the minutes-before setting.
   * 0 is valid (alert exactly at prayer time). Invalid → default.
   * Out of range → clamped. Returns an integer 0..max.
   */
  function parseNotifMin(v, { def = 10, min = 0, max = 120 } = {}) {
    if (v == null || v === '') return def;
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    const i = Math.round(n);
    if (i < min) return min;   // clamp, don't swap in the default
    if (i > max) return max;
    return i;
  }

  function paramsFor(cfg) {
    const m = Number(cfg.method);
    const factory = METHOD_MAP[m] || METHOD_MAP[3];
    const params = factory();
    // Universal: the user's Asr school applies to ALL methods (platform.js
    // does the same) — Hanafi changes displayed AND scheduled Asr everywhere.
    params.madhab = cfg.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
    return params;
  }

  // Full day info for an arbitrary ISO date — used by the calendar & sun section.
  function getDay(dateISO, overrides) {
    const cfg = { ...(state.cfg || {}), ...(overrides || {}) };
    if (!Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) return null;
    const date = new Date(`${dateISO}T12:00:00`); // midday avoids DST edge cases
    if (isNaN(date.getTime())) return null;
    const tz = cfg.tz || '';
    const fmtT = (d) => fmtInTz(d, tz);
    const pt = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), date, paramsFor(cfg));
    const st = new SunnahTimes(pt);
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
        Fajr: fmtT(new Date(pt.fajr.getTime() + off('Fajr') * 60000)),
        Sunrise: fmtT(pt.sunrise),
        Dhuhr: fmtT(new Date(pt.dhuhr.getTime() + off('Dhuhr') * 60000)),
        Asr: fmtT(new Date(pt.asr.getTime() + off('Asr') * 60000)),
        Maghrib: fmtT(new Date(pt.maghrib.getTime() + off('Maghrib') * 60000)),
        Isha: fmtT(new Date(pt.isha.getTime() + off('Isha') * 60000)),
      },
      sun: {
        sunrise: fmtT(pt.sunrise),
        sunset: fmtT(pt.maghrib),
        dhuhr: fmtT(pt.dhuhr),
        midnight: fmtT(midnight),
        firstThird: fmtT(firstThird),
        lastThird: fmtT(st.lastThirdOfTheNight),
      },
      hijriOffsetDays: 0,
    };
  }

  function compute(cfg) {
    const coords = new Coordinates(cfg.lat, cfg.lon);
    const dayKey = todayKey();
    const date = new Date(state.clock());
    const pt = new PrayerTimes(coords, date, paramsFor(cfg));

    state.cfg = cfg;
    state.pt = pt;
    state.dayKey = dayKey;
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

  function buildInfo(pt, dayKey) {
    const cfg = state.cfg || {};
    const tz = cfg.tz || '';
    const fmtT = (d) => fmtInTz(d, tz);
    const now = state.clock();
    const sched = scheduleFor(pt).map((e) => ({ ...e, ms: e.at.getTime(), hhmm: fmtT(e.at) }));
    let next = sched.find((e) => e.ms > now);
    if (!next) {
      // All of today's prayers passed — compute tomorrow's Fajr.
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const pt2 = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), tomorrow, paramsFor(cfg));
      const fajrOff = (cfg.offsets && cfg.offsets.Fajr) || 0;
      const at = new Date(pt2.timeForPrayer(Prayer.Fajr).getTime() + fajrOff * 60000);
      next = { prayer: 'Fajr', at, hhmm: fmtT(at), ms: at.getTime() };
    }
    return {
      dayKey,
      method: cfg.method,
      lang: cfg.lang || 'en',
      times: sched.map(({ prayer, hhmm: hm }) => ({ prayer, time: hm })),
      next: { prayer: next.prayer, hhmm: next.hhmm, countdown: hhmmss(next.ms - now) },
    };
  }

  function recompute() {
    if (!state.cfg || state.cfg.lat == null) return;
    const { pt, dayKey } = compute(state.cfg);
    if (state.lastScheduleDate !== dayKey) {
      dlog(`Date change: ${state.lastScheduleDate || '(none)'} → ${dayKey} — recalculated schedule`);
      state.lastScheduleDate = dayKey;
      // Prune fire-keys of other days so tomorrow's prayers can fire — and so
      // a yesterday key can never fire after midnight.
      let pruned = 0;
      for (const k of [...state.firedPrayerKeys]) {
        if (!k.startsWith(`${dayKey}:`)) { state.firedPrayerKeys.delete(k); pruned++; }
      }
      if (pruned) dlog(`Pruned ${pruned} fire-key(s) from previous day(s)`);
    }
    state.lastInfo = buildInfo(pt, dayKey);
    bus.emit('times-updated', state.lastInfo);
  }

  // The renderer validates config before sending; this is a light sanity pass.
  function isSane(cfg) {
    return cfg && Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon)
      && Math.abs(cfg.lat) <= 90 && Math.abs(cfg.lon) <= 180
      && (cfg.offsets == null || typeof cfg.offsets === 'object');
  }

  function resolveVolume(prayer) {
    const cfg = state.cfg || {};
    const prof = cfg.adhanProfiles && cfg.adhanProfiles[prayer];
    const raw = prof && prof.vol != null ? prof.vol : cfg.adhanVol;
    return clampVolume(raw, 1);
  }

  function tick() {
    const cfg = state.cfg;
    if (!cfg || state.pt == null) return;

    const now = state.clock();
    const windowStart = state.lastTickAt - GRACE_MS; // tolerate a late previous tick
    state.lastTickAt = now;

    // Day rollover → recalc for the new day (also prunes old fire-keys).
    if (todayKey() !== state.dayKey) recompute();

    const dayKey = state.dayKey;
    const sched = scheduleFor(state.pt);
    if (!sched.length) return;

    if (state.lastLoggedSchedule !== dayKey) {
      dlog(`Scheduled (${dayKey} @ ${cfg.lat.toFixed(3)},${cfg.lon.toFixed(3)}):`
        + sched.map((e) => ` ${e.prayer} ${hhmm(e.at)}`).join(','));
      state.lastLoggedSchedule = dayKey;
    }
    const nowD = new Date(now);
    dlog(`Current: ${hhmm(nowD)}:${String(nowD.getSeconds()).padStart(2, '0')} — next ${state.lastInfo && state.lastInfo.next ? `${state.lastInfo.next.prayer} ${state.lastInfo.next.hhmm}` : '?'}`);

    for (const { prayer, at } of sched) {
      const atMs = at.getTime();

      // ── Pre-prayer alert (separate namespace; never suppresses prayer-time/adhan)
      const preMin = parseNotifMin(
        (cfg.preMin && cfg.preMin[prayer] != null) ? cfg.preMin[prayer] : cfg.notifMin,
        { def: 10, min: 0, max: 120 },
      );
      const preAt = atMs - preMin * 60000;
      // Eligible if its moment falls inside this tick's window. A stale
      // pre-alert (prayer already passed during a sleep gap) is skipped —
      // the prayer-time notification covers it — EXCEPT notifMin=0, whose
      // alert lives exactly at the prayer instant.
      const preEligible = preAt >= windowStart && preAt <= now && (preMin === 0 || atMs > now);
      if (cfg.notif && preEligible) {
        const preKey = `${dayKey}:${prayer}:prealert`;
        if (!state.firedPrayerKeys.has(preKey)) {
          state.firedPrayerKeys.add(preKey);
          dlog(`Pre-alert: ${prayer} (T−${preMin} min)`);
          bus.emit('pre-alert', { prayer, minutes: preMin, lang: cfg.lang || 'en', dayKey });
        }
      }

      // ── Prayer time / adhan (missed-window detection via tick interval)
      if (atMs >= windowStart && atMs <= now) {
        const adhanKey = `${dayKey}:${prayer}:adhan`;
        if (state.firedPrayerKeys.has(adhanKey)) {
          dlog(`Skip: ${prayer} already fired today`);
          continue;
        }
        state.firedPrayerKeys.add(adhanKey);
        dlog(`Prayer: ${prayer} at ${hhmm(at)}${atMs < now - GRACE_MS ? ' (recovered after gap)' : ''}`);
        if (cfg.notif) {
          bus.emit('prayer-time', { prayer, time: hhmm(at), lang: cfg.lang || 'en', dayKey });
          dlog('Notification: sent');
        }
        const adhanOn = cfg.adhan && !(cfg.adhanPerPrayer && cfg.adhanPerPrayer[prayer] === false);
        if (adhanOn) {
          const vol = resolveVolume(prayer);
          dlog(`Adhan: triggered (volume ${Math.round(vol * 100)}%)`);
          bus.emit('adhan', { prayer, time: hhmm(at), lang: cfg.lang || 'en', volume: vol, dayKey });
        }
      }
    }

    // Refresh the tray countdown between full rebuilds (display only).
    if (state.lastInfo && state.lastInfo.next) {
      const next = state.lastInfo.next;
      const e = sched.find((x) => x.at.getTime() > now);
      if (e) next.countdown = hhmmss(e.at.getTime() - now);
    }
  }

  return {
    bus,
    getDay,
    updateConfig(cfg) {
      if (!isSane(cfg)) {
        elog('Invalid config rejected:', JSON.stringify(cfg && { lat: cfg.lat, lon: cfg.lon, method: cfg.method }));
        return { ok: false, error: 'invalid coordinates' };
      }
      const prev = state.cfg;
      state.cfg = cfg;
      // (Re)compute whenever config or the day changed.
      if (!prev || prev.lat !== cfg.lat || prev.lon !== cfg.lon || prev.method !== cfg.method
        || prev.madhab !== cfg.madhab || prev.tz !== cfg.tz
        || JSON.stringify(prev.offsets || {}) !== JSON.stringify(cfg.offsets || {})
        || !state.pt) {
        dlog('Config change — recalculating schedule');
        recompute();
      }
      return { ok: true };
    },
    getInfo() { return state.lastInfo; },
    recompute,
    tick,
    notifyResumed() {
      const now = state.clock();
      const gap = now - state.lastTickAt;
      dlog(`Resume/late tick after ${Math.round(gap / 1000)}s — re-evaluating missed window`);
      if (todayKey() !== state.dayKey) recompute(); // sleep crossed midnight
      // Deliberately do NOT advance lastTickAt here: tick() compares against
      // the pre-sleep timestamp, so anything that happened while asleep sits
      // inside the recovery window and fires exactly once.
      tick();
    },
    _state: state, // exposed for tests only
    _parseNotifMin: parseNotifMin,
    _setClock(fn) { state.clock = fn; state.lastTickAt = fn(); },
  };
}

module.exports = { createScheduler, PRAYERS };
