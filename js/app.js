'use strict';

/* ════════════════════════════════════════════════════════════
   Prayer Times — app core: state, persistence, i18n, dashboard,
   countdown, sun times, location, desktop bridge, init.
   pages.js / pages3.js depend on: S, t(), fmt(), fmtAtLoc(), zonedNowHM(),
   showToast(), pushCfg(), PT.getDay(), applyLang().
   ════════════════════════════════════════════════════════════ */

/* ═══ ENGINE READY (calculation-contract load order) ═══
   The web/Android bundle (adhan-bundle.js) loads at the END of <body>, after
   app.js starts executing. init() waits (bounded) for the engine + shared
   contract; a late arrival resolves the promise and re-triggers the first
   calculation — degraded mode can never become permanent. On desktop the
   contract loads synchronously before app.js, so this resolves instantly. */
const engineReady = new Promise((resolve) => {
  if (typeof window !== 'undefined' && window.__ptAdhan && window.PT_ENGINE) return resolve(true);
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (window.__ptAdhan && window.PT_ENGINE) { clearInterval(iv); resolve(true); }
    else if (Date.now() - t0 > 2000) { clearInterval(iv); resolve(false); }
  }, 50);
});

/* ═══ STATE ═══ */
const S = {
  lat: null, lon: null, city: '', country: '',
  times: null, hijri: null,
  nextIdx: -1, lang: 'en',
  todaySchedule: null, // { timings, sun } from main-process scheduler (offline)
  cfg: {
    theme: 'islamic', method: '4', madhab: 'shafi',
    notif: false, adhan: false, beep: true, h24: false,
    notifMin: 10, adhanType: 'alafasy', adhanVol: 1,
    reciter: 'ar.alafasy',
    adhanPerPrayer: { Fajr: true, Dhuhr: true, Asr: true, Maghrib: true, Isha: true },
    offsets: { Fajr: 0, Dhuhr: 0, Asr: 0, Maghrib: 0, Isha: 0 },
    desktop: { closeToTray: true, startWithWindows: false, overlay: true },
    widget: false, mini: false,
    preMin: { Fajr: 10, Dhuhr: 10, Asr: 10, Maghrib: 10, Isha: 10 },
    adhanProfiles: {},   // { Fajr: {reciter, vol}, ... } — falls back to adhanType/adhanVol
    dhikr: { preset: 'subhan', target: 33, count: 0, daily: {}, totals: {} },
  },
};

/* ═══ DESKTOP BRIDGE ═══ */
const PT = window.ptDesktop || null;
const IS_DESKTOP = !!PT;

/* v1.3.2 P9: dedup identical config pushes. init(), saveCfg() and saveLoc()
   can all fire within seconds; main only needs CHANGED configs. A real
   change (any field differs) always goes through. */
let lastPushedCfg = null;
function cfgFingerprint(cfg) {
  try { return JSON.stringify(cfg); } catch (e) { return null; }
}
function pushCfg() {
  if (!PT) return;
  try {    // Active saved location's timezone (empty = system/unknown)
    const actLoc = (typeof DB3 !== 'undefined' && DB3) ? DB3.locations.find((l) => l.id === DB3.prefs.activeLoc) : null;
    if ((S.lat != null && !isFiniteLat(S.lat)) || (S.lon != null && !isFiniteLon(S.lon))) {
      showToast('⚠️ ' + (S.lang === 'ar' ? 'إحداثيات غير صالحة — تحقق من الموقع' : 'Invalid coordinates — check your location'));
      return;
    }
    // v1.3.2 P10: adhanEnabled is THE authoritative azan switch — one name,
    // one meaning, everywhere. `adhan` rides along unchanged so older
    // desktop builds and the mobile adapter keep working during transition.
    const adhanEnabled = !!S.cfg.adhan;
    const out = {
      lat: S.lat, lon: S.lon, method: S.cfg.method,
      madhab: S.cfg.madhab, offsets: S.cfg.offsets,
      notifMin: S.cfg.notifMin, notif: S.cfg.notif, beep: S.cfg.beep,
      adhanEnabled, adhan: adhanEnabled, adhanPerPrayer: S.cfg.adhanPerPrayer,
      adhanType: S.cfg.adhanType, adhanVol: S.cfg.adhanVol,
      lang: S.lang,
      tz: resolveTz(),
      preMin: S.cfg.preMin, adhanProfiles: S.cfg.adhanProfiles || {},
    };
    const fp = cfgFingerprint(out);
    if (fp && fp === lastPushedCfg) { pushMobile(); return; }
    lastPushedCfg = fp;
    // P9 diagnostics: every REAL push is visible in azan-debug.log with its
    // trigger, so a future "adhan:false" mystery can be traced from the log.
    try { if (PT.debug) PT.debug('config push', { adhanEnabled, adhanType: out.adhanType, trigger: String((new Error().stack || '').split('\n')[2] || '').trim() }); } catch (e) {}
    PT.updateConfig(out).catch(() => { /* desktop bridge rejected config — coords validated above; renderer UI already reflects the same state */ });
    PT.setCloseToTray(S.cfg.desktop.closeToTray);
    PT.setOverlayEnabled(S.cfg.desktop.overlay);
    PT.setTheme(S.cfg.theme, themeIsDark(S.cfg.theme));
    // startWithWindows is applied on toggle only (avoid re-registering each push)
  } catch (e) { /* never break the UI */ }
  pushMobile();
}

/* ═══ TIMEZONE RESOLUTION (Phase 3 fix) ═══ */
/* The active saved location's stored timezone — an explicitly chosen value
   ALWAYS wins. Callers layer computed lookups (e.g. tz-lookup from GPS
   coordinates) underneath, never over this. */
function activeLocTz() {
  const actLoc = (typeof DB3 !== 'undefined' && DB3) ? DB3.locations.find((l) => l.id === DB3.prefs.activeLoc) : null;
  return actLoc ? actLoc.timezone : '';
}

/* Resolve the IANA timezone for the current location:
   1. saved location's explicit timezone (authoritative — never overwritten)
   2. computed lookup (tz-lookup / geocoder) cached per rounded coordinates,
      invalidated when the location changes
   3. '' → device timezone (last resort; only for locations without a zone) */
function resolveTz() {
  const stored = activeLocTz();
  if (stored && typeof isValidTimezone === 'function' && isValidTimezone(stored)) return stored;
  if (S.lat == null || S.lon == null) return '';
  try {
    const rk = S.lat.toFixed(2) + ',' + S.lon.toFixed(2);
    const cached = localStorage.getItem('pttz');
    const map = cached ? JSON.parse(cached) : {};
    if (map._loc !== S.lat.toFixed(4) + ',' + S.lon.toFixed(4)) {
      // Location changed → previous coordinate cache is meaningless.
      Object.keys(map).forEach((k) => { delete map[k]; });
      map._loc = S.lat.toFixed(4) + ',' + S.lon.toFixed(4);
      localStorage.setItem('pttz', JSON.stringify(map));
    }
    if (map[rk] != null) return map[rk];
    let tz = '';
    if (typeof window !== 'undefined' && typeof window.tzLookup === 'function') {
      tz = window.tzLookup(S.lat, S.lon) || '';
    }
    if (tz && typeof isValidTimezone === 'function' && !isValidTimezone(tz)) tz = '';
    map[rk] = tz;
    localStorage.setItem('pttz', JSON.stringify(map));
    return tz;
  } catch (e) { return ''; }
}

/* Absolute "now" for all next/past logic: when the active location lives in
   a different timezone, its wall clock differs from the device's — compute
   device-relative time via the location's UTC offset (DST-safe; Intl uses
   the tz database, no network). Falls back to plain now when no zone. */
/* The absolute current instant. All next/past/countdown logic compares
   ABSOLUTE instants, so "now" needs no timezone math: the active location's
   wall clock only matters when FORMATTING for display (fmtAtLoc) or picking
   the calendar day (Engine.zonedToday in refreshTodaySchedule). */
function instantNow() {
  return new Date();
}

/* Format an absolute instant as wall-clock in the ACTIVE LOCATION's timezone
   (device-local when no zone is known). Used for contract instants — HH:MM
   strings from the engine are already location-local, but instants need this
   to display correctly on a device in a different timezone. */
function fmtAtLoc(d, force24 = false) {
  const tz = resolveTz();
  if (!tz || typeof Intl === 'undefined') return fmt(d);
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit',
      hour12: force24 ? false : !S.cfg.h24,
    }).format(d);
  } catch (e) { return fmt(d); }
}

/* Current wall-clock minutes-since-midnight in `tz` (device-local when
   empty). Intl may render midnight's hour as "24" — +hour % 24 handles it.
   Comparisons against location-formatted HH:MM strings MUST use this, not
   the device's getHours(). */
function zonedNowHM(tz) {
  const deviceNow = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
  try {
    if (!tz || typeof Intl === 'undefined') return deviceNow();
    const parts = {};
    for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false,
      hour: '2-digit', minute: '2-digit' }).formatToParts(new Date())) parts[x.type] = x.value;
    return ((+parts.hour) % 24) * 60 + (+parts.minute);
  } catch (e) { return deviceNow(); }
}

/* Milliseconds until the next midnight IN THE LOCATION'S timezone (device
   midnight when tz is empty). The location day key from Engine.zonedToday is
   monotone in time, so a forward scan with bisection is exact and DST-safe
   by construction. Pure — takes (tz, now) and is unit-tested. */
function msToNextLocationMidnight(tz, now) {
  const n = (now instanceof Date) ? now : new Date(now == null ? Date.now() : now);
  const E = (typeof window !== 'undefined') ? window.PT_ENGINE : null;
  const deviceMidnight = () => {
    const d = new Date(n); d.setHours(24, 0, 0, 0); return d.getTime() - n.getTime();
  };
  if (!tz || !E || typeof E.zonedToday !== 'function') return deviceMidnight();
  try {
    const cur = E.zonedToday(tz, n).key;
    let t = n.getTime(), step = 30 * 60000; // coarse scan: 30m → up to 6h steps
    for (;;) {
      if (E.zonedToday(tz, new Date(t + step)).key !== cur) break;
      t += step;
      if (step < 6 * 3600000) step *= 2;
    }
    let lo = t, hi = t + step; // lo: still the current day, hi: the next day
    while (hi - lo > 1000) {
      const mid = Math.floor((lo + hi) / 2);
      if (E.zonedToday(tz, new Date(mid)).key === cur) lo = mid; else hi = mid;
    }
    return hi - n.getTime();
  } catch (e) { return deviceMidnight(); }
}

/* Coordinate validation (also enforced in the main process before scheduling). */
function isFiniteLat(v) { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= 90; }
function isFiniteLon(v) { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= 180; }

/* Dark flag for ANY theme (built-ins by .dark; customs by token luminance). */
function themeIsDark(id) {
  const th = THEMES.find((x) => x.id === id);
  if (th) return th.dark !== false;
  const custom = (typeof DB3 !== 'undefined' && DB3) ? DB3.customThemes.find((c) => c.id === id) : null;
  if (custom && custom.tokens) {
    const hex = (custom.tokens.bg || '#000').replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16) || 0, g = parseInt(full.slice(2, 4), 16) || 0, b = parseInt(full.slice(4, 6), 16) || 0;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140; // relative luminance
  }
  return true;
}

/* Reusable in-app text-input modal — replaces window.prompt(), which is a
   silent no-op in packaged Electron. Usage: openTextModal({title, label,
   initial, ok, onOK}). Cancel/Esc/overlay-click → onOK never called. */
function openTextModal({ title, label, initial = '', ok, onOK }) {
  const ov = $('txtModal'), inp = $('txtModalInput');
  if (!ov || !inp) return;
  $('txtModalTitle').textContent = title || '';
  $('txtModalLabel').textContent = label || '';
  $('txtModalOk').textContent = ok || (S.lang === 'ar' ? 'موافق' : 'OK');
  inp.value = initial || '';
  ov.classList.add('open');
  const done = (val) => {
    ov.classList.remove('open');
    inp.onkeydown = null; $('txtModalOk').onclick = null; $('txtModalCancel').onclick = null;
    ov.onclick = null;
    document.removeEventListener('keydown', esc, true);
    if (val != null && onOK) onOK(val);
  };
  const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
  $('txtModalOk').onclick = () => done(inp.value);
  $('txtModalCancel').onclick = () => done(null);
  ov.onclick = (e) => { if (e.target === ov) done(null); };
  inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(inp.value); } };
  document.addEventListener('keydown', esc, true);
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}

/* ═══ MOBILE (Android/Capacitor): feed the local-notification scheduler ═══ */
function pushMobile() {
  if (typeof window === 'undefined' || !window.ptMobile) return;
  try {
    window.ptMobile.setConfig({
      lat: S.lat, lon: S.lon, method: S.cfg.method, madhab: S.cfg.madhab,
      offsets: S.cfg.offsets, preMin: S.cfg.preMin, notifMin: S.cfg.notifMin,
      adhanPerPrayer: S.cfg.adhanPerPrayer, notif: S.cfg.notif, lang: S.lang,
      tz: resolveTz(),
    });
  } catch (e) { /* never break the UI */ }
}
window.addEventListener('load', pushMobile);

/* ═══ ANDROID: mobile UI + hide desktop-only settings once DOM is up ═══ */
window.addEventListener('DOMContentLoaded', () => {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform())) return;
  initMobileUI();
});

/* ═══ MOBILE UI (Android / narrow viewport): dedicated home + 5-tab nav + More sheet ═══ */
let mWired = false;
function initMobileUI() {
  const isAndroid = !!(window.Capacitor && window.Capacitor.isNativePlatform());
  if (isAndroid) document.querySelectorAll('.only-desktop').forEach((el) => { el.style.display = 'none'; });
  if (!mWired) {
    mWired = true;
    const wire = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    wire('mMoreTab', openMoreSheet);
    wire('mHomeMore', openMoreSheet);
    wire('mQiblaBtn', () => gotoPage('qibla'));
    wire('mLocChip', openLocModal);
    wire('mLoc', openLocModal);
    wire('mLang', () => $('langBtn').click());
    const sheet = $('mMoreSheet');
    if (sheet) sheet.addEventListener('click', (e) => { if (e.target === sheet) closeMoreSheet(); });
    document.querySelectorAll('#mMoreSheet [data-page]').forEach((b) => {
      b.addEventListener('click', () => { closeMoreSheet(); gotoPage(b.dataset.page); });
    });
    buildMSwatches();
  }
}

/* m-mode tracks the viewport live: on (Android) or ≤768px wide; off above.
   Prevents an empty screen when a window is opened small then enlarged. */
function applyMMode(on) {
  const was = document.body.classList.contains('m-mode');
  if (on === was) return;
  document.body.classList.toggle('m-mode', on);
  if (on) buildMSwatches();
  gotoPage('prayers');
}

function moreSheetOpen() { const sh = $('mMoreSheet'); return !!(sh && sh.classList.contains('open')); }
function openMoreSheet() {
  const sh = $('mMoreSheet'); if (!sh) return;
  buildMSwatches();
  sh.classList.add('open');
}
function closeMoreSheet() { const sh = $('mMoreSheet'); if (sh) sh.classList.remove('open'); }

function buildMSwatches() {
  const wrap = $('mSwatches'); if (!wrap) return;
  wrap.innerHTML = '';
  THEMES.forEach((th) => {
    const b = document.createElement('button');
    b.className = 'sw' + (th.id === S.cfg.theme ? ' active' : '');
    b.dataset.theme = th.id; b.style.background = th.color; b.title = S.lang === 'ar' ? th.ar : th.en;
    b.onclick = () => { applyTheme(th.id); saveCfg(); buildSwatches(); buildMSwatches(); };
    wrap.appendChild(b);
  });
}

/* ── mHome renderers (dedicated mobile home screen) ── */
function renderMHome() {
  if (!S.times) return;
  const info = nextPrayerInfo();
  if (!info) return;
  // Absolute instants from the contract when available — offsets are already
  // applied by the engine, so they must NOT be added again here, and display
  // must follow the location's wall clock (not the device's).
  const I = S.todaySchedule && S.todaySchedule.instants;
  const atOf = (p) => (I && Number.isFinite(I[p])) ? new Date(I[p]) : adjTime(p, S.times[p]);
  const showAt = (p) => (I && Number.isFinite(I[p])) ? fmtAtLoc(atOf(p)) : fmt(atOf(p));
  $('mLocName').textContent = S.city ? `${S.city}${S.country ? ', ' + S.country : ''}` : (S.lat != null ? `${S.lat.toFixed(2)}, ${S.lon.toFixed(2)}` : '—');
  $('mHijri').textContent = S.hijri
    ? `${S.hijri.day} ${(S.lang === 'ar' ? HMA : HME)[parseInt(S.hijri.month.number) - 1]} ${S.hijri.year} ${S.lang === 'ar' ? 'هـ' : 'AH'}`
    : hijriOf(new Date());
  $('mNextLbl').textContent = t('nextPrayer');
  $('mName').textContent = S.lang === 'ar' ? AR_PRAYER[info.next.prayer] : info.next.prayer;
  $('mTime').textContent = showAt(info.next.prayer) + (info.isTomorrow ? ` · ${t('tomorrow')}` : '');
  $('mCdLbl').textContent = t('startsIn');
  const now = instantNow();
  $('mStrip').innerHTML = PRAYERS.map((p, i) => {
    const at = atOf(p);
    const isNext = info.idx === i && !info.isTomorrow;
    const isPast = at < now && !isNext;
    return `<div class="pcard pt-${p.toLowerCase()}${isNext ? ' next' : ''}${isPast ? ' past' : ''}">
      <div class="ic">${ICON_PRAYER[p]}</div>
      <div class="nm">${S.lang === 'ar' ? AR_PRAYER[p] : p}</div>
      <div class="tm">${showAt(p)}</div>
    </div>`;
  }).join('');
}

function renderMHomeSun() {
  const src = $('sunGrid'); if (!src) return;
  const dst = $('sunGridM'); if (!dst) return;
  dst.innerHTML = src.innerHTML;
}

function renderMHomeCards() {
  if (window.renderRamadan) renderRamadan('ramadanCardM');
  if (window.renderDailyCard) renderDailyCard('dailyCardM');
  if (window.renderHistory) renderHistory('histChipsM');
}

if (PT) {
  PT.onNavigate((page) => gotoPage(page === 'prayers' && document.body.classList.contains('m-mode') ? 'mhome' : page));
  // Scheduler push (same data the widget/mini get): keeps the hero prayer time
  // correct when the active saved location uses a non-system timezone.
  PT.onInfo((info) => {
    if (!info || !info.next || !S.times) return;
    const actLoc = (typeof DB3 !== 'undefined' && DB3) ? DB3.locations.find((l) => l.id === DB3.prefs.activeLoc) : null;
    if (actLoc && actLoc.timezone) {
      const ht = $('heroTime');
      if (ht) ht.textContent = info.next.hhmm;
    }
  });
}

/* ═══ I18N ═══ */
function t(key) {
  const parts = key.split('.');
  let cur = T[S.lang] || T.en;
  for (const p of parts) { cur = cur && cur[p]; }
  if (cur == null) { cur = T.en; for (const p of parts) cur = cur && cur[p]; }
  return cur == null ? key : cur;
}

const $ = (id) => document.getElementById(id);

function fmtDate(d, opts) { return d.toLocaleDateString(S.lang === 'ar' ? 'ar-SA' : 'en-US', opts); }

function hijriOf(date) {
  try {
    return new Intl.DateTimeFormat(S.lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura-nu-latn' : 'en-US-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch (e) { return ''; }
}
function hijriDayNum(date) {
  try {
    return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric' }).format(date);
  } catch (e) { return ''; }
}

/* ═══ PERSISTENCE (same keys as Phase 1) ═══ */
function load() {
  try {
    const s = localStorage.getItem('pts'); if (s) S.cfg = deepMerge(defaultCfg(), JSON.parse(s));
    const l = localStorage.getItem('ptl'); if (l) { const d = JSON.parse(l); S.lat = d.lat; S.lon = d.lon; S.city = d.city; S.country = d.country; }
    const c = localStorage.getItem('ptt'); if (c) { const d = JSON.parse(c); S.times = d.times; S.hijri = d.hijri; }
    const lg = localStorage.getItem('ptlg'); if (lg) S.lang = lg;
    // Normalize numeric settings (old saves may hold 0 that was mis-stored, or junk)
    const nm = Number(S.cfg.notifMin);
    S.cfg.notifMin = Number.isFinite(nm) ? Math.min(120, Math.max(0, Math.round(nm))) : 10;
    const av = Number(S.cfg.adhanVol);
    S.cfg.adhanVol = Number.isFinite(av) ? Math.min(1, Math.max(0, av)) : 1;
  } catch (e) { /* fresh start */ }
}
function defaultCfg() {
  return JSON.parse(JSON.stringify(S.cfg));
}
function deepMerge(base, over) {
  if (over == null) return base;
  if (Array.isArray(over) || typeof over !== 'object') return over;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object')
      ? deepMerge(base[k], over[k]) : over[k];
  }
  // Theme id migration from Phase 1 saves
  if (out.theme && THEME_MIGRATE[out.theme]) out.theme = THEME_MIGRATE[out.theme];
  return out;
}
const saveCfg = () => { localStorage.setItem('pts', JSON.stringify(S.cfg)); pushCfg(); };
const saveLoc = () => {
  localStorage.setItem('ptl', JSON.stringify({ lat: S.lat, lon: S.lon, city: S.city, country: S.country }));
  // Location changed → the coordinate→timezone cache is meaningless now.
  try {
    const cached = localStorage.getItem('pttz');
    if (cached) {
      const map = JSON.parse(cached);
      const cur = (S.lat != null && S.lon != null) ? S.lat.toFixed(4) + ',' + S.lon.toFixed(4) : '';
      if (map._loc !== cur) {
        Object.keys(map).forEach((k) => { delete map[k]; });
        localStorage.setItem('pttz', JSON.stringify(map));
      }
    }
  } catch (e) { /* ignore */ }
  pushCfg();
};
const saveTimes = () => localStorage.setItem('ptt', JSON.stringify({ times: S.times, hijri: S.hijri }));

/* ═══ THEME ═══ */
function applyTheme(id) {
  if (!THEMES.some((x) => x.id === id)) {
    // allow saved custom themes (pt3) — validated by store3
    const custom = (typeof DB3 !== 'undefined' && DB3) ? DB3.customThemes.find((c) => c.id === id) : null;
    if (!custom) id = 'islamic';
  }
  S.cfg.theme = id;
  document.body.dataset.theme = id;
  document.querySelectorAll('.sw').forEach((el) => el.classList.toggle('active', el.dataset.theme === id));
  const sel = $('setTheme'); if (sel) sel.value = id;
  if (PT) { PT.setTheme(id, themeIsDark(id)); if (S.cfg.widget) PT.widgetToggle(true); }
  // Android status bar icons follow the theme's luminance
  if (typeof window.ptStatusBar === 'function') {
    const th = THEMES.find((x) => x.id === id);
    const dark = th ? (th.dark !== false) : false;
    window.ptStatusBar(dark);
  }
}
function buildSwatches() {
  const wrap = $('sbSwatches'); if (!wrap) return;
  wrap.innerHTML = '';
  THEMES.forEach((th) => {
    const b = document.createElement('button');
    b.className = 'sw' + (th.id === S.cfg.theme ? ' active' : '');
    b.dataset.theme = th.id; b.style.background = th.color; b.title = S.lang === 'ar' ? th.ar : th.en;
    b.onclick = () => { applyTheme(th.id); saveCfg(); };
    wrap.appendChild(b);
  });
}

/* ═══ NAVIGATION ═══ */
function gotoPage(name) {
  if (document.body.classList.contains('m-mode') && name === 'prayers') name = 'mhome';
  if (window.PTCompass && name !== 'qibla') window.PTCompass.stop();
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const pg = $('page-' + name); if (pg) pg.classList.add('active');
  if (name === 'mhome') renderMHomeCards();
  document.querySelectorAll('[data-page]').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
  if (name === 'calendar' && window.renderCalendar) renderCalendar();
  if (name === 'quran' && window.renderSurahList) renderSurahList();
  if (name === 'names' && window.renderNames) renderNames();
  if (name === 'dhikr' && window.renderDhikr) { renderDhikr(); }
  if (name === 'dhikr' && window.renderDhikrLibrary) renderDhikrLibrary();
  if (name === 'stats' && window.renderStats) renderStats();
  if (name === 'settings' && window.renderSettings) { renderSettings(); if (window.renderLocations) renderLocations(); if (window.renderThemeBuilder) renderThemeBuilder(); }
  if (name === 'qibla' && window.renderQibla) renderQibla();
  if (name === 'prayers') { if (window.renderHistory) renderHistory(); if (window.renderRamadan) renderRamadan(); if (window.renderDailyCard) renderDailyCard(); }
}

/* ═══ TOAST ═══ */
let toastTimer = null;
function showToast(msg, ms = 3000) {
  const el = $('toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ═══ TIME HELPERS ═══ */
/* Parse a time string robustly: local engine gives clean "HH:MM", but the
   browser API fallback may append timezone suffixes like "05:27 (EET)". */
function parseHM(str) {
  const m = String(str).match(/(\d{1,2}):(\d{2})/);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}
function timeStrToDate(str, base = new Date()) {
  const [h, m] = parseHM(str);
  const d = new Date(base); d.setHours(h, m, 0, 0);
  return d;
}
function adjTime(name, str) {
  const off = (S.cfg.offsets[name] || 0);
  const [h, m] = parseHM(str);
  const d = new Date(); d.setHours(h, m + off, 0, 0);
  return d;
}
function fmt(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !S.cfg.h24 });
}
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return [h, m, ss].map((v) => String(v).padStart(2, '0')).join(':');
}
function pad2(n) { return String(n).padStart(2, '0'); }

/* ═══ API FETCH (display source of truth) ═══ */
/* Network wrapper: single-flight per endpoint + exponential backoff +
   navigator.onLine awareness. Local-only features never go through this. */
const _netInflight = new Map();
const _netBackoff = new Map();
const NET_TIMEOUT_MS = 12000; // per-request; a hung request never blocks its key forever
function netFetch(url) {
  // Dedup key = FULL URL. Truncating at '?' made different queries (cities,
  // coordinates) share one key and cross-contaminate responses.
  const key = url;
  if (!navigator.onLine) return Promise.reject(new Error('offline'));
  if (_netInflight.has(key)) return _netInflight.get(key);
  const delay = _netBackoff.get(key) || 0;
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS) : null;
  const p = (async () => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _netBackoff.delete(key);
      return r;
    } catch (e) {
      _netBackoff.set(key, Math.min(60000, (delay || 1000) * 2));
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      _netInflight.delete(key); // key released even on timeout → reusable
    }
  })();
  _netInflight.set(key, p);
  return p;
}

async function fetchTimes(lat, lon) {
  // Any platform with the local engine: it is the single display source — no
  // AlAdhan API timings may overwrite them, so what you see is what fires.
  // The API path remains a fallback for plain browsers without the engine.
  if (window.Plat && (Plat.isElectron() || Plat.isAndroid() || window.__ptAdhan)) {
    await refreshTodaySchedule();
    return;
  }
  const n = new Date();
  const url = `https://api.aladhan.com/v1/timings/${pad2(n.getDate())}-${pad2(n.getMonth() + 1)}-${n.getFullYear()}?latitude=${lat}&longitude=${lon}&method=${S.cfg.method}`;
  try {
    const r = await netFetch(url);
    const d = await r.json();
    S.times = d.data.timings; S.hijri = d.data.date.hijri;
    saveTimes();
    $('offBadge').classList.remove('show');
  } catch (e) {
    $('offBadge').classList.add('show');
    if (!S.times) { showToast('⚠️ ' + t('failedLoad')); }
    else showToast('📦 ' + t('cached'));
  }
  renderAll();
}

async function fetchByCity(city, country) {
  // Geocoding only (lat/lon) — timings are ALWAYS computed by the local engine
  // so there is exactly one source of prayer times.
  const url = `https://api.aladhan.com/v1/addressInfo?address=${encodeURIComponent(city + (country ? ',' + country : ''))}`;
  try {
    const r = await netFetch(url); const d = await r.json();
    if (d.code !== 200 || !d.data || !Number.isFinite(Number(d.data.latitude)) || !Number.isFinite(Number(d.data.longitude))) throw new Error('geocode');
    S.lat = Number(d.data.latitude); S.lon = Number(d.data.longitude);
    S.city = city; S.country = country;
    saveLoc();
    S.times = null; S.hijri = null;            // drop any stale API cache
    localStorage.removeItem('ptt');
    await refreshTodaySchedule();
    renderAll(); closeLocModal(); showToast('✅ ' + t('toast.locSet'));
  } catch (e) { showToast('❌ ' + t('toast.locFail')); }
}

/* ═══ OFFLINE SCHEDULE (platform adapter: main process on desktop, adhan lib on mobile/browser) ═══ */
async function refreshTodaySchedule(now = new Date()) {
  if (S.lat == null || !window.Plat) return;
  try {
    // The prayer day belongs to the ACTIVE LOCATION's timezone, not the
    // device's: with a Tokyo location the dashboard must show Tokyo's
    // "today" even while the device is still on yesterday. Empty tz →
    // device-local day (unchanged legacy behavior).
    const E = (typeof window !== 'undefined') ? window.PT_ENGINE : null;
    const tz = resolveTz();
    const locDay = (E && E.zonedToday) ? E.zonedToday(tz, now) : { key: localDateKey(now) };
    S.todaySchedule = await window.Plat.getDay(locDay.key, {
      lat: S.lat, lon: S.lon, method: S.cfg.method, madhab: S.cfg.madhab,
      offsets: S.cfg.offsets, tz,
    });
    if (S.todaySchedule && S.todaySchedule.timings) {
      // SINGLE SOURCE OF TRUTH: what the dashboard shows is what the
      // scheduler fires (offsets already applied by the same engine).
      S.times = S.todaySchedule.timings;
      S.hijri = null;
      saveTimes();
    }
    renderSunSection();
    renderMHomeSun();
    renderAll();
  } catch (e) { /* no location / offline — hide sun section */ }
}

/* ═══ DASHBOARD ═══ */
function renderAll() {
  renderDashboard();
  renderMHomeCards();
  renderSunSection(); // API-backed rows in browser; full night times via ptGetDay on desktop
  if (window.renderQibla) renderQibla();
  if (window.renderCalendar && document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
  updateLocNames();
}

function nextPrayerInfo() {
  if (!S.times) return null;
  const now = instantNow();
  // Absolute instants from the calculation contract when available — never
  // re-parse "HH:MM" through the device timezone. Fallback (plain browser
  // without the engine) keeps the legacy string path.
  const I = S.todaySchedule && S.todaySchedule.instants;
  const list = PRAYERS.map((p) => ({
    prayer: p,
    at: (I && Number.isFinite(I[p])) ? new Date(I[p]) : adjTime(p, S.times[p]),
  }));
  let next = list.find((x) => x.at > now);
  let isTomorrow = false;
  if (!next) {
    // All of today's prayers passed → tomorrow's Fajr. With the contract,
    // approximate its absolute instant as +24h on today's Fajr (drift well
    // under a minute; refreshTodaySchedule corrects it hourly and at
    // midnight). Legacy string path keeps the device-local +1 day.
    if (I && Number.isFinite(I.Fajr)) {
      next = { prayer: 'Fajr', at: new Date(I.Fajr + 86400000) };
    } else {
      const d = adjTime('Fajr', S.times.Fajr); d.setDate(d.getDate() + 1);
      next = { prayer: 'Fajr', at: d };
    }
    isTomorrow = true;
  }
  const idx = PRAYERS.indexOf(next.prayer);
  return { next, isTomorrow, idx };
}

function renderDashboard() {
  if (!S.times) return;

  // Hero
  const info = nextPrayerInfo();
  const I = S.todaySchedule && S.todaySchedule.instants;
  const atOf = (p) => (I && Number.isFinite(I[p])) ? new Date(I[p]) : adjTime(p, S.times[p]);
  const showAt = (p) => (I && Number.isFinite(I[p])) ? fmtAtLoc(atOf(p)) : fmt(atOf(p));
  $('heroName').textContent = S.lang === 'ar' ? AR_PRAYER[info.next.prayer] : info.next.prayer;
  $('heroTime').textContent = showAt(info.next.prayer) + (info.isTomorrow ? ` · ${t('tomorrow')}` : '');
  $('heroGreg').textContent = fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('heroHijri').textContent = S.hijri
    ? `${S.hijri.day} ${(S.lang === 'ar' ? HMA : HME)[parseInt(S.hijri.month.number) - 1]} ${S.hijri.year} ${S.lang === 'ar' ? 'هـ' : 'AH'}`
    : hijriOf(new Date());
  $('heroCdLbl').textContent = t('startsIn');
  $('heroNextLbl').textContent = t('nextPrayer');

  // Prayer cards — instants path: the engine already applied the offsets,
  // so re-adding them here displayed doubled times (04:32 → 04:37 for +5)
  // and mis-stated past/next across timezones. adjTime remains only for the
  // raw API fallback where timings are genuinely unadjusted.
  const now = instantNow();
  $('prayerCards').innerHTML = PRAYERS.map((p, i) => {
    const at = atOf(p);
    const isNext = info.idx === i && !info.isTomorrow;
    const isPast = at < now && !isNext;
    const sunrise = (I && Number.isFinite(I.Sunrise))
      ? `<div class="sr">${t('sunrise')} ${fmtAtLoc(new Date(I.Sunrise))}</div>`
      : (S.times.Sunrise ? `<div class="sr">${t('sunrise')} ${fmt(timeStrToDate(S.times.Sunrise))}</div>` : '');
    return `<div class="pcard pt-${p.toLowerCase()}${isNext ? ' next' : ''}${isPast ? ' past' : ''}">
      ${isNext ? `<span class="ribbon">${t('next')}</span>` : ''}
      <div class="ic">${ICON_PRAYER[p]}</div>
      <div class="nm">${S.lang === 'ar' ? AR_PRAYER[p] : p}</div>
      <div class="nm-ar">${S.lang === 'ar' ? p : AR_PRAYER[p]}</div>
      <div class="tm">${showAt(p)}</div>
      ${p === 'Fajr' ? sunrise : ''}
    </div>`;
  }).join('');

  // Glance
  const q = qiblaBearing();
  const cells = [
    { i: '🕌', v: '5', l: t('prayersCount') },
    { i: '⏳', v: `${S.lang === 'ar' ? AR_PRAYER[info.next.prayer] : info.next.prayer}`, l: t('nextPrayer') },
    { i: '🧭', v: `${Math.round(q)}°`, l: t('qiblaBearing') },
    { i: '🌙', v: hijriOf(new Date()).replace(/[,،]?\s*\d{4}\s*(هـ|AH)?\.?\s*$/, ''), l: t('hijri') },
  ];
  $('glanceGrid').innerHTML = cells.map((c) => `<div class="gcell"><span class="gi">${c.i}</span><div><div class="gv">${c.v}</div><div class="gl">${c.l}</div></div></div>`).join('');
}

/* Sun & night times — from the offline main-process scheduler */
function renderSunSection() {
  const el = $('sunGrid'); if (!el) return;
  const ts = S.todaySchedule && S.todaySchedule.sun;
  const rows = [
    { i: '🌅', k: 'sunrise', lbl: t('sunrise'), v: (ts && ts.sunrise) || (S.times && S.times.Sunrise ? fmt(timeStrToDate(S.times.Sunrise)) : '—') },
    { i: '🌇', k: 'sunset', lbl: t('sunset'), v: (ts && ts.sunset) || (S.times && S.times.Sunset ? fmt(timeStrToDate(S.times.Sunset)) : '—') },
    { i: '🌞', k: 'dhuhr', lbl: t('solarNoon'), v: (ts && ts.dhuhr) || (S.times && S.times.Dhuhr ? fmt(timeStrToDate(S.times.Dhuhr)) : '—') },
    { i: '🌙', k: 'midnight', lbl: t('midnight'), v: ts && ts.midnight ? ts.midnight : '—' },
    { i: '🌌', k: 'firstThird', lbl: t('firstThird'), v: ts && ts.firstThird ? ts.firstThird : '—' },
    { i: '☄️', k: 'lastThird', lbl: t('lastThird'), v: ts && ts.lastThird ? ts.lastThird : '—' },
  ];
  el.innerHTML = rows.map((r) => `<div class="sun-cell"><div class="ic">${r.i}</div><div class="lbl">${r.lbl}</div><div class="tm">${r.v}</div></div>`).join('');
}

/* ═══ COUNTDOWN ═══ */
let cdTimer = null;
let tickN = 0;
function startCountdown() {
  if (cdTimer) clearInterval(cdTimer);
  cdTimer = setInterval(tick, 1000);
  tick();
}
function tick() {
  if (!S.times) return;
  const info = nextPrayerInfo();
  if (!info) return;
  const cdStr = fmtCountdown(info.next.at - instantNow());
  $('heroCd').textContent = cdStr;
  const mCd = $('mCd'); if (mCd) mCd.textContent = cdStr;
  // Refresh card states (next/past) every 30s; full re-render keeps headers fresh.
  if (++tickN % 30 === 0) { renderDashboard(); renderMHome(); }
}

/* ═══ QIBLA MATH (shared contract — shared/pt-engine.js) ═══ */
function qiblaBearing() {
  const E = (typeof window !== 'undefined') ? window.PT_ENGINE : null;
  if (E && S.lat != null && S.lon != null) return E.qiblaBearing(S.lat, S.lon);
  return 0; // engine missing → no invented number
}
function distToKaaba() {
  const E = (typeof window !== 'undefined') ? window.PT_ENGINE : null;
  if (E && S.lat != null && S.lon != null) return E.distToKaaba(S.lat, S.lon);
  return null;
}

/* ═══ LOCATION ═══ */
function updateLocNames() {
  const name = S.city ? `${S.city}${S.country ? ', ' + S.country : ''}` : (S.lat != null ? `${S.lat.toFixed(2)}, ${S.lon.toFixed(2)}` : t('detecting'));
  $('locName').textContent = name;
  $('heroLocName').textContent = name;
  $('setLocName').textContent = name;
  $('setCoords').textContent = S.lat != null ? `${S.lat.toFixed(4)}, ${S.lon.toFixed(4)}` : '—';
  const cd = $('coordsDisp'); if (cd) cd.textContent = S.lat != null ? `${S.lat.toFixed(4)}°, ${S.lon.toFixed(4)}°` : '—';
}
function openLocModal() { $('locOverlay').classList.add('open'); }
function closeLocModal() { $('locOverlay').classList.remove('open'); }
function useGPS() {
  if (!navigator.geolocation) { showToast('⚠️ ' + t('toast.gpsNo')); return; }
  $('locName').textContent = t('detecting');
  // GPS accuracy tiers (Phase 9): imperfect accuracy must never block prayer
  // calculation, but a bad fix must not silently replace a good location.
  const POOR_ACCURACY_M = 1000;
  navigator.geolocation.getCurrentPosition((pos) => {
    const acc = (pos.coords && Number.isFinite(pos.coords.accuracy)) ? pos.coords.accuracy : null;
    const hadPrevious = S.lat != null && S.lon != null;
    if (acc != null && acc > POOR_ACCURACY_M && hadPrevious) {
      // Keep the previous reliable location; just tell the user why.
      showToast('⚠️ ' + (S.lang === 'ar'
        ? `دقة GPS ضعيفة (±${Math.round(acc)} م) — تم الاحتفاظ بالموقع السابق`
        : `GPS accuracy poor (±${Math.round(acc)}m) — keeping previous location`));
      closeLocModal();
      return;
    }
    S.lat = pos.coords.latitude; S.lon = pos.coords.longitude; S.city = ''; S.country = '';
    saveLoc(); revGeo(S.lat, S.lon); fetchTimes(S.lat, S.lon); refreshTodaySchedule(); closeLocModal();
    if (acc != null && acc > POOR_ACCURACY_M) {
      showToast('⚠️ ' + (S.lang === 'ar'
        ? `دقة GPS ضعيفة (±${Math.round(acc)} م)`
        : `GPS accuracy poor (±${Math.round(acc)}m)`));
    }
  }, () => showToast('❌ ' + t('toast.gpsDenied')), { timeout: 10000, maximumAge: 600000 });
}
/* Nominatim reverse geocoding — an OPTIONAL service for a friendly city
   name. Coordinates keep working when it is unavailable. Cache: rounded
   coordinates → { city, country } with a TTL; throttle between requests;
   skip when the rounded coordinates already match the current location. */
const _revGeo = { cache: null, lastCall: 0, inflight: null };
const REV_GEO = { TTL_MS: 7 * 24 * 3600 * 1000, MIN_GAP_MS: 2000, ROUND_DP: 2 };
function revGeoCache() {
  if (_revGeo.cache) return _revGeo.cache;
  try { _revGeo.cache = JSON.parse(localStorage.getItem('ptrevgeo') || '{}'); } catch (e) { _revGeo.cache = {}; }
  return _revGeo.cache;
}
const roundKey = (lat, lon) => `${Number(lat).toFixed(REV_GEO.ROUND_DP)},${Number(lon).toFixed(REV_GEO.ROUND_DP)}`;
async function revGeo(lat, lon) {
  const key = roundKey(lat, lon);
  const curKey = (S.lat != null && S.lon != null) ? roundKey(S.lat, S.lon) : '';
  if (key === curKey && S.city) return;          // same place — already named
  const c = revGeoCache();
  const hit = c[key];
  if (hit && (Date.now() - hit.t) < REV_GEO.TTL_MS) {
    S.city = hit.city; S.country = hit.country; saveLoc(); updateLocNames();
    return;
  }
  // Reuse the single inflight ONLY when it targets the same coordinates —
  // a lookup for a different location must never be answered by (or bound
  // to) another coordinate's request.
  if (_revGeo.inflight) {
    if (_revGeo.inflight.key === key) return _revGeo.inflight.promise;
    return undefined; // another coordinate is in flight; skip this one
  }
  const gap = Date.now() - _revGeo.lastCall;
  const promise = (async () => {
    try {
      if (gap < REV_GEO.MIN_GAP_MS) await new Promise((r) => setTimeout(r, REV_GEO.MIN_GAP_MS - gap));
      _revGeo.lastCall = Date.now();
      const r = await netFetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const d = await r.json();
      const city = (d.address && (d.address.city || d.address.town || d.address.village || d.address.county)) || '';
      const country = (d.address && d.address.country) || '';
      if (city || country) {
        c[key] = { city, country, t: Date.now() };
        try { localStorage.setItem('ptrevgeo', JSON.stringify(c)); } catch (e) { /* full */ }
        if (key === roundKey(S.lat, S.lon)) { S.city = city; S.country = country; saveLoc(); updateLocNames(); }
      }
    } catch (e) { /* offline / throttled / down — coordinates keep working */ }
    finally { if (_revGeo.inflight && _revGeo.inflight.key === key) _revGeo.inflight = null; }
  })();
  _revGeo.inflight = { key, promise };
  return promise;
}
function setManualLoc() {
  const c = $('cityInp').value.trim();
  if (!c) { showToast('⚠️ ' + t('toast.noCity')); return; }
  fetchByCity(c, $('cntryInp').value.trim());
}

/* ═══ AUDIO (browser fallback; desktop uses main process) ═══ */
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((off, i) => {
      const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
      osc.connect(g); g.connect(audioCtx.destination);
      osc.frequency.value = 440 + i * 110; osc.type = 'sine';
      const t0 = audioCtx.currentTime + off;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.4, t0 + 0.05);
      g.gain.linearRampToValueAtTime(0, t0 + 0.3);
      osc.start(t0); osc.stop(t0 + 0.35);
    });
  } catch (e) { /* no audio */ }
}
function playAdhanBrowser() {
  const a = $('adhanAudio');
  if (!a.src || !a.src.startsWith('http')) a.src = ADHAN_SOUNDS[S.cfg.adhanType] || ADHAN_SOUNDS.alafasy;
  a.volume = S.cfg.adhanVol != null ? S.cfg.adhanVol : 1;
  a.currentTime = 0;
  a.play().catch(() => showToast('🔇 ' + t('toast.beep')));
}
function testAdhan() {
  showToast('🔊 ' + t('toast.adhanPlay'));
  playAdhanBrowser();
}

/* ═══ I18N APPLY ═══ */
function applyLang() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === 'ar' ? 'rtl' : 'ltr';

  // Sidebar + bottom nav
  document.getElementById('sbTitle').textContent = t('appName');
  document.getElementById('sbSub').textContent = t('sub');    const navMap = { prayers: 'nav.prayers', calendar: 'nav.calendar', qibla: 'nav.qibla', quran: 'nav.quran', names: 'nav.names', dhikr: 'nav.dhikr', stats: 'nav.stats', settings: 'nav.settings' };
  document.querySelectorAll('[data-page]').forEach((b) => {
    const key = navMap[b.dataset.page];
    const el = b.querySelector('.t'); if (el && key) el.textContent = t(key);
  });

  // Mobile home + More sheet labels
  const mMore = $('mMoreTabLbl'); if (mMore) mMore.textContent = t('more');
  const mMoreSheet = $('mMoreTitle'); if (mMoreSheet) mMoreSheet.textContent = t('more');
  const mMoreHome = $('mHomeMoreLbl'); if (mMoreHome) mMoreHome.textContent = t('more');
  const mQibla = $('mQiblaLbl'); if (mQibla) mQibla.textContent = t('nav.qibla');
  const mLang = $('mLangLbl'); if (mLang) mLang.textContent = t('language');
  const mLoc = $('mLocLbl'); if (mLoc) mLoc.textContent = t('location');
  const mTheme = $('mThemeLbl'); if (mTheme) mTheme.textContent = t('set.theme');
  const mHistHint = $('histHintM'); if (mHistHint) mHistHint.textContent = t('hist.hint');
  const mHistLbl = $('lblHistM'); if (mHistLbl) mHistLbl.textContent = t('hist.title');

  // Topbar
  $('offBadge').textContent = t('offline');
  $('tbDate').textContent = fmtDate(new Date(), { weekday: 'short', day: 'numeric', month: 'short' });

  // Dashboard labels
  $('lblToday').textContent = S.lang === 'ar' ? 'صلوات اليوم' : "Today's Prayers";
  $('lblSun').textContent = t('sunNight');
  const lblSunM = $('lblSunM'); if (lblSunM) lblSunM.textContent = t('sunNight');
  $('lblGlance').textContent = t('glance');
  $('heroNextLbl').textContent = t('nextPrayer');
  $('heroCdLbl').textContent = t('startsIn');

  // Qibla
  $('lblYc').textContent = t('qibla.yourCoords');
  $('lblKc').textContent = t('qibla.kaabaCoords');
  $('lblHtu').textContent = t('qibla.how');
  $('qHelp').textContent = t('qibla.howText');

  // Quran
  $('qrSearch').placeholder = t('quran.search');

  // Names
  $('nmSearch').placeholder = t('names.search');
  $('nhBadge').textContent = t('names.day');

  // Dhikr
  $('dhDailyLbl').textContent = t('dhikr.daily');
  $('dhTotalLbl').textContent = t('dhikr.total');
  $('dhRoundLbl').textContent = t('dhikr.target');
  $('dhikrHint').textContent = t('dhikr.tapHint');

  // Settings page headers
  $('shGeneral').textContent = t('set.general');
  $('shCalc').textContent = t('set.calc');
  $('shNotif').textContent = t('set.notif');
  $('shAdhan').textContent = t('set.adhanSec');
  $('shDesktop').textContent = t('set.desktop');
  $('shLocation').textContent = t('set.location');
  $('slLang').textContent = t('set.language');
  $('slTheme').textContent = t('set.theme');
  $('sl24').textContent = t('set.h24');
  $('slMethod').textContent = t('set.method');
  $('slMadhab').textContent = t('set.madhab');
  $('slMadhabS').textContent = t('set.madhabS');
  $('slAdjust').textContent = t('set.adjust');
  $('slNotif').textContent = t('set.notif');
  $('slNotifS').textContent = t('set.notifS');
  $('slMinBefore').textContent = t('set.minutesBefore');
  $('slBeep').textContent = t('set.beep');
  $('slAdhan').textContent = t('set.adhanSound');
  $('slReciter').textContent = t('set.reciter');
  $('slAdhanStyle').textContent = S.lang === 'ar' ? 'نمط الأذان' : 'Adhan style';
  $('slVol').textContent = t('set.volume');
  $('slOverlay').textContent = t('set.overlay');
  $('slPerPrayer').textContent = t('set.perPrayer');
  $('slTestAdhan').textContent = t('set.testAdhan');
  $('slSww').textContent = t('set.sww');
  $('slSwwS').textContent = t('set.swwS');
  $('slCtt').textContent = t('set.ctt');
  $('slCttS').textContent = t('set.cttS');
  $('slTestNotif').textContent = t('set.testNotif');
  $('dataNote').textContent = t('set.dataNote');
  $('slGps').textContent = t('set.gps');
  $('slCitySearch').textContent = t('set.searchCity');

  // Location modal
  $('locTitle').textContent = S.lang === 'ar' ? 'تحديد الموقع' : 'Set Location';
  $('locGpsLbl').textContent = t('set.gps');
  $('lblCity').textContent = t('set.city');
  $('lblCountry').textContent = t('set.country');
  $('locSearchLbl').textContent = t('set.setLoc');
  $('btnCancelLoc').textContent = t('set.cancel');

  $('setTheme') && ($('setTheme').value = S.cfg.theme);

  // Text modal
  const tmOk = $('txtModalOk'); if (tmOk) tmOk.textContent = S.lang === 'ar' ? 'موافق' : 'OK';
  const tmCancel = $('txtModalCancel'); if (tmCancel) tmCancel.textContent = S.lang === 'ar' ? 'إلغاء' : 'Cancel';

  // Swatch titles + settings selects
  buildSwatches();
  if (window.fillSettingsSelects) fillSettingsSelects();

  // Re-render data views in the new language
  renderAll();
  if (window.renderNames && document.getElementById('page-names').classList.contains('active')) renderNames();
  if (window.renderDhikr && document.getElementById('page-dhikr').classList.contains('active')) renderDhikr();
  if (window.renderCalendar && document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
  if (window.renderSurahList && document.getElementById('page-quran').classList.contains('active')) renderSurahList();
}

/* ═══ INIT ═══ */
async function init() {
  load();
  applyTheme(S.cfg.theme);
  applyLangStatic();       // nav/labels before data renders
  buildSwatches();

  // Narrow viewport (phone / small window): dedicated mobile UI — desktop unaffected
  initMobileUI();
  let mqTick = null;
  window.addEventListener('resize', () => {
    clearTimeout(mqTick);
    mqTick = setTimeout(() => applyMMode(window.innerWidth <= 768), 120);
  });

  // Navigation wiring
  document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => gotoPage(b.dataset.page)));
  $('tbLoc').onclick = openLocModal;
  $('heroLoc').onclick = openLocModal;
  $('langBtn').onclick = () => {
    S.lang = S.lang === 'en' ? 'ar' : 'en';
    localStorage.setItem('ptlg', S.lang);
    applyLang(); pushCfg();
    showToast(S.lang === 'ar' ? t('toast.switchedAr') : t('toast.switchedEn'));
  };

  // Location modal wiring
  $('btnGps').onclick = useGPS; $('btnGps2').onclick = useGPS;
  $('btnCitySearch').onclick = openLocModal;
  $('btnSetLoc').onclick = setManualLoc;
  $('btnCancelLoc').onclick = closeLocModal;
  $('locOverlay').addEventListener('click', (e) => { if (e.target === $('locOverlay')) closeLocModal(); });

  // Push the loaded config to the main scheduler immediately — without this,
  // notifications/adhan stay silent until the first settings change.
  pushCfg();

  // Restore cached view instantly (cached strings render without the engine)
  if (S.times) renderAll();

  // Calculation must not start before the local engine exists (web/Android);
  // on desktop this await is instant. Bounded — a missing bundle degrades to
  // the API fallback after 2s, and a late bundle still re-triggers below.
  const engineOnTime = await engineReady;
  if (!engineOnTime && !Plat.isElectron()) {
    console.warn('[pt] calculation engine not loaded at startup — using API fallback until it arrives');
    // Degraded mode must not become permanent: when the bundle finally
    // arrives, run the first local calculation.
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__ptAdhan && window.PT_ENGINE) {
        clearInterval(iv);
        if (S.lat != null) refreshTodaySchedule();
      } else if (Date.now() - t0 > 30000) clearInterval(iv);
    }, 250);
  }

  if (S.lat != null) { fetchTimes(S.lat, S.lon); }
  else if (S.city) { fetchByCity(S.city, S.country); }
  else if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      S.lat = pos.coords.latitude; S.lon = pos.coords.longitude;
      saveLoc(); revGeo(S.lat, S.lon); fetchTimes(S.lat, S.lon); refreshTodaySchedule();
    }, () => makkahFallback(), { timeout: 10000, maximumAge: 600000 });
  } else makkahFallback();

  refreshTodaySchedule();
  startCountdown();
  if (window.initPhase3) initPhase3();   // Phase 3: history, dhikr library, locations, backup, theme builder
  loadQuranDataset();                     // Phase 3: bundled Quran text (async, non-blocking)
  wireKeyboardShortcuts();

  // Midnight rollover + hourly refresh
  scheduleMidnight();
  // One-second after local midnight: re-render everything on the NEW day
  // (history chips, streaks, daily dhikr, calendar all key off localDateKey).
  setTimeout(() => {
    renderAll();
    if (window.renderHistory) renderHistory();
    if (window.renderStats) renderStatsIfVisible();
    if (window.renderRamadan) renderRamadan();
    if (window.renderDailyCard) renderDailyCard();
  }, 1000);
  setInterval(() => { if (S.lat != null) fetchTimes(S.lat, S.lon); refreshTodaySchedule(); }, 3600000);

  // online/offline badges
  window.addEventListener('online', () => { $('offBadge').classList.remove('show'); if (S.lat != null) fetchTimes(S.lat, S.lon); });
  window.addEventListener('offline', () => $('offBadge').classList.add('show'));
}

function applyLangStatic() {
  // Lightweight first-pass labels so first paint isn't English-only in AR mode.
  applyLang();
}

/* ═══ PHASE 3: Quran dataset loader (bundled, verified; only selected surah rendered) ═══ */
let QURAN_DATA = null;
let quranLoadStarted = false;
function loadQuranDataset() {
  if (quranLoadStarted) return; quranLoadStarted = true;
  fetch('data/quran.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => {
      if (d && d.v === 1 && Array.isArray(d.surahs) && d.surahs.length === 114) {
        QURAN_DATA = d;
        if (window.renderReaderState) renderReaderState();
        if (window.renderDailyCard && document.body.classList.contains('m-mode')) renderDailyCard('dailyCardM');
      }
    })
    .catch(() => { /* offline/file:// — reader shows unavailable notice */ });
}

/* ═══ PHASE 3: keyboard shortcuts (ignored while typing) ═══ */
function wireKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
    if (e.ctrlKey && !e.shiftKey && e.key >= '1' && e.key <= '7') {
      e.preventDefault();
      gotoPage(['prayers', 'calendar', 'qibla', 'quran', 'names', 'dhikr', 'settings'][+e.key - 1]);
    } else if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
      e.preventDefault(); toggleWidgetSetting();
    } else if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
      e.preventDefault(); toggleMiniMode();
    }
  });
}

function toggleWidgetSetting() {
  S.cfg.widget = !S.cfg.widget; saveCfg(); renderSettings();
  if (PT) PT.widgetToggle(S.cfg.widget);
  showToast((S.cfg.widget ? '🪟 ' : '') + (S.lang === 'ar' ? (S.cfg.widget ? 'تم إظهار الأداة' : 'تم إخفاء الأداة') : (S.cfg.widget ? 'Widget shown' : 'Widget hidden')));
}
function toggleMiniMode() {
  S.cfg.mini = !S.cfg.mini; saveCfg(); renderSettings();
  if (PT) PT.miniToggle(S.cfg.mini);
  showToast(S.lang === 'ar' ? (S.cfg.mini ? 'الوضع المصغر' : 'الوضع الكامل') : (S.cfg.mini ? 'Mini mode on' : 'Mini mode off'));
}

function makkahFallback() {
  S.lat = 21.3891; S.lon = 39.8579; S.city = 'Makkah'; S.country = 'Saudi Arabia';
  saveLoc(); updateLocNames(); fetchTimes(S.lat, S.lon); refreshTodaySchedule();
}

function scheduleMidnight() {
  // Re-render at the ACTIVE LOCATION's local midnight when it differs from
  // the device's (location date rolls over at a different moment). The old
  // offset+setHours(24) math set DEVICE-wall midnight on a location-shifted
  // date and fired 7–30 h off; msToNextLocationMidnight scans the monotone
  // location day key instead — exact and DST-safe by construction.
  const ms = msToNextLocationMidnight(resolveTz(), new Date());
  setTimeout(() => { if (S.lat != null) fetchTimes(S.lat, S.lon); refreshTodaySchedule(); scheduleMidnight(); }, Math.max(1000, ms));
}

init();
