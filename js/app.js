'use strict';

/* ════════════════════════════════════════════════════════════
   Prayer Times — app core: state, persistence, i18n, dashboard,
   countdown, sun times, location, desktop bridge, init.
   pages.js depends on: S, t(), fmt(), showToast(), pushCfg(),
   PT.getDay(), applyLang().
   ════════════════════════════════════════════════════════════ */

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

function pushCfg() {
  if (!PT) return;
  try {    // Active saved location's timezone (empty = system/unknown)
    const actLoc = (typeof DB3 !== 'undefined' && DB3) ? DB3.locations.find((l) => l.id === DB3.prefs.activeLoc) : null;
    PT.updateConfig({
      lat: S.lat, lon: S.lon, method: S.cfg.method,
      madhab: S.cfg.madhab, offsets: S.cfg.offsets,
      notifMin: S.cfg.notifMin, notif: S.cfg.notif, beep: S.cfg.beep,
      adhan: S.cfg.adhan, adhanPerPrayer: S.cfg.adhanPerPrayer,
      adhanType: S.cfg.adhanType, lang: S.lang,
      tz: actLoc ? actLoc.timezone : '',
      preMin: S.cfg.preMin, adhanProfiles: S.cfg.adhanProfiles || {},
    });
    PT.setCloseToTray(S.cfg.desktop.closeToTray);
    PT.setOverlayEnabled(S.cfg.desktop.overlay);
    // startWithWindows is applied on toggle only (avoid re-registering each push)
  } catch (e) { /* never break the UI */ }
  pushMobile();
}

/* ═══ MOBILE (Android/Capacitor): feed the local-notification scheduler ═══ */
function pushMobile() {
  if (typeof window === 'undefined' || !window.ptMobile) return;
  try {
    window.ptMobile.setConfig({
      lat: S.lat, lon: S.lon, method: S.cfg.method, madhab: S.cfg.madhab,
      offsets: S.cfg.offsets, preMin: S.cfg.preMin,
      adhanPerPrayer: S.cfg.adhanPerPrayer, notif: S.cfg.notif, lang: S.lang,
    });
  } catch (e) { /* never break the UI */ }
}
window.addEventListener('load', pushMobile);

if (PT) {
  PT.onNavigate((page) => gotoPage(page));
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
const saveLoc = () => { localStorage.setItem('ptl', JSON.stringify({ lat: S.lat, lon: S.lon, city: S.city, country: S.country })); pushCfg(); };
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
  if (PT) { PT.setTheme(id); if (S.cfg.widget) PT.widgetToggle(true); }
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
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  const pg = $('page-' + name); if (pg) pg.classList.add('active');
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
function timeStrToDate(str, base = new Date()) {
  const [h, m] = String(str).split(':').map(Number);
  const d = new Date(base); d.setHours(h, m, 0, 0);
  return d;
}
function adjTime(name, str) {
  const off = (S.cfg.offsets[name] || 0);
  const [h, m] = String(str).split(':').map(Number);
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
function netFetch(url) {
  const key = url.split('?')[0];
  if (!navigator.onLine) return Promise.reject(new Error('offline'));
  if (_netInflight.has(key)) return _netInflight.get(key);
  const delay = _netBackoff.get(key) || 0;
  const p = (async () => {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      _netBackoff.delete(key);
      return r;
    } catch (e) {
      _netBackoff.set(key, Math.min(60000, (delay || 1000) * 2));
      throw e;
    } finally {
      _netInflight.delete(key);
    }
  })();
  _netInflight.set(key, p);
  return p;
}

async function fetchTimes(lat, lon) {
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
  const n = new Date();
  const url = `https://api.aladhan.com/v1/timingsByCity/${pad2(n.getDate())}-${pad2(n.getMonth() + 1)}-${n.getFullYear()}?city=${encodeURIComponent(city)}&country=${encodeURIComponent(country)}&method=${S.cfg.method}`;
  try {
    const r = await netFetch(url); const d = await r.json();
    if (d.code !== 200) throw new Error(d.status);
    S.times = d.data.timings; S.hijri = d.data.date.hijri;
    if (d.data.meta) { S.lat = d.data.meta.latitude; S.lon = d.data.meta.longitude; }
    S.city = city; S.country = country; saveLoc(); saveTimes();
    renderAll(); closeLocModal(); showToast('✅ ' + t('toast.locSet'));
  } catch (e) { showToast('❌ ' + t('toast.locFail')); }
}

/* ═══ OFFLINE SCHEDULE (main process, for dashboard sun section) ═══ */
async function refreshTodaySchedule() {
  if (!PT || S.lat == null) return;
  try {
    S.todaySchedule = await PT.getDay(new Date().toISOString().slice(0, 10), {
      lat: S.lat, lon: S.lon, method: S.cfg.method, madhab: S.cfg.madhab,
    });
    renderSunSection();
  } catch (e) { /* offline without main process — hide sun section */ }
}

/* ═══ DASHBOARD ═══ */
function renderAll() {
  renderDashboard();
  renderSunSection(); // API-backed rows in browser; full night times via ptGetDay on desktop
  if (window.renderQibla) renderQibla();
  if (window.renderCalendar && document.getElementById('page-calendar').classList.contains('active')) renderCalendar();
  updateLocNames();
}

function nextPrayerInfo() {
  if (!S.times) return null;
  const now = new Date();
  const list = PRAYERS.map((p) => ({ prayer: p, at: adjTime(p, S.times[p]) }));
  let next = list.find((x) => x.at > now);
  let isTomorrow = false;
  if (!next) {
    const d = adjTime('Fajr', S.times.Fajr); d.setDate(d.getDate() + 1);
    next = { prayer: 'Fajr', at: d };
    isTomorrow = true;
  }
  const idx = PRAYERS.indexOf(next.prayer);
  return { next, isTomorrow, idx };
}

function renderDashboard() {
  if (!S.times) return;

  // Hero
  const info = nextPrayerInfo();
  $('heroName').textContent = S.lang === 'ar' ? AR_PRAYER[info.next.prayer] : info.next.prayer;
  $('heroTime').textContent = fmt(info.next.at) + (info.isTomorrow ? ` · ${t('tomorrow')}` : '');
  $('heroGreg').textContent = fmtDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('heroHijri').textContent = S.hijri
    ? `${S.hijri.day} ${(S.lang === 'ar' ? HMA : HME)[parseInt(S.hijri.month.number) - 1]} ${S.hijri.year} ${S.lang === 'ar' ? 'هـ' : 'AH'}`
    : hijriOf(new Date());
  $('heroCdLbl').textContent = t('startsIn');
  $('heroNextLbl').textContent = t('nextPrayer');

  // Prayer cards
  const now = new Date();
  $('prayerCards').innerHTML = PRAYERS.map((p, i) => {
    const at = adjTime(p, S.times[p]);
    const isNext = info.idx === i && !info.isTomorrow;
    const isPast = at < now && !isNext;
    const sunrise = S.times.Sunrise ? `<div class="sr">${t('sunrise')} ${fmt(timeStrToDate(S.times.Sunrise))}</div>` : '';
    return `<div class="pcard pt-${p.toLowerCase()}${isNext ? ' next' : ''}${isPast ? ' past' : ''}">
      ${isNext ? `<span class="ribbon">${t('next')}</span>` : ''}
      <div class="ic">${ICON_PRAYER[p]}</div>
      <div class="nm">${S.lang === 'ar' ? AR_PRAYER[p] : p}</div>
      <div class="nm-ar">${S.lang === 'ar' ? p : AR_PRAYER[p]}</div>
      <div class="tm">${fmt(at)}</div>
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
    { i: '🌅', k: 'sunrise', lbl: t('sunrise'), v: S.times && S.times.Sunrise ? fmt(timeStrToDate(S.times.Sunrise)) : '—' },
    { i: '🌇', k: 'sunset', lbl: t('sunset'), v: S.times && S.times.Sunset ? fmt(timeStrToDate(S.times.Sunset)) : '—' },
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
  $('heroCd').textContent = fmtCountdown(info.next.at - new Date());
  // Refresh card states (next/past) every 30s; full re-render keeps headers fresh.
  if (++tickN % 30 === 0) renderDashboard();
}

/* ═══ QIBLA MATH (shared) ═══ */
const KAABA = { lat: 21.4225, lon: 39.8262 };
function qiblaBearing() {
  if (S.lat == null) return 0;
  const la = S.lat * Math.PI / 180, lo = S.lon * Math.PI / 180;
  const ml = KAABA.lat * Math.PI / 180, mlo = KAABA.lon * Math.PI / 180;
  const dL = mlo - lo;
  const y = Math.sin(dL) * Math.cos(ml);
  const x = Math.cos(la) * Math.sin(ml) - Math.sin(la) * Math.cos(ml) * Math.cos(dL);
  let b = Math.atan2(y, x) * 180 / Math.PI; if (b < 0) b += 360;
  return b;
}
function distToKaaba() {
  if (S.lat == null) return null;
  const R = 6371, dLat = (KAABA.lat - S.lat) * Math.PI / 180, dLon = (KAABA.lon - S.lon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(S.lat * Math.PI / 180) * Math.cos(KAABA.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
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
  navigator.geolocation.getCurrentPosition((pos) => {
    S.lat = pos.coords.latitude; S.lon = pos.coords.longitude; S.city = ''; S.country = '';
    saveLoc(); revGeo(S.lat, S.lon); fetchTimes(S.lat, S.lon); refreshTodaySchedule(); closeLocModal();
  }, () => showToast('❌ ' + t('toast.gpsDenied')), { timeout: 10000, maximumAge: 600000 });
}
async function revGeo(lat, lon) {
  try {
    const r = await netFetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
    const d = await r.json();
    S.city = d.address.city || d.address.town || d.address.village || d.address.county || '';
    S.country = d.address.country || '';
    saveLoc(); updateLocNames();
  } catch (e) { /* offline */ }
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
  document.getElementById('sbSub').textContent = t('sub');
  const navMap = { prayers: 'nav.prayers', calendar: 'nav.calendar', qibla: 'nav.qibla', quran: 'nav.quran', names: 'nav.names', dhikr: 'nav.dhikr', settings: 'nav.settings' };
  document.querySelectorAll('[data-page]').forEach((b) => {
    const key = navMap[b.dataset.page];
    const el = b.querySelector('.t'); if (el && key) el.textContent = t(key);
  });

  // Topbar
  $('offBadge').textContent = t('offline');
  $('tbDate').textContent = fmtDate(new Date(), { weekday: 'short', day: 'numeric', month: 'short' });

  // Dashboard labels
  $('lblToday').textContent = S.lang === 'ar' ? 'صلوات اليوم' : "Today's Prayers";
  $('lblSun').textContent = t('sunNight');
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
function init() {
  load();
  applyTheme(S.cfg.theme);
  applyLangStatic();       // nav/labels before data renders
  buildSwatches();

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

  // Restore cached view instantly
  if (S.times) renderAll();
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
  const n = new Date();
  const ms = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1) - n;
  setTimeout(() => { if (S.lat != null) fetchTimes(S.lat, S.lon); refreshTodaySchedule(); scheduleMidnight(); }, ms);
}

init();
