'use strict';

/* ════════════════════════════════════════════════════════════
   pages3 — Phase 3 renderers.
   Depends on: Store3, S, t(), $, fmt, fmtDate, AR_PRAYER, PRAYERS,
   saveCfg, showToast, qiblaBearing, hijriOf, PT (desktop bridge),
   applyTheme. All storage via DB3/pt3 (additive key).
   ════════════════════════════════════════════════════════════ */

let DB3 = Store3.load();
const save3 = () => Store3.save(DB3);
const dateKeyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ═══ PRAYER HISTORY (explicit three-state recording) ═══ */
const HIST_META = {
  '': { icon: '○', lbl: { en: 'Not recorded', ar: 'غير مسجلة' }, cls: 'hs-none' },
  done: { icon: '✓', lbl: { en: 'Completed', ar: 'مكتملة' }, cls: 'hs-done' },
  missed: { icon: '×', lbl: { en: 'Missed', ar: 'فائتة' }, cls: 'hs-missed' },
};
let histDate = dateKeyOf(new Date());

window.renderHistory = function renderHistory(elId) {
  const chips = $(elId || 'histChips'); if (!chips) return;
  const rec = Store3.historyGet(DB3, histDate);
  const d = new Date(histDate + 'T12:00:00');
  chips.innerHTML = PRAYERS.map((p) => {
    const st = rec[p] || '';
    const m = HIST_META[st];
    return `<button class="hchip ${m.cls}${st === 'done' ? ' hs-on' : ''}" data-p="${p}"
      title="${S.lang === 'ar' ? m.lbl.ar : m.lbl.en}" aria-label="${p}: ${S.lang === 'ar' ? m.lbl.ar : m.lbl.en}">
      <span class="hi">${m.icon}</span>
      <span class="hn">${S.lang === 'ar' ? AR_PRAYER[p] : p}</span>
      <span class="hs">${S.lang === 'ar' ? m.lbl.ar : m.lbl.en}</span>
    </button>`;
  }).join('');
  chips.querySelectorAll('.hchip').forEach((b) => {
    b.onclick = () => {
      Store3.historyCycle(DB3, histDate, b.dataset.p);
      save3(); renderHistory(elId); renderStatsIfVisible();
    };
  });
};

function histShift(days) {
  const d = new Date(histDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  histDate = dateKeyOf(d);
  renderHistory();
}
function histToday() { histDate = dateKeyOf(new Date()); renderHistory(); }

/* ═══ DHIKR LIBRARY ═══ */
let dhikrLibCat = 'morning';
window.renderDhikrLibrary = function renderDhikrLibrary() {
  const catChips = $('dhikrLibChips'); if (!catChips) return;
  catChips.innerHTML = DHIKR_LIBRARY.map((c) =>
    `<button class="chip${dhikrLibCat === c.id ? ' active' : ''}" data-cat="${c.id}">${S.lang === 'ar' ? c.ar : c.en}</button>`).join('');
  catChips.querySelectorAll('[data-cat]').forEach((b) => {
    b.onclick = () => { dhikrLibCat = b.dataset.cat; renderDhikrLibrary(); };
  });

  const cat = DHIKR_LIBRARY.find((c) => c.id === dhikrLibCat) || DHIKR_LIBRARY[0];
  const list = $('dhikrLibList');
  list.innerHTML = cat.items.map((it) => {
    const fav = DB3.dhikrFavs.includes(it.id);
    const prog = (DB3.prefs.dhikrProg || {})[it.id] || 0;
    return `<div class="card" style="padding:14px 16px;margin-bottom:9px;display:flex;align-items:center;gap:14px">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-ar);font-size:18px;font-weight:700;line-height:1.7" dir="rtl">${it.ar}</div>
        <div style="font-size:12.5px;color:var(--text-muted);margin-top:4px">${S.lang === 'ar' ? it.ar : it.en}</div>
        ${it.tr ? `<div style="font-size:11px;color:var(--text-muted);font-style:italic">${it.tr} · ${t('dhikr.target')}: ${it.count}</div>` : ''}
      </div>
      <button class="btn sm" data-count="${it.id}" title="Count">＋ ${prog > 0 ? prog : ''}</button>
      <button class="icon-btn" data-fav="${it.id}" title="Favorite" aria-pressed="${fav}" style="${fav ? 'color:var(--gold)' : ''}">${fav ? '★' : '☆'}</button>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-fav]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.fav;
      const i = DB3.dhikrFavs.indexOf(id);
      if (i >= 0) DB3.dhikrFavs.splice(i, 1); else DB3.dhikrFavs.push(id);
      save3(); renderDhikrLibrary();
    };
  });
  list.querySelectorAll('[data-count]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.count;
      DB3.prefs.dhikrProg = DB3.prefs.dhikrProg || {};
      DB3.prefs.dhikrProg[id] = ((DB3.prefs.dhikrProg[id] || 0) + 1);
      // reset suggestion when reaching common target multiples
      const item = cat.items.find((x) => x.id === id);
      if (item && DB3.prefs.dhikrProg[id] >= item.count) DB3.prefs.dhikrProg[id] = 0;
      save3(); renderDhikrLibrary();
    };
  });
};

/* ═══ LOCATIONS MANAGER ═══ */
window.renderLocations = function renderLocations() {
  const el = $('locsList'); if (!el) return;
  const activeId = DB3.prefs.activeLoc || '';
  el.innerHTML = DB3.locations.length ? DB3.locations.map((l) => {
    const isActive = l.id === activeId;
    return `<div class="row" style="border:1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};border-radius:12px;padding:8px 12px">
      <div style="min-width:0">
        <div style="font-size:13.5px;font-weight:650">${isActive ? '⭐ ' : '📍 '}${escHtml(l.name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${escHtml(l.city || '')}${l.country ? ', ' + escHtml(l.country) : ''} · ${l.latitude.toFixed(2)}, ${l.longitude.toFixed(2)}</div>
        <div style="font-size:10.5px;color:var(--text-muted)">${l.timezone ? '🕑 ' + escHtml(l.timezone) : (S.lang === 'ar' ? '🕑 منطقة زمنية: النظام' : '🕑 Timezone: system')}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${isActive ? '' : `<button class="btn sm" data-loc-use="${l.id}">${S.lang === 'ar' ? 'تنشيط' : 'Use'}</button>`}
        <button class="icon-btn" data-loc-edit="${l.id}" title="Edit" style="width:30px;height:30px;font-size:13px">✏️</button>
        <button class="icon-btn" data-loc-del="${l.id}" title="Delete" style="width:30px;height:30px;font-size:13px">🗑️</button>
      </div>
    </div>`;
  }).join('') : `<div class="muted" style="font-size:12.5px;padding:6px 0">${S.lang === 'ar' ? 'لا مواقع محفوظة بعد.' : 'No saved locations yet.'}</div>`;

  el.querySelectorAll('[data-loc-use]').forEach((b) => (b.onclick = () => activateLocation(b.dataset.locUse)));
  el.querySelectorAll('[data-loc-del]').forEach((b) => (b.onclick = () => {
    const loc = DB3.locations.find((l) => l.id === b.dataset.locDel);
    if (!loc) return;
    if (!confirm(S.lang === 'ar' ? `حذف "${loc.name}"؟` : `Delete "${loc.name}"?`)) return;
    DB3.locations = DB3.locations.filter((l) => l.id !== b.dataset.locDel);
    if (DB3.prefs.activeLoc === b.dataset.locDel) delete DB3.prefs.activeLoc;
    save3(); renderLocations();
  }));
  el.querySelectorAll('[data-loc-edit]').forEach((b) => (b.onclick = () => editLocation(b.dataset.locEdit)));
};

function escHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function activateLocation(id) {
  const loc = DB3.locations.find((l) => l.id === id);
  if (!loc) return;
  // Explicit user action only — never silent.
  S.lat = loc.latitude; S.lon = loc.longitude; S.city = loc.city; S.country = loc.country;
  DB3.prefs.activeLoc = id; save3();
  saveLoc();                       // existing Phase 2 flow (pts/ptl unchanged)
  fetchTimes(S.lat, S.lon);
  refreshTodaySchedule();
  updateLocNames();
  showToast('✅ ' + (S.lang === 'ar' ? `التنشيط: ${loc.name}` : `Active: ${loc.name}`));
}

function editLocation(id) {
  const loc = DB3.locations.find((l) => l.id === id); if (!loc) return;
  const L = S.lang === 'ar';
  openTextModal({
    title: L ? 'تعديل الموقع' : 'Edit location',
    label: L ? 'الاسم:' : 'Name:',
    initial: loc.name,
    onOK: (name) => {
      openTextModal({
        title: L ? 'تعديل الموقع' : 'Edit location',
        label: (L ? 'المنطقة الزمنية IANA (اتركها فارغة للنظام):' : 'IANA timezone (leave empty for system):') + '\n' + COMMON_TIMEZONES.slice(0, 4).join(', '),
        initial: loc.timezone || '',
        onOK: (tz) => {
          loc.name = name.trim().slice(0, 60) || loc.name;
          loc.timezone = tz.trim();
          if (loc.timezone && !isValidTimezone(loc.timezone)) {
            loc.timezone = '';
            showToast('⚠️ ' + (L ? 'منطقة زمنية غير صالحة — تم المسح' : 'Invalid timezone — cleared'));
          }
          save3(); renderLocations();
        },
      });
    },
  });
}

const COMMON_TIMEZONES = ['UTC', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Cairo', 'Asia/Jerusalem', 'Asia/Amman', 'Asia/Baghdad', 'Asia/Tehran', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Manila', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires', 'America/Indiana/Indianapolis'];

window.addCurrentLocation = function addCurrentLocation() {
  if (S.lat == null) { showToast('⚠️ ' + t('toast.noCity')); return; }
  const L = S.lang === 'ar';
  const tzGuess = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  openTextModal({
    title: L ? 'حفظ الموقع' : 'Save location',
    label: L ? 'اسم الموقع:' : 'Location name:',
    initial: S.city || `${S.lat.toFixed(2)}, ${S.lon.toFixed(2)}`,
    onOK: (name) => {
      openTextModal({
        title: L ? 'حفظ الموقع' : 'Save location',
        label: (L ? 'المنطقة الزمنية IANA (فارغة = النظام). استخدم منطقة الموقع نفسها إن كنت لا تسكن هناك:' : "IANA timezone (empty = system). Use the location's own zone if you are not there:") + '\n' + COMMON_TIMEZONES.slice(0, 8).join(', '),
        initial: tzGuess || 'UTC',
        onOK: (tz) => {
          const id = 'loc-' + Date.now();
          DB3.locations.push({
            id, name: name.trim().slice(0, 60) || 'Location',
            latitude: S.lat, longitude: S.lon, city: S.city || '', country: S.country || '',
            timezone: isValidTimezone(tz.trim()) ? tz.trim() : '',
          });
          save3(); renderLocations();
          showToast('⭐ ' + (L ? 'تم الحفظ' : 'Location saved'));
        },
      });
    },
  });
};

/* ═══ STATISTICS (record-based, neutral) ═══ */
window.renderStatsIfVisible = function renderStatsIfVisible() {
  if (document.getElementById('page-stats') && document.getElementById('page-stats').classList.contains('active')) renderStats();
};
window.renderStats = function renderStats() {
  const today = dateKeyOf(new Date());
  const rec = Store3.historyGet(DB3, today);

  // Today chips
  $('stToday').innerHTML = PRAYERS.map((p) => {
    const st = rec[p] || '';
    const m = HIST_META[st];
    return `<span class="hchip ${m.cls}" style="cursor:default"><span class="hi">${m.icon}</span><span class="hn">${S.lang === 'ar' ? AR_PRAYER[p] : p}</span></span>`;
  }).join('');

  // Streaks
  const sk = Store3.streaks(DB3);
  const tip = S.lang === 'ar' ? 'الأيام المتتالية التي سُجِّل فيها صلاة واحدة على الأقل' : 'Consecutive days with recorded prayer activity.';
  $('stStreak').innerHTML = `
    <div class="stat-mini" title="${tip}"><div class="v">${sk.current}</div><div class="l">${S.lang === 'ar' ? 'سلسلة حالية' : 'Current streak'} ⓘ</div></div>
    <div class="stat-mini" title="${tip}"><div class="v">${sk.longest}</div><div class="l">${S.lang === 'ar' ? 'أطول سلسلة' : 'Longest streak'} ⓘ</div></div>`;

  // Week / month summaries
  const weekAgo = dateKeyOf(new Date(Date.now() - 6 * 86400000));
  const monthStart = today.slice(0, 8) + '01';
  const wk = Store3.statsForRange(DB3, weekAgo, today);
  const mo = Store3.statsForRange(DB3, monthStart, today);
  const fmtSummary = (x, days) => `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
    <div><div style="font-size:20px;font-weight:800;color:var(--primary)">${x.completed}</div><div style="font-size:10.5px;color:var(--text-muted)">${S.lang === 'ar' ? 'مكتملة' : 'Completed'}</div></div>
    <div><div style="font-size:20px;font-weight:800;color:var(--warning)">${x.missed}</div><div style="font-size:10.5px;color:var(--text-muted)">${S.lang === 'ar' ? 'فائتة' : 'Missed'}</div></div>
    <div><div style="font-size:20px;font-weight:800">${x.recorded}/${days * 5}</div><div style="font-size:10.5px;color:var(--text-muted)">${S.lang === 'ar' ? 'مسجلة' : 'Recorded'}</div></div>
  </div>`;
  $('stWeek').innerHTML = fmtSummary(wk, 7);
  $('stMonth').innerHTML = fmtSummary(mo, new Date().getDate());

  // 30-day chart (CSS bars, height = recorded prayers, color = dominant state)
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = dateKeyOf(d);
    const r = DB3.history[k] || {};
    const done = PRAYERS.filter((p) => r[p] === 'done').length;
    const missed = PRAYERS.filter((p) => r[p] === 'missed').length;
    days.push({ k, d, done, missed, rec: done + missed });
  }
  const maxRec = 5;
  $('stChart').innerHTML = `<div style="display:flex;align-items:flex-end;gap:3px;height:120px">
    ${days.map((x) => {
      const h = (x.rec / maxRec) * 100;
      const color = x.missed > 0 && x.done === 0 ? 'var(--danger)' : (x.done > 0 && x.missed === 0 && x.rec === 5 ? 'var(--success)' : (x.rec === 0 ? 'var(--border)' : 'var(--warning)'));
      return `<div title="${x.k}: ${x.done} ✓ / ${x.missed} ×" style="flex:1;height:${Math.max(4, h)}%;background:${color};border-radius:3px 3px 0 0;opacity:${x.rec ? 1 : .45}"></div>`;
    }).join('')}
  </div><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);margin-top:4px">
    <span>${days[0].d.toLocaleDateString(S.lang === 'ar' ? 'ar-SA' : 'en-US', { month: 'short', day: 'numeric' })}</span>
    <span>${S.lang === 'ar' ? 'اليوم' : 'Today'}</span>
  </div>`;

  // Per-prayer totals (this month)
  const perPrayer = {};
  for (const p of PRAYERS) perPrayer[p] = { done: 0, missed: 0 };
  for (const [k, r] of Object.entries(DB3.history)) {
    if (!k.startsWith(today.slice(0, 7))) continue;
    for (const p of PRAYERS) {
      if (r[p] === 'done') perPrayer[p].done++;
      else if (r[p] === 'missed') perPrayer[p].missed++;
    }
  }
  const maxPP = Math.max(1, ...Object.values(perPrayer).map((x) => Math.max(x.done, x.missed)));
  $('stByPrayer').innerHTML = PRAYERS.map((p) => {
    const x = perPrayer[p];
    return `<div style="margin-bottom:9px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
        <span style="font-weight:650">${S.lang === 'ar' ? AR_PRAYER[p] : p}</span>
        <span class="muted">${x.done} ✓ · ${x.missed} ×</span>
      </div>
      <div style="height:9px;background:var(--surface2);border-radius:5px;overflow:hidden;display:flex">
        <div style="width:${(x.done / maxPP) * 100}%;background:var(--success);transition:width .4s"></div>
        <div style="width:${(x.missed / maxPP) * 100}%;background:var(--warning);opacity:.75"></div>
      </div>
    </div>`;
  }).join('');
};

/* ═══ DAILY CONTENT (deterministic, verified local data only) ═══ */
const SHORT_AYAHS = [
  { s: 94, a: 6 }, { s: 65, a: 3 }, { s: 2, a: 152 }, { s: 13, a: 28 }, { s: 14, a: 7 },
  { s: 2, a: 286 }, { s: 3, a: 139 }, { s: 39, a: 53 }, { s: 94, a: 5 }, { s: 50, a: 16 },
  { s: 57, a: 4 }, { s: 2, a: 186 }, { s: 40, a: 60 }, { s: 29, a: 69 }, { s: 55, a: 13 },
];
window.renderDailyCard = function renderDailyCard(elId) {
  const el = $(elId || 'dailyCard'); if (!el) return;
  if (DB3.prefs.dailyContent === false) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const kind = doy % 3;
  let html = '';
  if (kind === 0) {
    const name = ASMA[doy % 99];
    html = `<div class="ntr" style="color:var(--gold);font-weight:700;font-size:12px">${t('names.day')}</div>
      <div style="font-family:var(--font-ar);font-size:30px;font-weight:800;color:var(--primary);margin:4px 0">${name.ar}</div>
      <div style="font-size:13.5px;color:var(--text-muted)">${escHtml(name.en.split('—')[0])}</div>`;
  } else if (kind === 1) {
    const ref = SHORT_AYAHS[doy % SHORT_AYAHS.length];
    const ay = QURAN_DATA ? (QURAN_DATA.surahs[ref.s - 1] || {}).ayahs : null;
    const a = ay ? ay[ref.a - 1] : null;
    if (!a) { el.style.display = 'none'; return; }
    html = `<div style="font-size:11px;color:var(--gold-ink);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${S.lang === 'ar' ? 'آية' : 'Ayah'} · ${ref.s}:${ref.a}</div>
      <div style="font-family:var(--font-ar);font-size:21px;line-height:2" dir="rtl">${a.ar}</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px;line-height:1.6">${escHtml(a.en)}</div>`;
  } else {
    const all = DHIKR_LIBRARY.flatMap((c) => c.items);
    const item = all[doy % all.length];
    html = `<div style="font-size:11px;color:var(--gold);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px">${S.lang === 'ar' ? 'ذكر' : 'Dhikr'}</div>
      <div style="font-family:var(--font-ar);font-size:20px;line-height:1.9" dir="rtl">${item.ar}</div>
      <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px">${escHtml(item.en)}</div>`;
  }
  el.innerHTML = `<div class="card" style="text-align:center">${html}</div>`;
};

/* ═══ RAMADAN (detection + card; Imsak = labeled estimate) ═══ */
function hijriMonthDay(date) {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(date);
    const get = (t) => parts.find((p) => p.type === t).value;
    return { day: +get('day'), month: +get('month'), year: +get('year') };
  } catch (e) { return null; }
}
window.renderRamadan = function renderRamadan(elId) {
  const el = $(elId || 'ramadanCard'); if (!el) return;
  const hj = hijriMonthDay(new Date());
  if (!hj || hj.month !== 9) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const imsakOff = (DB3.prefs.ramadan && DB3.prefs.ramadan.imsakOffset) || 10;
  const timings = S.times || (S.todaySchedule && S.todaySchedule.timings);
  if (!timings) { el.innerHTML = ''; return; }
  const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  // S.times strings are wall-clock in the ACTIVE LOCATION's timezone — compare
  // them against the location's current wall clock (zonedNowHM), never the
  // device's getHours(), or fasting/iftar windows shift by the zone offset.
  const nowMin = (typeof zonedNowHM === 'function') ? zonedNowHM(resolveTz())
    : (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); })();
  const imsakStr = timings.Fajr, maghribStr = timings.Maghrib;
  const imsakMin = toMin(imsakStr) - imsakOff;
  const iftarMin = toMin(maghribStr);
  const cdTo = (target) => {
    let diff = target - nowMin; if (diff < 0) diff += 1440;
    return `${String(Math.floor(diff / 60)).padStart(2, '0')}:${String(diff % 60).padStart(2, '0')}`;
  };
  const fasting = nowMin >= imsakMin && nowMin < iftarMin;
  el.innerHTML = `<div class="card" style="background:var(--grad);color:#fff;border:none">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="font-size:15px;font-weight:800">🌙 ${S.lang === 'ar' ? 'رمضان — اليوم' : 'Ramadan — Day'} ${hj.day}</div>
      <div style="font-size:12px;color:rgba(255,255,255,.75)">${fasting ? (S.lang === 'ar' ? 'صائم' : 'Fasting today') : (S.lang === 'ar' ? 'وقت الإفطار' : 'Outside fasting hours')}</div>
    </div>
    <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:110px;background:rgba(255,255,255,.12);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:10.5px;color:rgba(255,255,255,.6)">${S.lang === 'ar' ? 'الإمساك (تقديري)' : 'Imsak (estimate)'}</div>
        <div style="font-size:17px;font-weight:750">${imsakStr} −${imsakOff}m</div>
        <div style="font-size:11px;color:var(--gold)">${S.lang === 'ar' ? 'بعد' : 'in'} ${cdTo(imsakMin)}</div>
      </div>
      <div style="flex:1;min-width:110px;background:rgba(255,255,255,.12);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:10.5px;color:rgba(255,255,255,.6)">${S.lang === 'ar' ? 'الإفطار' : 'Iftar'}</div>
        <div style="font-size:17px;font-weight:750">${maghribStr}</div>
        <div style="font-size:11px;color:var(--gold)">${S.lang === 'ar' ? 'بعد' : 'in'} ${cdTo(iftarMin)}</div>
      </div>
      <div style="flex:1;min-width:110px;background:rgba(255,255,255,.12);border-radius:12px;padding:10px;text-align:center">
        <div style="font-size:10.5px;color:rgba(255,255,255,.6)">${S.lang === 'ar' ? 'الفجر' : 'Fajr'}</div>
        <div style="font-size:17px;font-weight:750">${timings.Fajr}</div>
      </div>
    </div>
  </div>`;
};

/* ═══ BACKUP / RESTORE ═══ */
window.exportBackup = function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    pts: localStorage.getItem('pts'),
    ptl: localStorage.getItem('ptl'),
    ptlg: localStorage.getItem('ptlg'),
    pt3: localStorage.getItem('pt3'),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `prayertimes-backup-${dateKeyOf(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('⬇ ' + (S.lang === 'ar' ? 'تم تصدير النسخة الاحتياطية' : 'Backup exported'));
};

window.handleImportFile = function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); }
    catch (e) { showToast('❌ ' + (S.lang === 'ar' ? 'ملف غير صالح' : 'Invalid file')); return; }
    const v = validateBackup(data);
    if (!v.ok) { showToast('❌ ' + v.error); return; }
    // Preview + explicit confirmation — nothing replaced until confirmed.
    const lines = [
      `v${data.version} · ${data.exportedAt ? data.exportedAt.slice(0, 10) : '—'}`,
      `settings: ${data.pts ? '✓' : '—'} | location: ${data.ptl ? '✓' : '—'} | lang: ${data.ptlg ? '✓' : '—'}`,
      `history: ${Object.keys(v.pt3.history).length} days | bookmarks: ${v.pt3.bookmarks.length} | locations: ${v.pt3.locations.length} | themes: ${v.pt3.customThemes.length}`,
    ];
    if (!confirm((S.lang === 'ar' ? 'استيراد هذه النسخة واستبدال البيانات الحالية؟\n\n' : 'Import this backup and replace current data?\n\n') + lines.join('\n'))) {
      showToast((S.lang === 'ar' ? 'أُلغي الاستيراد — لم يتغير شيء' : 'Import cancelled — nothing changed'));
      return;
    }
    applyBackup(v);
  };
  reader.readAsText(file);
};

function validateBackup(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Not a valid backup object' };
  if (data.version !== 1) return { ok: false, error: 'Unsupported backup version: ' + data.version };
  for (const k of ['pts', 'ptl', 'ptlg', 'pt3']) {
    if (data[k] != null && typeof data[k] !== 'string') return { ok: false, error: 'Field ' + k + ' must be a JSON string or null' };
    if (data[k]) { try { JSON.parse(data[k]); } catch (e) { return { ok: false, error: 'Corrupt ' + k }; } }
  }
  // pt3 strictness: reuse the store's validator
  const pt3 = data.pt3 ? JSON.parse(data.pt3) : null;
  if (pt3) {
    try {
      const probe = Store3.merge(Store3.load(), pt3); // sanitize-only dry run
      if (!probe || probe.version !== 1) return { ok: false, error: 'Corrupt pt3' };
    } catch (e) { return { ok: false, error: 'Corrupt pt3' }; }
  }
  return { ok: true, pt3: pt3 || null, pts: data.pts || null, ptl: data.ptl || null, ptlg: data.ptlg || null };
}

function applyBackup(v) {
  try {
    if (v.pts) localStorage.setItem('pts', v.pts);
    if (v.ptl) localStorage.setItem('ptl', v.ptl);
    if (v.ptlg) localStorage.setItem('ptlg', v.ptlg);
    if (v.pt3) localStorage.setItem('pt3', v.pt3);
    showToast('✅ ' + (S.lang === 'ar' ? 'تم الاستيراد — جاري إعادة التحميل' : 'Imported — reloading'));
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    showToast('❌ ' + (S.lang === 'ar' ? 'فشل الاستيراد' : 'Import failed'));
  }
}

/* ═══ THEME BUILDER ═══ */
const TB_TOKENS = [
  ['bg', 'Background'], ['surface', 'Surface'], ['primary', 'Primary'], ['text', 'Text'],
  ['border', 'Border'], ['accent', 'Accent (gold)'],
  ['hFajr', 'Fajr hue'], ['hDhuhr', 'Dhuhr hue'], ['hAsr', 'Asr hue'], ['hMaghrib', 'Maghrib hue'], ['hIsha', 'Isha hue'],
];
let tbDraft = null;

window.renderThemeBuilder = function renderThemeBuilder() {
  const body = $('themeBuilderBody'); if (!body) return;
  const customs = DB3.customThemes;
  body.innerHTML = `
    <div class="row"><span class="lbl">${S.lang === 'ar' ? 'قوالبك' : 'Your themes'}</span>
      <select class="select" id="tbPick"><option value="">—</option>${customs.map((c) => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}</select></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0">
      ${TB_TOKENS.map(([k, lbl]) => `<label style="font-size:9.5px;color:var(--text-muted);text-align:center" title="${lbl}">
        <input type="color" data-tb="${k}" value="${(tbDraft && tbDraft[k]) || '#1a6e4f'}" style="width:100%;height:26px;border:none;background:none;cursor:pointer;padding:0">
        ${lbl.split(' ')[0]}</label>`).join('')}
    </div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      <button class="btn sm" id="tbApply">${S.lang === 'ar' ? 'معاينة' : 'Preview'}</button>
      <button class="btn sm" id="tbSave">${S.lang === 'ar' ? 'حفظ' : 'Save'}</button>
      <button class="btn sm" id="tbDelete">${S.lang === 'ar' ? 'حذف' : 'Delete'}</button>
      <button class="btn sm" id="tbReset">${S.lang === 'ar' ? 'استعادة' : 'Reset'}</button>
    </div>
    <div class="note">${S.lang === 'ar' ? 'القوالب المدمجة محمية — قوالبك تُحفظ منفصلة.' : 'Built-in themes are immutable — customs are stored separately.'}</div>`;

  body.querySelectorAll('[data-tb]').forEach((inp) => (inp.oninput = () => { tbDraft = tbDraft || {}; tbDraft[inp.dataset.tb] = inp.value; }));
  $('tbApply').onclick = () => { if (!tbDraft) return showToast('⚠️ Pick colors first'); applyCustomThemeDraft(); };
  $('tbSave').onclick = () => {
    if (!tbDraft) return showToast('⚠️ Pick colors first');
    const L = S.lang === 'ar';
    openTextModal({
      title: L ? 'حفظ القالب' : 'Save theme',
      label: L ? 'اسم القالب:' : 'Theme name:',
      initial: 'My Theme',
      onOK: (name) => {
        const id = 'custom-' + Date.now();
        DB3.customThemes.push({ id, name: name.trim().slice(0, 40) || 'Custom', tokens: { ...tbDraft } });
        save3(); renderThemeBuilder(); refreshThemeUI();
        showToast('🎨 ' + (L ? 'تم حفظ القالب' : 'Theme saved'));
      },
    });
  };
  $('tbDelete').onclick = () => {
    const id = $('tbPick').value; if (!id) return showToast('⚠️ Pick a theme');
    const wasActive = S.cfg.theme === id;
    DB3.customThemes = DB3.customThemes.filter((c) => c.id !== id);
    save3(); renderThemeBuilder(); refreshThemeUI();
    if (wasActive) { applyTheme('islamic'); saveCfg(); showToast((S.lang === 'ar' ? 'حُذف القالب النشط — رجعنا لإسلامي' : 'Active custom deleted — back to Islamic')); }
  };
  $('tbPick').onchange = (e) => {
    const c = DB3.customThemes.find((x) => x.id === e.target.value);
    tbDraft = c ? { ...c.tokens } : null;
    renderThemeBuilder();
  };
  $('tbReset').onclick = () => { tbDraft = null; renderThemeBuilder(); if (S.cfg.theme.startsWith('custom-')) { applyTheme('islamic'); saveCfg(); } };
};

function applyCustomThemeDraft() {
  if (!tbDraft) return;
  const root = document.body;
  const map = { bg: '--bg', surface: '--surface', primary: '--primary', text: '--text', border: '--border', accent: '--gold', hFajr: '--h-fajr', hDhuhr: '--h-dhuhr', hAsr: '--h-asr', hMaghrib: '--h-maghrib', hIsha: '--h-isha' };
  for (const [k, cssVar] of Object.entries(map)) {
    if (tbDraft[k]) root.style.setProperty(cssVar, tbDraft[k]);
  }
}
function clearCustomThemeOverrides() {
  ['--bg', '--surface', '--primary', '--text', '--border', '--gold', '--h-fajr', '--h-dhuhr', '--h-asr', '--h-maghrib', '--h-isha'].forEach((v) => document.body.style.removeProperty(v));
}

// Hook: applyTheme should clear draft overrides when switching themes.
(function () {
  const orig = window.applyTheme;
  window.applyTheme = function (id) {
    clearCustomThemeOverrides();
    // custom theme support: inject tokens when a custom theme is active
    const custom = id && id.startsWith('custom-') ? (typeof DB3 !== 'undefined' && DB3 ? DB3.customThemes.find((c) => c.id === id) : null) : null;
    if (custom) {
      orig('islamic'); // base tokens first (safe fallback)
      const map = { bg: '--bg', surface: '--surface', primary: '--primary', text: '--text', border: '--border', accent: '--gold', hFajr: '--h-fajr', hDhuhr: '--h-dhuhr', hAsr: '--h-asr', hMaghrib: '--h-maghrib', hIsha: '--h-isha' };
      for (const [k, v] of Object.entries(custom.tokens)) root_set(map[k], v);
      document.body.dataset.theme = id;
      document.querySelectorAll('.sw').forEach((el) => el.classList.toggle('active', el.dataset.theme === id));
      return;
    }
    orig(id);
  };
  function root_set(k, v) { document.body.style.setProperty(k, v); }
})();

function refreshThemeUI() {
  buildSwatches();
  if (window.fillSettingsSelects) fillSettingsSelects();
}

/* ═══ SHORTCUTS LIST (Settings) ═══ */
window.renderKeysList = function renderKeysList() {
  const el = $('keysList'); if (!el) return;
  const rows = [
    ['Ctrl + 1…7', S.lang === 'ar' ? 'التنقل بين الصفحات' : 'Navigate pages'],
    ['Space', S.lang === 'ar' ? 'عدّ الذكر (في صفحة الذكر)' : 'Count dhikr (Dhikr page)'],
    ['Ctrl + Shift + P', S.lang === 'ar' ? 'إظهار/إخفاء الأداة' : 'Toggle mini widget'],
    ['Ctrl + Shift + M', S.lang === 'ar' ? 'الوضع المصغر' : 'Toggle mini mode'],
  ];
  el.innerHTML = rows.map(([k, d]) => `<div style="display:flex;justify-content:space-between;gap:10px">
    <b style="font-family:monospace;font-size:11.5px">${k}</b><span class="muted" style="text-align:end">${d}</span></div>`).join('');
};

/* ═══ INIT (called at the end of pages3.js — DOM is ready) ═══ */
window.initPhase3 = function initPhase3() {
  renderHistory(); renderDhikrLibrary(); renderLocations(); renderDailyCard(); renderRamadan();
  $('histPrev').onclick = () => histShift(-1);
  $('histNext').onclick = () => histShift(1);
  $('histTodayBtn').onclick = histToday;
  $('histDate').onchange = (e) => { if (e.target.value) { histDate = e.target.value; renderHistory(); } };
  $('btnAddLoc').onclick = window.addCurrentLocation;
  $('btnExport').onclick = window.exportBackup;
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => { if (e.target.files[0]) window.handleImportFile(e.target.files[0]); e.target.value = ''; };
  renderThemeBuilder();
  renderKeysList();
  // About line: version from the platform (desktop main process / mobile label)
  const about = $('aboutLine');
  if (about) {
    const fallback = 'Prayer Times';
    if (window.Plat) {
      window.Plat.getVersion().then((v) => { about.textContent = v ? `Prayer Times v${v} · data stored locally` : fallback; }).catch(() => { about.textContent = fallback; });
    } else about.textContent = fallback;
  }
};

// Scripts load synchronously at the end of <body>, so the DOM and app.js state
// are ready here — app.js's own init() has already run by this point.
if (document.readyState !== 'loading') initPhase3();
else document.addEventListener('DOMContentLoaded', initPhase3);
