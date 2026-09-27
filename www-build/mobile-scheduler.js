'use strict';

/**
 * Mobile scheduler bridge (Android/Capacitor).
 * Computes prayer times locally with the same adhan lib and settings as the
 * desktop scheduler (METHOD_MAP, madhab, offsets, per-prayer toggles), and
 * schedules native local notifications for the next 3 days:
 *   - at adhan time:          "Dhuhr — It is time for Dhuhr"
 *   - pre-alert (per prayer): "Dhuhr in 10 minutes"
 *
 * Exposed as window.ptMobile = { setConfig } — app.js calls setConfig on every
 * relevant config/location change and on every app resume/focus.
 */

import {
  Coordinates, CalculationMethod, PrayerTimes, Prayer, Madhab,
} from 'adhan';
import { LocalNotifications } from '@capacitor/local-notifications';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

// AlAdhan method IDs → adhan-package methods (mirrors main/scheduler.js)
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

const isAndroid = () => {
  try { return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(); } catch (e) { return false; }
};

function paramsFor(cfg) {
  const m = Number(cfg.method);
  const factory = METHOD_MAP[m] || METHOD_MAP[3];
  const params = factory();
  if (m === 2 || m === 15) {
    params.madhab = cfg.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  }
  return params;
}

function dayTimes(cfg, date) {
  const pt = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), date, paramsFor(cfg));
  const out = {};
  out.Fajr = pt.fajr;
  out.Sunrise = pt.sunrise;
  out.Dhuhr = pt.dhuhr;
  out.Asr = pt.asr;
  out.Maghrib = pt.maghrib;
  out.Isha = pt.isha;
  for (const p of PRAYERS) {
    const off = (cfg.offsets && cfg.offsets[p]) || 0;
    if (off) out[p] = new Date(out[p].getTime() + off * 60000);
  }
  return out;
}

function scheduleKey(prayer, date, kind) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  return `${prayer}|${y}${m}${d}|${kind}`;
}

let lastSig = '';

async function reschedule(cfg) {
  if (!cfg || !Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lon)) return;

  // On Android, pre-alerts and adhan notifications are governed by the same
  // master toggle the renderer already exposes (cfg.notif).
  const wantNotifications = !!cfg.notif && isAndroid();
  if (!wantNotifications) {
    try { await LocalNotifications.cancel({ notifications: [] }); } catch (e) { /* none */ }
    // still expose times for the UI
    const today = dayTimes(cfg, new Date());
    window.ptMobile.times = today;
    return;
  }

  // Ask once for the Android 13+ permission
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
  } catch (e) { /* older Android */ }

  // Exact-alarm permission (Android 12+): request via the plugin's channel setup;
  // if not granted, notifications still arrive but may be batched by the OS.
  try {
    await LocalNotifications.createChannel({
      id: 'prayer',
      name: 'Prayer times',
      importance: 5, // high → heads-up
      visibility: 'PUBLIC',
      vibration: true,
      sound: 'notifsound.wav',
    });
  } catch (e) { /* channel exists */ }

  const notifications = [];
  const today = new Date();
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
    const times = dayTimes(cfg, date);
    if (dayOffset === 0) window.ptMobile.times = times;

    for (const p of PRAYERS) {
      if (cfg.adhanPerPrayer && cfg.adhanPerPrayer[p] === false) continue;
      const at = times[p];
      if (at.getTime() <= Date.now()) continue;

      notifications.push({
        id: Math.abs(hash(scheduleKey(p, date, 'adhan'))) % 2000000000,
        schedule: { at, allowWhileIdle: true },
        title: p + (cfg.lang === 'ar' ? ' — ' + PRAYER_AR[p] : ''),
        body: cfg.lang === 'ar' ? `حان الآن وقت صلاة ${PRAYER_AR[p]}` : `It is time for ${p}`,
        channelId: 'prayer',
      });

      const pre = (cfg.preMin && cfg.preMin[p]) || 0;
      if (pre > 0) {
        const preAt = new Date(at.getTime() - pre * 60000);
        if (preAt.getTime() > Date.now()) {
          notifications.push({
            id: Math.abs(hash(scheduleKey(p, date, 'pre'))) % 2000000000,
            schedule: { at: preAt, allowWhileIdle: true },
            title: p,
            body: cfg.lang === 'ar'
              ? `${PRAYER_AR[p]} بعد ${pre} دقيقة`
              : `${p} is in ${pre} minutes`,
            channelId: 'prayer',
          });
        }
      }
    }
  }

  try {
    const existing = await LocalNotifications.getPending();
    if (existing.notifications.length) {
      await LocalNotifications.cancel({ notifications: existing.notifications.map(n => ({ id: n.id })) });
    }
    // cap at 64 like Android's alarm window; we schedule 3 days (max 30 entries)
    for (let i = 0; i < notifications.length; i += 40) {
      await LocalNotifications.schedule({ notifications: notifications.slice(i, i + 40) });
    }
  } catch (e) {
    console.warn('mobile schedule failed:', e && e.message);
  }
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

window.ptMobile = {
  times: null,
  setConfig(cfg) {
    window.ptMobile._cfg = cfg;
    const sig = JSON.stringify([cfg.lat, cfg.lon, cfg.method, cfg.madhab, cfg.offsets, cfg.preMin, cfg.adhanPerPrayer, cfg.notif, cfg.lang]);
    if (sig === lastSig) return;
    lastSig = sig;
    reschedule(cfg);
  },
  reschedule() {
    if (window.ptMobile._cfg) reschedule(window.ptMobile._cfg);
  },
};
