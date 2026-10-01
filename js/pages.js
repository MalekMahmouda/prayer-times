'use strict';

/* ════════════════════════════════════════════════════════════
   Prayer Times — page renderers.
   Depends on app.js: S, t(), $, fmt, adjTime, timeStrToDate, PT,
   qiblaBearing, distToKaaba, hijriOf, hijriDayNum, saveCfg,
   showToast, useGPS, openLocModal, pad2.
   All renderers are exposed on window for gotoPage()/applyLang().
   ════════════════════════════════════════════════════════════ */

/* ═══ QIBLA ═══ */
window.renderQibla = function renderQibla() {
  if (S.lat == null) return;
  const b = qiblaBearing();
  $('qDeg').textContent = `${Math.round(b)}°`;
  // Deliberate source (Phase 13): the ACTIVE location — never silently mixed
  // with device GPS. The location modal's GPS button is the explicit way to
  // make coordinates current.
  $('qSub').textContent = `${t('qibla.from')} ${S.city || `${S.lat.toFixed(2)}, ${S.lon.toFixed(2)}`}`;
  // Map-rose static render (v1.3.2): north up, Kaaba on the rim at its
  // bearing. The live compass (if any) takes over the dial from here.
  $('compassIn').style.transform = 'rotate(0deg)';
  $('kaabaMark').style.transform = `rotate(${b}deg) translate(78px) rotate(${-b}deg)`;
  // Live heading (Android/web sensors) rotates the dial by −heading so the
  // rose matches the world; desktop keeps the static map, honestly labeled —
  // it never pretends to have a live compass sensor (Phase 8).
  if (window.PTCompass) window.PTCompass.start();
  const d = distToKaaba();
  $('qDist').innerHTML = d != null
    ? `<span class="muted">${t('qibla.distance')}:</span> <b>${d.toLocaleString()}</b> ${t('qibla.km')}`
    : '';
};

/* ═══ CALENDAR ═══ */
const CAL = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: null };
const DOW_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOW_AR = ['إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'];

window.renderCalendar = function renderCalendar() {
  // Day-of-week header (Monday-first)
  $('calDowRow').innerHTML = (S.lang === 'ar' ? DOW_AR : DOW_EN).map((d) => `<div class="cal-dow">${d}</div>`).join('');

  const first = new Date(CAL.y, CAL.m, 1);
  const daysInMonth = new Date(CAL.y, CAL.m + 1, 0).getDate();
  const startCol = (first.getDay() + 6) % 7; // Monday-first index
  const todayKey = `${CAL.y}-${pad2(CAL.m + 1)}`;

  const stripYear = (s) => s.replace(/[,،]?\s*\d{4}\s*(هـ|AH)?\.?\s*$/, '');
  $('calTitle').innerHTML =
    `${fmtDate(first, { month: 'long', year: 'numeric' })}` +
    ` <span class="hj">${stripYear(hijriOf(first))} — ${stripYear(hijriOf(new Date(CAL.y, CAL.m, daysInMonth)))}</span>`;

  let html = '';
  for (let i = 0; i < startCol; i++) html += `<div class="cal-cell other" style="visibility:hidden"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(CAL.y, CAL.m, d);
    const isToday = date.toDateString() === new Date().toDateString();
    const isSel = CAL.sel === d;
    html += `<div class="cal-cell${isToday ? ' today' : ''}${isSel ? ' sel' : ''}" data-d="${d}">
      <div class="dg">${d}</div>
      <div class="hj">${hijriDayNum(date)}</div>
    </div>`;
  }
  $('calGrid').innerHTML = html;
  $('calGrid').querySelectorAll('.cal-cell[data-d]').forEach((el) => {
    el.onclick = () => { CAL.sel = +el.dataset.d; renderCalendar(); showCalDay(new Date(CAL.y, CAL.m, CAL.sel)); };
  });
  if (CAL.sel) showCalDay(new Date(CAL.y, CAL.m, CAL.sel));
};

const PRAYERS_CAL = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
let calDayCache = {};

async function showCalDay(date) {
  const panel = $('calDayPanel');
  panel.style.display = 'block';
  const key = localDateKey(date);
  panel.innerHTML = `<b>${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b>
    <div class="muted" style="font-size:12px">${hijriOf(date)}</div>
    <div class="muted" style="font-size:12px;margin-top:6px">${t('cal.noTimes')}…</div>`;
  let timings = calDayCache[key];
  if (!timings) {
    if (S.lat != null && window.Plat) {
      try {
        const res = await window.Plat.getDay(key, { lat: S.lat, lon: S.lon, method: S.cfg.method, madhab: S.cfg.madhab, offsets: S.cfg.offsets, tz: (typeof resolveTz === 'function' ? resolveTz() : '') });
        timings = res && res.timings; if (timings) calDayCache[key] = timings;
      } catch (e) { /* fall through */ }
    }
    if (!timings && S.lat != null && !window.Plat) {
      try { // ancient fallback: AlAdhan API for the specific date
        const r = await fetch(`https://api.aladhan.com/v1/timings/${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()}?latitude=${S.lat}&longitude=${S.lon}&method=${S.cfg.method}`);
        const d = await r.json();
        if (d.code === 200) { timings = d.data.timings; calDayCache[key] = timings; }
      } catch (e) { /* offline */ }
    }
  }
  if (!timings) { panel.querySelector('.muted:last-child').textContent = t('cal.noTimes'); return; }
  const labels = { Fajr: AR_PRAYER.Fajr, Sunrise: 'الشروق', Dhuhr: AR_PRAYER.Dhuhr, Asr: AR_PRAYER.Asr, Maghrib: AR_PRAYER.Maghrib, Isha: AR_PRAYER.Isha };
  panel.innerHTML = `<b>${fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b>
    <div class="muted" style="font-size:12px">${hijriOf(date)}</div>
    <div class="times">${PRAYERS_CAL.map((p) => `
      <div class="sun-cell"><div class="lbl">${S.lang === 'ar' ? labels[p] : p}</div>
      <div class="tm">${fmt(timeStrToDate(timings[p], date))}</div></div>`).join('')}</div>`;
}

window.calNav = function calNav(dir) {
  CAL.m += dir;
  if (CAL.m < 0) { CAL.m = 11; CAL.y--; }
  if (CAL.m > 11) { CAL.m = 0; CAL.y++; }
  CAL.sel = null;
  $('calDayPanel').style.display = 'none';
  renderCalendar();
};

window.exportMonthCsv = async function exportMonthCsv() {
  showToast('⬇ …');
  const days = new Date(CAL.y, CAL.m + 1, 0).getDate();
  const rows = [['Date', 'Hijri', 'Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']];
  for (let d = 1; d <= days; d++) {
    const date = new Date(CAL.y, CAL.m, d);
    const key = localDateKey(date);
    let timings = calDayCache[key];
    if (!timings && window.Plat && S.lat != null) {
      try { timings = (await window.Plat.getDay(key, { lat: S.lat, lon: S.lon, method: S.cfg.method, madhab: S.cfg.madhab, offsets: S.cfg.offsets, tz: (typeof resolveTz === 'function' ? resolveTz() : '') })).timings; calDayCache[key] = timings; } catch (e) { continue; }
    }
    if (!timings) continue;
    rows.push([key, hijriOf(date), timings.Fajr, timings.Sunrise, timings.Dhuhr, timings.Asr, timings.Maghrib, timings.Isha]);
  }
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prayer-times-${CAL.y}-${pad2(CAL.m + 1)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ═══ QURAN ═══ */
const qrAudio = new Audio();
qrAudio.preload = 'none';
let qrIdx = -1, qrPlaying = false, qrFallbackTried = false;

function qrUrl(n, reciterId) {
  const r = RECITERS.find((x) => x.id === reciterId) || RECITERS[0];
  return `https://cdn.islamic.network/quran/audio-surah/${r.br}/${r.id}/${n}.mp3`;
}

window.renderSurahList = function renderSurahList() {
  const q = $('qrSearch').value.toLowerCase().trim();
  const list = !q ? SURAHS : SURAHS.filter((s) =>
    s.ar.includes($('qrSearch').value.trim()) || s.en.toLowerCase().includes(q) || s.tr.toLowerCase().includes(q) || String(s.n) === q);
  $('surahList').innerHTML = list.length ? list.map((s) => {
    const gi = SURAHS.indexOf(s);
    return `<div class="surah-item${gi === qrIdx ? ' playing' : ''}" data-idx="${gi}">
      <div class="num">${s.n}</div>
      <div class="meta"><div class="ar">${s.ar}</div><div class="en">${s.en} · ${s.tr}</div></div>
      <div class="side"><span class="tag ${s.t === 'M' ? 'mc' : 'md'}">${s.t === 'M' ? t('quran.meccan') : t('quran.medinan')}</span>
      <span class="vs">${s.v} ${t('quran.verses')}</span></div>
    </div>`;
  }).join('') : `<div class="muted" style="padding:20px;text-align:center">${t('quran.noResults')}</div>`;
  $('surahList').querySelectorAll('.surah-item').forEach((el) => {
    el.onclick = () => qrLoadAndPlay(+el.dataset.idx);
  });
};

function qrSetPlayerVisibility(on) {
  $('player').classList.toggle('show', on);
}
function qrUpdateRows() {
  document.querySelectorAll('.surah-item').forEach((el) => el.classList.toggle('playing', +el.dataset.idx === qrIdx && qrPlaying));
}
function qrLoadAndPlay(idx) {
  qrIdx = idx; qrFallbackTried = false;
  const s = SURAHS[idx];
  qrSetPlayerVisibility(true);
  $('plNum').textContent = s.n;
  $('plAr').textContent = s.ar;
  $('plEn').textContent = `${s.en} · ${RECITERS.find((r) => r.id === S.cfg.reciter)?.en || RECITERS[0].en}`;
  qrAudio.src = qrUrl(s.n, S.cfg.reciter);
  qrAudio.load();
  // Autoplay policy may reject the first play(); the play/pause button state
  // stays consistent and the next user tap retries.
  qrAudio.play().catch(() => {});
}
window.qrToggle = function () {
  if (qrIdx < 0) { qrLoadAndPlay(0); return; }
  if (qrPlaying) qrAudio.pause(); else qrAudio.play().catch(() => {});
};
window.qrStop = function () {
  qrAudio.pause(); qrAudio.currentTime = 0; qrAudio.src = '';
  qrPlaying = false; qrIdx = -1;
  $('plPlay').textContent = '▶'; $('plPlay').classList.remove('playing');
  qrSetPlayerVisibility(false); qrUpdateRows();
};

/* player events */
qrAudio.addEventListener('play', () => { qrPlaying = true; $('plPlay').textContent = '⏸'; $('plPlay').classList.add('playing'); qrUpdateRows(); });
qrAudio.addEventListener('pause', () => { qrPlaying = false; $('plPlay').textContent = '▶'; $('plPlay').classList.remove('playing'); qrUpdateRows(); });
qrAudio.addEventListener('timeupdate', () => {
  if (!qrAudio.duration) return;
  $('plFill').style.width = (qrAudio.currentTime / qrAudio.duration) * 100 + '%';
  $('plElapsed').textContent = fmtSecs(qrAudio.currentTime);
});
qrAudio.addEventListener('durationchange', () => { $('plDur').textContent = fmtSecs(qrAudio.duration); });
qrAudio.addEventListener('ended', () => { if (qrIdx < SURAHS.length - 1) qrLoadAndPlay(qrIdx + 1); else window.qrStop(); });
qrAudio.addEventListener('error', () => {
  // Reciter fallback: if a non-default reciter fails, retry with Alafasy once.
  if (S.cfg.reciter !== RECITERS[0].id && !qrFallbackTried && qrIdx >= 0) {
    qrFallbackTried = true;
    qrAudio.src = qrUrl(SURAHS[qrIdx].n, RECITERS[0].id);
    qrAudio.play().catch(() => {});
    return;
  }
  showToast('⚠️ ' + t('quran.loading'));
});
function fmtSecs(s) {
  if (!s || isNaN(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/* ═══ 99 NAMES ═══ */
window.renderNames = function renderNames() {
  const dayIdx = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000) % 99;
  const hero = ASMA[dayIdx];
  $('nhAr').textContent = hero.ar;
  $('nhTr').textContent = hero.tr;
  $('nhEn').textContent = hero.en;
  $('nhDh').textContent = hero.dhikr;

  const q = $('nmSearch').value.toLowerCase().trim();
  const list = !q ? ASMA : ASMA.filter((x) =>
    x.tr.toLowerCase().includes(q) || x.en.toLowerCase().includes(q) || x.ar.includes(q) || x.ar2.includes(q) || String(x.n) === q);
  $('namesGrid').innerHTML = list.length ? list.map((x) => `
    <div class="ncard${x.n === hero.n ? ' today' : ''}" data-n="${x.n}">
      <div class="nn">${String(x.n).padStart(2, '0')}</div>
      <div class="nar">${x.ar}</div>
      <div class="ntr">${x.tr}</div>
      <div class="nen">${x.en.split('—')[0]}</div>
    </div>`).join('') : `<div class="muted" style="grid-column:1/-1;text-align:center;padding:18px">${t('names.noResults')}</div>`;
  $('namesGrid').querySelectorAll('.ncard').forEach((el) => {
    el.onclick = () => openName(+el.dataset.n);
  });
};
function openName(n) {
  const x = ASMA.find((a) => a.n === n); if (!x) return;
  $('nmNum').textContent = `${String(x.n).padStart(2, '0')} / 99`;
  $('nmArabic').textContent = x.ar;
  $('nmTr').textContent = x.tr;
  $('nmEn').textContent = x.en;
  $('nmAr2').textContent = x.ar2;
  $('nmDhikr').textContent = x.dhikr;
  $('nmDhikrLbl').textContent = t('names.dhikr');
  $('nameOverlay').classList.add('open');
}

/* ═══ DHIKR ═══ */
const RING_C = 666; // 2πr, r=106

window.renderDhikr = function renderDhikr() {
  const dh = S.cfg.dhikr;
  const chips = $('dhikrChips');
  chips.innerHTML = DHIKR_PRESETS.map((p) => {
    const lbl = S.lang === 'ar' ? p.arLabel : p.en;
    return `<button class="chip${dh.preset === p.id ? ' active' : ''}" data-id="${p.id}">${lbl}</button>`;
  }).join('');
  chips.querySelectorAll('.chip').forEach((c) => {
    c.onclick = () => { dh.preset = c.dataset.id; dh.count = 0; saveCfg(); renderDhikr(); };
  });

  const preset = DHIKR_PRESETS.find((p) => p.id === dh.preset) || DHIKR_PRESETS[0];
  const word = S.lang === 'ar' ? preset.ar : preset.en;
  $('dhikrWord').textContent = word;
  $('dhikrCount').textContent = dh.count;
  $('dhikrTargetLbl').textContent = `${t('dhikr.target')}: ${dh.target}`;
  $('dhVal').textContent = dh.count;
  $('dhTargetSel').value = [33, 100, 300].includes(+dh.target) ? String(dh.target) : 'custom';
  $('dhCustom').style.display = [33, 100, 300].includes(+dh.target) ? 'none' : 'inline-block';

  const today = localDateKey();
  $('dhDaily').textContent = (dh.daily[today] || {}).all || 0;
  $('dhTotal').textContent = Object.values(dh.totals).reduce((a, b) => a + (b.all || 0), 0);
  $('dhRound').textContent = `${dh.count % dh.target === 0 && dh.count > 0 ? dh.target : dh.count % dh.target}/${dh.target}`;

  const frac = Math.min(1, (dh.count % dh.target || (dh.count > 0 ? dh.target : 0)) / dh.target);
  $('ringFg').style.strokeDashoffset = String(RING_C * (1 - frac));
};

function dhikrCount() {
  const dh = S.cfg.dhikr;
  dh.count++;
  const today = localDateKey();
  dh.daily[today] = dh.daily[today] || { all: 0 };
  dh.daily[today].all++;
  dh.totals[dh.preset] = dh.totals[dh.preset] || { all: 0 };
  dh.totals[dh.preset].all++;
  if (dh.count % dh.target === 0) { showToast('🌟 ' + t('dhikr.done')); beep(); }
  saveCfg(); renderDhikr();
}

/* ═══ SETTINGS ═══ */
window.fillSettingsSelects = function fillSettingsSelects() {
  // Themes (built-ins + saved custom themes)
  const customs = (typeof DB3 !== 'undefined' && DB3) ? DB3.customThemes : [];
  $('setTheme').innerHTML = THEMES.map((x) => `<option value="${x.id}">${S.lang === 'ar' ? x.ar : x.en}</option>`).join('')
    + customs.map((c) => `<option value="${c.id}">★ ${escHtml(c.name)}</option>`).join('');
  $('setTheme').value = S.cfg.theme;
  // Methods
  $('setMethod').innerHTML = METHODS.map((m) => `<option value="${m.id}">${S.lang === 'ar' ? m.ar : m.en}</option>`).join('');
  $('setMethod').value = S.cfg.method;
  // Adhan styles (label with friendly names)
  const adhanLabels = { alafasy: 'Mishary Alafasy', nafees: 'Ahmad al-Nafees', dubai: 'Alafasy – Dubai', zahrani: 'Mansour Al-Zahrani', turkey: 'Hafiz Özcan', classic: 'Alafasy – Classic' };
  $('setAdhanType').innerHTML = Object.keys(ADHAN_SOUNDS).map((k) => `<option value="${k}">${adhanLabels[k] || k}</option>`).join('');
  $('setAdhanType').value = S.cfg.adhanType;
  // Quran reciters
  $('setReciterSel').innerHTML = RECITERS.map((r) => `<option value="${r.id}">${S.lang === 'ar' ? r.ar : r.en}</option>`).join('');
  $('setReciterSel').value = S.cfg.reciter;
};

/* Android 12+ honesty (Phase 17): show the REAL notification + exact-alarm
   state from the plugin instead of claiming exact timing. Desktop/other:
   nothing rendered. */
function updateAndroidNotifStatus() {
  const tg = $('tgNotif'); if (!tg) return;
  const isAndroid = !!(window.Capacitor && window.Capacitor.isNativePlatform());
  let el = $('andNotifStatus');
  if (!isAndroid) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'andNotifStatus';
    el.className = 'muted';
    el.style.cssText = 'font-size:11px;margin-top:6px';
    (tg.closest('.row') || tg.parentElement).insertAdjacentElement('afterend', el);
  }
  el.textContent = '…';
  if (window.ptMobile && window.ptMobile.notifStatus) {
    window.ptMobile.notifStatus().then((s) => {
      const L = S.lang === 'ar';
      const disp = s.display === 'granted' ? (L ? 'الإشعارات: مسموحة' : 'Notifications: allowed')
        : s.display === 'denied' ? (L ? 'الإشعارات: مرفوضة — فعّلها من إعدادات النظام' : 'Notifications: denied — enable them in system settings')
        : (L ? 'الإشعارات: غير محددة' : 'Notifications: not determined');
      const exact = s.exact === true ? (L ? 'التنبيهات الدقيقة: مفعّلة' : 'Exact alarms: enabled')
        : s.exact === false ? (L ? 'التنبيهات الدقيقة: غير مفعّلة — قد تتأخر الإشعارات' : 'Exact alarms: off — alarms may be delayed by the system')
        : (L ? 'التنبيهات الدقيقة: غير معروفة' : 'Exact alarms: unknown');
      el.textContent = disp + ' · ' + exact;
    }).catch(() => { el.textContent = ''; });
  }
}

window.renderSettings = function renderSettings() {
  window.fillSettingsSelects();
  $('setLang').value = S.lang;
  $('setMadhab').value = S.cfg.madhab;
  $('setVol').value = S.cfg.adhanVol != null ? S.cfg.adhanVol : 1;
  $('tg24').classList.toggle('on', S.cfg.h24);
  $('tgNotif').classList.toggle('on', S.cfg.notif);
  updateAndroidNotifStatus();
  $('tgBeep').classList.toggle('on', S.cfg.beep);
  $('tgAdhan').classList.toggle('on', S.cfg.adhan);
  $('tgOverlay').classList.toggle('on', S.cfg.desktop.overlay);
  $('tgSww').classList.toggle('on', S.cfg.desktop.startWithWindows);
  $('tgCtt').classList.toggle('on', S.cfg.desktop.closeToTray);
  $('nbVal').textContent = S.cfg.notifMin;

  // Offsets
  $('offsetRows').innerHTML = PRAYERS.map((p) => `
    <div class="row"><span class="lbl">${S.lang === 'ar' ? AR_PRAYER[p] : p}</span>
    <div class="stepper"><button data-off="${p}" data-d="-1">−</button>
    <div class="val">${(S.cfg.offsets[p] > 0 ? '+' : '') + S.cfg.offsets[p]}</div>
    <button data-off="${p}" data-d="1">+</button></div></div>`).join('');
  $('offsetRows').querySelectorAll('[data-off]').forEach((b) => {
    b.onclick = () => {
      const p = b.dataset.off;
      S.cfg.offsets[p] = Math.max(-30, Math.min(30, (S.cfg.offsets[p] || 0) + (+b.dataset.d)));
      saveCfg(); renderSettings(); renderDashboard();
    };
  });

  // Per-prayer adhan: enable + reciter profile + volume (additive profiles; adhanType stays default)
  $('adhanPerRows').innerHTML = PRAYERS.map((p) => {
    const on = S.cfg.adhanPerPrayer[p] !== false;
    const prof = (S.cfg.adhanProfiles && S.cfg.adhanProfiles[p]) || {};
    return `<div class="row" style="flex-wrap:wrap">
      <span class="lbl" style="min-width:70px">${S.lang === 'ar' ? AR_PRAYER[p] : p}</span>
      <button class="toggle${on ? ' on' : ''}" data-adp="${p}" title="Adhan enabled"></button>
      <select class="select" data-prof-rec="${p}" style="max-width:150px;font-size:12px">
        <option value="">${S.lang === 'ar' ? 'المؤذن الافتراضي' : 'Default muadhdhin'}</option>
        ${Object.keys(ADHAN_SOUNDS).map((k) => `<option value="${k}" ${prof.reciter === k ? 'selected' : ''}>${k}</option>`).join('')}
      </select>
      <input type="range" data-prof-vol="${p}" min="0" max="1" step="0.05" value="${prof.vol != null ? prof.vol : 1}" style="width:80px" title="Volume">
      <span style="font-size:11px;color:var(--text-muted);min-width:34px">${prof.vol != null ? Math.round(prof.vol * 100) + '%' : '—'}</span>
    </div>`;
  }).join('');
  $('adhanPerRows').querySelectorAll('[data-adp]').forEach((b) => {
    b.onclick = () => {
      const p = b.dataset.adp;
      S.cfg.adhanPerPrayer[p] = S.cfg.adhanPerPrayer[p] === false ? true : false;
      saveCfg(); renderSettings();
    };
  });
  $('adhanPerRows').querySelectorAll('[data-prof-rec]').forEach((sel) => {
    sel.onchange = () => {
      const p = sel.dataset.profRec;
      S.cfg.adhanProfiles = S.cfg.adhanProfiles || {};
      S.cfg.adhanProfiles[p] = S.cfg.adhanProfiles[p] || {};
      if (sel.value) S.cfg.adhanProfiles[p].reciter = sel.value; else delete S.cfg.adhanProfiles[p].reciter;
      if (!Object.keys(S.cfg.adhanProfiles[p]).length) delete S.cfg.adhanProfiles[p];
      saveCfg();
    };
  });
  $('adhanPerRows').querySelectorAll('[data-prof-vol]').forEach((inp) => {
    inp.oninput = () => {
      const p = inp.dataset.profVol;
      S.cfg.adhanProfiles = S.cfg.adhanProfiles || {};
      S.cfg.adhanProfiles[p] = S.cfg.adhanProfiles[p] || {};
      S.cfg.adhanProfiles[p].vol = parseFloat(inp.value);
      saveCfg(); renderSettings();
    };
  });

  // Widget & mini toggles
  $('tgWidget').classList.toggle('on', !!S.cfg.widget);
  $('tgMini').classList.toggle('on', !!S.cfg.mini);
  const im = (typeof DB3 !== 'undefined' && DB3 && DB3.prefs.ramadan) ? DB3.prefs.ramadan.imsakOffset : 10;
  $('imsakVal').textContent = im;
};

/* ═══ SETTINGS EVENT WIRING (once) ═══ */
function wireSettings() {
  $('setLang').onchange = (e) => { S.lang = e.target.value; localStorage.setItem('ptlg', S.lang); applyLang(); pushCfg(); };
  $('setTheme').onchange = (e) => { applyTheme(e.target.value); saveCfg(); };
  $('setMethod').onchange = (e) => { S.cfg.method = e.target.value; saveCfg(); if (S.lat != null) fetchTimes(S.lat, S.lon); };
  $('setMadhab').onchange = (e) => { S.cfg.madhab = e.target.value; saveCfg(); refreshTodaySchedule(); };
  $('tg24').onclick = () => { S.cfg.h24 = !S.cfg.h24; saveCfg(); renderSettings(); renderDashboard(); };
  $('tgNotif').onclick = () => { S.cfg.notif = !S.cfg.notif; saveCfg(); renderSettings(); };
  $('tgBeep').onclick = () => { S.cfg.beep = !S.cfg.beep; saveCfg(); renderSettings(); };
  $('tgAdhan').onclick = () => { S.cfg.adhan = !S.cfg.adhan; saveCfg(); renderSettings(); };
  $('tgOverlay').onclick = () => { S.cfg.desktop.overlay = !S.cfg.desktop.overlay; if (PT) PT.setOverlayEnabled(S.cfg.desktop.overlay); saveCfg(); renderSettings(); };
  $('tgSww').onclick = () => { S.cfg.desktop.startWithWindows = !S.cfg.desktop.startWithWindows; if (PT) PT.setStartWithWindows(S.cfg.desktop.startWithWindows); saveCfg(); renderSettings(); };
  $('tgCtt').onclick = () => { S.cfg.desktop.closeToTray = !S.cfg.desktop.closeToTray; if (PT) PT.setCloseToTray(S.cfg.desktop.closeToTray); saveCfg(); renderSettings(); };
  // notifMin = 0 is VALID (alert exactly at prayer time) — stepper range 0…60.
  $('nbMinus').onclick = () => { S.cfg.notifMin = Math.max(0, (parseInt(S.cfg.notifMin, 10) || 0) - 5); saveCfg(); renderSettings(); };
  $('nbPlus').onclick = () => { S.cfg.notifMin = Math.min(60, (parseInt(S.cfg.notifMin, 10) || 0) + 5); saveCfg(); renderSettings(); };
  $('setVol').oninput = (e) => { S.cfg.adhanVol = parseFloat(e.target.value); saveCfg(); };
  $('setAdhanType').onchange = (e) => { S.cfg.adhanType = e.target.value; saveCfg(); };
  $('setReciterSel').onchange = (e) => { S.cfg.reciter = e.target.value; saveCfg(); if (qrIdx >= 0) qrLoadAndPlay(qrIdx); };
  $('btnTestAdhan').onclick = testAdhan;
  $('tgWidget').onclick = toggleWidgetSetting;
  $('tgMini').onclick = toggleMiniMode;
  $('imsakMinus').onclick = () => { DB3.prefs.ramadan = DB3.prefs.ramadan || { imsakMode: 'fajrOffset', imsakOffset: 10 }; DB3.prefs.ramadan.imsakOffset = Math.max(0, DB3.prefs.ramadan.imsakOffset - 1); save3(); renderSettings(); };
  $('imsakPlus').onclick = () => { DB3.prefs.ramadan = DB3.prefs.ramadan || { imsakMode: 'fajrOffset', imsakOffset: 10 }; DB3.prefs.ramadan.imsakOffset = Math.min(30, DB3.prefs.ramadan.imsakOffset + 1); save3(); renderSettings(); };
  $('btnTestNotif').onclick = () => {
    if (PT) { PT.testAlert(); showToast('🔔 ' + t('toast.testIn3')); }
    else if ('Notification' in window) { Notification.requestPermission().then((p) => { if (p === 'granted') new Notification('Prayer Time 🕌', { body: 'Test notification' }); }); }
    else showToast('⚠️ ' + t('toast.deskOnly'));
  };

  // Quran controls
  $('qrSearch').oninput = renderSurahList;
  $('plPlay').onclick = window.qrToggle;
  $('plStop').onclick = window.qrStop;
  $('plPrev').onclick = () => { if (qrIdx > 0) qrLoadAndPlay(qrIdx - 1); };
  $('plNext').onclick = () => { if (qrIdx < SURAHS.length - 1) qrLoadAndPlay(qrIdx + 1); };
  $('plVol').oninput = (e) => { qrAudio.volume = parseFloat(e.target.value); };
  $('plBar').onclick = (e) => {
    if (!qrAudio.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    qrAudio.currentTime = ((e.clientX - r.left) / r.width) * qrAudio.duration;
  };

  // Names
  $('nmSearch').oninput = renderNames;
  $('nmClose').onclick = () => $('nameOverlay').classList.remove('open');
  $('nameOverlay').addEventListener('click', (e) => { if (e.target === $('nameOverlay')) $('nameOverlay').classList.remove('open'); });

  // Calendar
  $('calPrev').onclick = () => calNav(-1);
  $('calNext').onclick = () => calNav(1);
  $('calToday').onclick = () => { const n = new Date(); CAL.y = n.getFullYear(); CAL.m = n.getMonth(); CAL.sel = n.getDate(); renderCalendar(); showCalDay(n); };
  $('calExport').onclick = window.exportMonthCsv;

  // Dhikr
  $('dhikrRing').onclick = dhikrCount;
  $('dhPlus').onclick = dhikrCount;
  $('dhMinus').onclick = () => { S.cfg.dhikr.count = Math.max(0, S.cfg.dhikr.count - 1); saveCfg(); renderDhikr(); };
  $('dhResetBtn').onclick = () => { S.cfg.dhikr.count = 0; saveCfg(); renderDhikr(); };
  $('dhTargetSel').onchange = (e) => {
    if (e.target.value === 'custom') {
      // window.prompt is unsupported in Electron — use the inline input instead.
      $('dhCustom').style.display = 'inline-block';
      $('dhCustom').focus();
      return;
    }
    $('dhCustom').style.display = 'none';
    S.cfg.dhikr.target = +e.target.value;
    saveCfg(); renderDhikr();
  };
  const applyCustomTarget = () => {
    const v = parseInt($('dhCustom').value, 10);
    if (v >= 10 && v <= 10000) { S.cfg.dhikr.target = v; saveCfg(); renderDhikr(); }
  };
  $('dhCustom').onchange = applyCustomTarget;
  $('dhCustom').onkeydown = (e) => { if (e.key === 'Enter') applyCustomTarget(); };
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.getElementById('page-dhikr').classList.contains('active')
      && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      e.preventDefault(); dhikrCount();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  wireSettings();
  if (window.wireQuranTabs) window.wireQuranTabs();   // Phase 3 reader/search/bookmarks
});
