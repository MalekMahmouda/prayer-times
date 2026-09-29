'use strict';

/**
 * Mobile scheduler bridge (Android/Capacitor).
 *
 * Computes prayer times with the SHARED contract (window.PT_ENGINE, the same
 * file the desktop scheduler uses) — so method/madhab/offsets/date-convention
 * are identical on Windows, Android and web — and schedules native local
 * notifications for the coming week:
 *   - at adhan time:          "Dhuhr — It is time for Dhuhr"
 *   - pre-alert (per prayer): "Dhuhr in 10 minutes"  (per-prayer preMin,
 *     falling back to notifMin — same precedence as the desktop scheduler)
 *
 * Reliability rules:
 *   - IDs are ours only: deterministic hash IDs, tracked in localStorage and
 *     cancelled by ID. We never blind-cancel every app notification, and the
 *     notifications-off path removes our stale alarms too.
 *   - Sound: the high-importance channel + vibration → system default sound.
 *     No reference to any bundled sound file (nothing to 404 on-device).
 *   - Reschedules are debounced and serialized; a config signature dedups
 *     no-op pushes (device timezone participates, so a tz/DST change
 *     reschedules even when the app was open the whole time).
 *   - Horizon: 7 days, hard-capped (MAX_NOTIFS) so the 500-alarm OS budget is
 *     never approached; schedule batches stay well under Android limits.
 *
 * Exposed as window.ptMobile = { setConfig, reschedule, notifStatus, times } —
 * app.js calls setConfig on every relevant config/location change and on
 * every app resume/focus.
 */

import { LocalNotifications } from '@capacitor/local-notifications';

const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

const DAYS = 7;                 // schedule horizon (days)
const MAX_NOTIFS = 80;          // hard cap: 5 prayers × 7 days × 2 + margin
const BATCH = 40;               // per schedule() call (Android-safe)
const DEBOUNCE_MS = 500;
const IDS_KEY = 'ptm-notif-ids'; // persisted list of OUR pending notification IDs

const isAndroid = () => {
  try { return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform(); } catch (e) { return false; }
};

/* Pre-alert minutes — mirrors desktop parseNotifMin: 0 is valid (alert at the
   prayer instant), invalid → default 10, out-of-range → clamped. */
function parsePreMin(v) {
  if (v == null || v === '') return 10;
  const n = Number(v);
  if (!Number.isFinite(n)) return 10;
  return Math.min(120, Math.max(0, Math.round(n)));
}

/* Day instants for the calendar date (y, m, d) via the shared contract.
   Returns { Fajr..Isha } in absolute ms, or null when the engine is absent. */
function dayInstants(cfg, y, m, d) {
  const E = window.PT_ENGINE, deps = window.__ptAdhan;
  if (!E || !deps) return null;
  const day = E.computeDayInstant(cfg, y, m, d, deps);
  return day ? day.instants : null;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}
function scheduleKey(prayer, y, m, d, kind) {
  return `${prayer}|${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}|${kind}`;
}
const notifId = (key) => Math.abs(hash(key)) % 2000000000;

/* ── Our-IDs-only bookkeeping (never cancel notifications we did not create) ── */
function loadOurIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(IDS_KEY) || '[]');
    return Array.isArray(ids) ? ids.filter((n) => Number.isInteger(n)) : [];
  } catch (e) { return []; }
}
function saveOurIds(ids) {
  try { localStorage.setItem(IDS_KEY, JSON.stringify(ids)); } catch (e) { /* non-fatal */ }
}
async function cancelOurs() {
  const ids = loadOurIds();
  if (!ids.length) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch (e) { /* already gone */ }
  saveOurIds([]);
}

/* ── Core reschedule ── */
async function reschedule(cfg) {
  if (!cfg || !Number.isFinite(Number(cfg.lat)) || !Number.isFinite(Number(cfg.lon))) return;
  const E = window.PT_ENGINE, deps = window.__ptAdhan;
  if (!E || !deps) return; // engine not loaded yet — the next setConfig/reschedule retries

  const wantNotifications = !!cfg.notif && isAndroid();

  if (!wantNotifications) {
    await cancelOurs(); // remove OUR stale alarms; touch nothing else
    const today = E.zonedToday(cfg.tz || '', new Date());
    window.ptMobile.times = dayInstants(cfg, today.y, today.m, today.d);
    return;
  }

  // Android 13+ notification permission (ask once per session).
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return;
    }
  } catch (e) { /* older Android */ }

  // High-importance channel → heads-up + system default sound + vibration.
  try {
    await LocalNotifications.createChannel({
      id: 'prayer',
      name: 'Prayer times',
      importance: 5, // high
      visibility: 'PUBLIC',
      vibration: true,
    });
  } catch (e) { /* channel exists */ }

  const notifications = [];
  // "Today" in the LOCATION's timezone when known (device-local otherwise).
  const locToday = E.zonedToday(cfg.tz || '', new Date());
  for (let dayOffset = 0; dayOffset < DAYS && notifications.length < MAX_NOTIFS; dayOffset++) {
    const dayCursor = new Date(locToday.y, locToday.m - 1, locToday.d + dayOffset);
    const y = dayCursor.getFullYear(), m = dayCursor.getMonth() + 1, d = dayCursor.getDate();
    const instants = dayInstants(cfg, y, m, d);
    if (!instants) continue;
    if (dayOffset === 0) window.ptMobile.times = instants;

    for (const p of PRAYERS) {
      if (notifications.length >= MAX_NOTIFS) break;
      if (cfg.adhanPerPrayer && cfg.adhanPerPrayer[p] === false) continue;
      const atMs = instants[p];
      if (atMs <= Date.now()) continue;

      notifications.push({
        id: notifId(scheduleKey(p, y, m, d, 'adhan')),
        schedule: { at: new Date(atMs), allowWhileIdle: true },
        title: p + (cfg.lang === 'ar' ? ' — ' + PRAYER_AR[p] : ''),
        body: cfg.lang === 'ar' ? `حان الآن وقت صلاة ${PRAYER_AR[p]}` : `It is time for ${p}`,
        channelId: 'prayer',
      });

      const pre = parsePreMin((cfg.preMin && cfg.preMin[p] != null) ? cfg.preMin[p] : cfg.notifMin);
      if (pre > 0) {
        const preAt = atMs - pre * 60000;
        if (preAt > Date.now()) {
          notifications.push({
            id: notifId(scheduleKey(p, y, m, d, 'pre')),
            schedule: { at: new Date(preAt), allowWhileIdle: true },
            title: p,
            body: cfg.lang === 'ar' ? `${PRAYER_AR[p]} بعد ${pre} دقيقة` : `${p} is in ${pre} minutes`,
            channelId: 'prayer',
          });
        }
      }
    }
  }

  try {
    await cancelOurs(); // reschedule = replace OUR alarms, nothing else
    for (let i = 0; i < notifications.length; i += BATCH) {
      await LocalNotifications.schedule({ notifications: notifications.slice(i, i + BATCH) });
    }
    saveOurIds(notifications.map((n) => n.id));
  } catch (e) {
    console.warn('mobile schedule failed:', e && e.message);
  }
}

/* ── Debounce + serialize: one logical config change → one reschedule ── */
let lastSig = '';
let debounceTimer = null;
let chain = Promise.resolve();

function requestSchedule(cfg) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    chain = chain
      .then(() => reschedule(cfg))
      .catch((e) => console.warn('mobile schedule failed:', e && e.message));
  }, DEBOUNCE_MS);
}

window.ptMobile = {
  times: null,
  setConfig(cfg) {
    window.ptMobile._cfg = cfg;
    // Device timezone participates in the signature: a timezone/DST change
    // while the app is open invalidates the schedule and reschedules.
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
    const sig = JSON.stringify([cfg && cfg.lat, cfg && cfg.lon, cfg && cfg.method, cfg && cfg.madhab,
      cfg && cfg.offsets, cfg && cfg.preMin, cfg && cfg.notifMin, cfg && cfg.adhanPerPrayer,
      cfg && cfg.notif, cfg && cfg.lang, cfg && cfg.tz, tz]);
    if (sig === lastSig) return;
    lastSig = sig;
    requestSchedule(cfg);
  },
  // Resume / explicit refresh: bypass the signature (state may have changed
  // while the app was away), still debounced + serialized.
  reschedule() {
    if (window.ptMobile._cfg) requestSchedule(window.ptMobile._cfg);
  },
  // Honest status for the settings UI (notification + exact-alarm permissions).
  async notifStatus() {
    const out = { display: 'unknown', exact: window.ptMobile.exactAlarms || 'unknown' };
    try { out.display = (await LocalNotifications.checkPermissions()).display; } catch (e) { /* web */ }
    return out;
  },
};

// Exact-alarm capability (Android 12+): if revoked, alarms may be batched by
// the OS (inexact) — in-app times are unaffected. The settings page surfaces
// this honestly instead of claiming exact timing.
try {
  LocalNotifications.checkExactNotificationSetting()
    .then((s) => { window.ptMobile.exactAlarms = s.exact; })
    .catch(() => { window.ptMobile.exactAlarms = 'unknown'; });
} catch (e) { window.ptMobile.exactAlarms = 'unsupported'; }
