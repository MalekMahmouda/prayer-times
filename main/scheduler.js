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
// Shared calculation contract — the SAME METHOD_MAP / madhab / date convention
// used by the Android scheduler and the web platform adapter.
const Engine = require('../shared/pt-engine.js');

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

// Grace: how far BEFORE the window-start a scheduled instant may still count.
// A tick arriving 5 min late (sleep) still owns a prayer that fell 5 min ago.
const GRACE_MS = 5 * 60 * 1000;

// Method/madhab resolution lives in the shared contract (single copy for
// desktop, Android and web — universal madhab included).
function paramsFor(cfg) {
  return Engine.paramsFor(cfg, { CalculationMethod, Madhab });
}

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

  // The scheduler's calendar day follows the ACTIVE LOCATION's timezone,
  // not the device's: a Riyadh location must not lose Fajr just because the
  // computer's own clock is still on the previous date. Empty tz →
  // device-local day (unchanged legacy behavior).
  const zonedDay = (cfg, ms) => Engine.zonedToday((cfg && cfg.tz) || '', new Date(ms == null ? state.clock() : ms));

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

  // paramsFor(cfg) — defined once at module level, delegating to the shared
  // contract (Engine.paramsFor) so desktop, Android and web stay identical.

  // Full day info for an arbitrary ISO date — used by the calendar & sun section.
  // Delegates to the shared contract; identical math on Android and web.
  function getDay(dateISO, overrides) {
    const cfg = { ...(state.cfg || {}), ...(overrides || {}) };
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateISO || ''));
    if (!m) return null;
    const day = Engine.computeDayInstant(
      cfg, Number(m[1]), Number(m[2]), Number(m[3]),
      { Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab },
    );
    if (!day) return null;
    const tz = cfg.tz || '';
    const fmtT = (ms) => fmtInTz(new Date(ms), tz);
    const timings = {};
    for (const p of Engine.ALL_DAYS) timings[p] = fmtT(day.instants[p]);
    return {
      date: dateISO,
      timings,
      sun: {
        sunrise: fmtT(day.sun.sunrise),
        sunset: fmtT(day.sun.sunset),
        dhuhr: fmtT(day.sun.dhuhr),
        midnight: fmtT(day.sun.midnight),
        firstThird: fmtT(day.sun.firstThird),
        lastThird: fmtT(day.sun.lastThird),
      },
      // Absolute instants (ms) — display layers format; logic layers compare.
      instants: { ...day.instants },
      hijriOffsetDays: 0,
    };
  }

  function compute(cfg) {
    const coords = new Coordinates(cfg.lat, cfg.lon);
    // Fire-day = the LOCATION's calendar date (see zonedDay above), built via
    // the shared contract's local-noon convention (shared/pt-engine.js).
    const day = zonedDay(cfg);
    const date = new Date(day.y, day.m - 1, day.d, 12);
    const pt = new PrayerTimes(coords, date, paramsFor(cfg));

    state.cfg = cfg;
    state.pt = pt;
    state.dayKey = day.key;
    return { pt, dayKey: day.key };
  }

  // True fire datetimes for today, with per-prayer minute offsets applied.
  // `ms` is the absolute instant used by ALL firing logic (strings are display-only).
  function scheduleFor(pt) {
    return PRAYERS.map((p) => {
      const base = pt.timeForPrayer(Prayer[p]);
      const off = (state.cfg && state.cfg.offsets && state.cfg.offsets[p]) || 0;
      const t = new Date(base.getTime() + off * 60000);
      return { prayer: p, at: t, ms: t.getTime(), hhmm: hhmm(t) };
    });
  }

  function buildInfo(pt, dayKey) {
    const cfg = state.cfg || {};
    const tz = cfg.tz || '';
    const fmtT = (d) => fmtInTz(d, tz);
    const now = state.clock();
    const sched = scheduleFor(pt).map((e) => ({ ...e, hhmm: fmtT(e.at) }));
    let next = sched.find((e) => e.ms > now);
    if (!next) {
      // All of today's prayers passed — compute tomorrow's Fajr.
      // Tomorrow on the LOCATION's calendar: +24 h then re-derive the
      // location-local date (correct across zone/DST edges).
      const day2 = zonedDay(cfg, now + 86400000);
      const pt2 = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), new Date(day2.y, day2.m - 1, day2.d, 12), paramsFor(cfg));
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
    // The day belongs to the LOCATION's calendar (zonedDay), not the device's.
    if (zonedDay(cfg).key !== state.dayKey) recompute();

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
      if (zonedDay(state.cfg).key !== state.dayKey) recompute(); // sleep crossed (location) midnight
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
