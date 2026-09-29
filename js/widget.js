'use strict';

/**
 * Widget / mini-mode — presentation only.
 * All scheduling lives in the main process; this page renders pushes.
 * Theme: explicit isDark flag from the main process (works for ALL themes,
 * including customs) — never a hard-coded theme-name list.
 */

const el = (id) => document.getElementById(id);
const AR_NAMES = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
let mode = { mini: false };

function applyMode(m) {
  mode = m || {};
  document.body.classList.toggle('mini', !!mode.mini);
  if (mode.theme && typeof mode.theme === 'object') applyDark(!!mode.theme.isDark);
  renderInfo(lastInfo); // re-render chips immediately when mini toggles on
}

function applyDark(isDark) {
  document.body.classList.toggle('light', !isDark);
}

function arabicName(p) {
  return AR_NAMES[p] || p || '—'; // never render "undefined"
}

function renderInfo(info) {
  if (!info || !info.next) return;
  const ar = info.lang === 'ar';
  el('wPrayer').textContent = ar ? arabicName(info.next.prayer) : info.next.prayer;
  el('wTime').textContent = info.next.hhmm || '';
  el('wCd').textContent = info.next.countdown || '--:--:--';
  el('wLbl').textContent = ar ? 'الصلاة القادمة' : 'Next Prayer';
  el('wCdLbl').textContent = ar ? 'تبدأ بعد' : 'starts in';
  el('wTitle').textContent = ar ? 'أوقات الصلاة' : 'Prayer Times';
  if (mode.mini && Array.isArray(info.times)) {
    el('wTimes').innerHTML = info.times.map((t) =>
      `<span class="tchip">${ar ? arabicName(t.prayer) : String(t.prayer || '').slice(0, 3)} <b>${t.time}</b></span>`).join('');
  }
}

// Local 1s smoothing of the countdown between scheduler pushes (display only —
// all scheduling, alerts and adhan remain in the main process).
let lastInfo = null, cdTimer = null, baseSecs = null, lastStamp = 0;
const h0 = (v) => Math.floor(v);
function startCd() {
  if (cdTimer) return;
  cdTimer = setInterval(() => {
    if (!lastInfo || !lastInfo.next) return;
    const now = Date.now();
    if (baseSecs == null) {
      const [h, m, s] = (lastInfo.next.countdown || '0:0:0').split(':').map(Number);
      baseSecs = h * 3600 + m * 60 + s; lastStamp = now;
    }
    const left = Math.max(0, baseSecs - Math.floor((now - lastStamp) / 1000));
    el('wCd').textContent = [h0(left / 3600), h0((left % 3600) / 60), h0(left % 60)].map(Math.floor).map((v) => String(v).padStart(2, '0')).join(':');
  }, 1000);
}

if (window.ptWidget) {
  window.ptWidget.onMode(applyMode);
  window.ptWidget.onInfo((info) => { lastInfo = info; baseSecs = null; startCd(); renderInfo(info); });
  window.ptWidget.getTheme().then((th) => applyDark(th && typeof th === 'object' ? !!th.isDark : !!th)).catch(() => {});
}

el('wClose').addEventListener('click', () => window.close());
el('wExpand').addEventListener('click', () => { if (window.ptWidget) window.ptWidget.expand(); });
