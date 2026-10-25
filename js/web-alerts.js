'use strict';

/* Browser-only foreground scheduler. A service worker can SHOW notifications,
   not wake a closed/suspended page on a timer. Native platforms own their alarms. */
(function () {
  const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  const KEY = 'pt-web-alerts-fired-v1';
  let cfg = null, hooks = {}, lastTick = Date.now(), signature = '', schedule = [];
  let timer = null;
  const native = () => !!window.ptDesktop || !!(window.Capacitor && window.Capacitor.isNativePlatform());
  const minutes = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? 10 : Math.max(0, Math.min(120, Math.round(Number(v))));
  function permission() {
    if (!window.isSecureContext) return 'insecure';
    return window.Notification ? window.Notification.permission : 'unsupported';
  }
  function requestPermission() {
    // Called directly by a click, never by a timer/startup/resume.
    if (permission() !== 'default') return Promise.resolve(permission());
    try { return window.Notification.requestPermission(); } catch (e) { return Promise.resolve('denied'); }
  }
  async function notify(title, body, tag) {
    if (permission() !== 'granted') return false;
    const opts = { body, tag, icon: './icons/icon-256.png', silent: true, data: { url: './index.html#/prayers' } };
    try {
      // Mobile browsers generally require this instead of new Notification().
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) { await reg.showNotification(title, opts); return true; }
      new window.Notification(title, opts);
      return true;
    } catch (e) { if (hooks.onError) hooks.onError('notification'); return false; }
  }
  function claim(key, now) {
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { /* corrupt storage */ }
    if (seen[key]) return false;
    for (const k of Object.keys(seen)) if (now - seen[k] > 3 * 86400000) delete seen[k];
    seen[key] = now;
    try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {
      // Keep deduplication in memory if storage is unavailable.
      if (claim.memory.has(key)) return false;
      claim.memory.add(key);
    }
    return true;
  }
  claim.memory = new Set();
  function build(now) {
    const E = window.PT_ENGINE, deps = window.__ptAdhan;
    if (!E || !deps || !cfg || cfg.lat == null || cfg.lon == null || !Number.isFinite(Number(cfg.lat)) || !Number.isFinite(Number(cfg.lon))) return [];
    const day = E.zonedToday(cfg.tz || '', new Date(now));
    const sig = JSON.stringify([cfg, day.key]);
    if (sig === signature) return schedule;
    signature = sig; schedule = [];
    // Tomorrow's pre-alert may fall before today's midnight.
    for (let offset = 0; offset <= 1; offset++) {
      const date = new Date(day.y, day.m - 1, day.d + offset, 12);
      const result = E.computeDayInstant(cfg, date.getFullYear(), date.getMonth() + 1, date.getDate(), deps);
      if (!result) continue;
      const dayKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      for (const prayer of PRAYERS) {
        const at = result.instants[prayer];
        if (!Number.isFinite(at)) continue;
        const pre = minutes(cfg.preMin && cfg.preMin[prayer] != null ? cfg.preMin[prayer] : cfg.notifMin);
        if (pre > 0) schedule.push({ prayer, at: at - pre * 60000, prayerAt: at, pre, key: `${dayKey}:${prayer}:pre` });
        schedule.push({ prayer, at, prayerAt: at, pre: 0, key: `${dayKey}:${prayer}:adhan` });
      }
    }
    return schedule;
  }
  async function runTick(now) {
    const from = Math.max(lastTick, now - 60000); // no hours-old audio burst after sleep
    lastTick = now;
    if (!cfg || native()) return;
    for (const event of build(now)) {
      if (event.at <= from || event.at > now || (event.pre && event.prayerAt <= now)) continue;
      const sound = !event.pre && cfg.adhanEnabled && !(cfg.adhanPerPrayer && cfg.adhanPerPrayer[event.prayer] === false);
      if ((!cfg.notif && !sound) || (event.pre && !cfg.notif)) continue;
      if (!claim(event.key, now)) continue;
      const name = cfg.lang === 'ar' ? AR[event.prayer] : event.prayer;
      if (cfg.notif) {
        const body = event.pre
          ? (cfg.lang === 'ar' ? `${name} بعد ${event.pre} دقيقة` : `${name} is in ${event.pre} minutes`)
          : (cfg.lang === 'ar' ? `حان الآن وقت صلاة ${name}` : `It is time for ${name}`);
        // Do not hold audio behind a service-worker promise: timing is independent.
        void notify(name, body, event.key);
      }
      if (sound && hooks.onAdhan) hooks.onAdhan(event.prayer);
      else if (cfg.notif && cfg.beep && hooks.onBeep) hooks.onBeep();
    }
  }
  function tick(now = Date.now()) {
    // Serialize claims across open tabs where Web Locks is available.
    if (navigator.locks && navigator.locks.request) return navigator.locks.request('pt-prayer-alert', () => runTick(now));
    return runTick(now);
  }
  function configure(next, callbacks) {
    cfg = next; hooks = callbacks || hooks;
    if (native()) return;
    if (!timer) {
      lastTick = Date.now();
      timer = setInterval(() => { void tick(); }, 1000);
      window.addEventListener('focus', () => { void tick(); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) void tick(); });
    }
  }
  window.PTWebAlerts = { configure, tick, permission, requestPermission, notify };
})();
