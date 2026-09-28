'use strict';

/* ════════════════════════════════════════════════════════════
   reader — Quran Mushaf Reading Mode.
   Data: bundled verified data/quran.json (Tanzil texts; never modified).
   Renders ONLY the selected surah into the DOM, as a mushaf page:
   continuous justified Arabic flow, ornamental ayah medallions,
   bismillah line, ornate surah header. Search is offline.
   Depends on: $, S, t(), DB3, save3, escHtml (pages3), showToast,
   SURAHS, RECITERS (data.js), qrLoadAndPlay (pages.js).
   ════════════════════════════════════════════════════════════ */

let rdSurah = 1;

function rdPrefs() {
  const p = DB3.prefs;
  return {
    font: p.readerFont || 26,
    line: p.readerLine || 2.05,
    dark: p.readerDark === true,
    tr: p.readerTr !== false, // default on
  };
}

window.renderReaderState = function renderReaderState() {
  // Called when dataset finishes loading; restore last position.
  const p = DB3.prefs;
  if (p.lastSurah) rdSurah = p.lastSurah;
};

/* Arabic-Indic digits for the medallions */
function arNum(n) {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
}

/* ═══ POPOVER (per-verse actions: bookmark / note / copy) ═══ */
let vpopEl = null;
function closeVpop() {
  if (vpopEl) { vpopEl.remove(); vpopEl = null; }
}
document.addEventListener('click', (e) => {
  if (vpopEl && !vpopEl.contains(e.target)) closeVpop();
});
function openVpop(surahN, ayahN, x, y) {
  closeVpop();
  const marked = DB3.bookmarks.some((b) => b.surah === surahN && b.ayah === ayahN);
  vpopEl = document.createElement('div');
  vpopEl.className = 'vpop';
  const L = S.lang === 'ar';
  vpopEl.innerHTML = `
    <button data-act="bm">${marked ? '🔖' : '📑'} ${marked ? (L ? 'محفوظة — إزالة' : 'Marked — remove') : (L ? 'حفظ' : 'Bookmark')}</button>
    <button data-act="note">✎ ${L ? 'ملاحظة' : 'Note'}</button>
    <button data-act="copy">⧉ ${L ? 'نسخ' : 'Copy'}</button>`;
  document.body.appendChild(vpopEl);
  const r = vpopEl.getBoundingClientRect();
  vpopEl.style.left = Math.min(Math.max(8, x - r.width / 2), window.innerWidth - r.width - 8) + 'px';
  vpopEl.style.top = Math.min(Math.max(8, y - r.height - 12), window.innerHeight - r.height - 8) + 'px';

  vpopEl.querySelectorAll('button').forEach((b) => {
    b.onclick = (ev) => {
      ev.stopPropagation();
      const act = b.dataset.act;
      if (act === 'bm') {
        const i = DB3.bookmarks.findIndex((x2) => x2.surah === surahN && x2.ayah === ayahN);
        if (i >= 0) DB3.bookmarks.splice(i, 1); else DB3.bookmarks.push({ surah: surahN, ayah: ayahN, ts: Date.now(), note: '' });
        save3();
        const el = document.getElementById(`ayah-${surahN}-${ayahN}`);
        if (el) el.classList.toggle('marked', i < 0);
        if (window.renderBookmarks) renderBookmarks();
        closeVpop();
      } else if (act === 'note') {
        const ex = DB3.bookmarks.find((x2) => x2.surah === surahN && x2.ayah === ayahN);
        const note = prompt((S.lang === 'ar' ? 'ملاحظة:' : 'Note:'), ex ? ex.note : '');
        if (note === null) { closeVpop(); return; }
        if (ex) ex.note = note.slice(0, 300);
        else DB3.bookmarks.push({ surah: surahN, ayah: ayahN, ts: Date.now(), note: note.slice(0, 300) });
        save3(); closeVpop();
        showToast('📝 ' + (S.lang === 'ar' ? 'تم حفظ الملاحظة' : 'Note saved'));
      } else if (act === 'copy') {
        const sur = QURAN_DATA && QURAN_DATA.surahs[surahN - 1];
        const ay = sur && sur.ayahs[ayahN - 1];
        if (ay) {
          navigator.clipboard.writeText(`${ay.ar}\n${ay.en}\n— ${sur.en} ${surahN}:${ay.n}`).then(() => showToast('⧉ ' + (S.lang === 'ar' ? 'تم النسخ' : 'Copied')));
        }
        closeVpop();
      }
    };
  });
}

/* ═══ RENDER: whole mushaf page for one surah ═══ */
window.quranOpenReader = function quranOpenReader(surahN, ayahN) {
  if (!QURAN_DATA) { showToast('⚠️ ' + (S.lang === 'ar' ? 'جاري تحميل نص القرآن…' : 'Quran text still loading…')); return; }
  const sur = QURAN_DATA.surahs[surahN - 1];
  if (!sur) return;
  rdSurah = surahN;
  DB3.prefs.lastSurah = surahN;
  if (ayahN) DB3.prefs.lastAyah = ayahN;
  save3();

  const rd = $('reader');
  const prefs = rdPrefs();
  const bookmarks = new Set(DB3.bookmarks.filter((b) => b.surah === surahN).map((b) => b.ayah));
  const L = S.lang === 'ar';

  $('rdTitle').textContent = L ? `${sur.n}. ${sur.ar}` : `${sur.n}. ${sur.en}`;
  $('rdMeta').textContent = `${sur.tr} · ${sur.ayahs.length} ${t('quran.verses')} · ${L ? 'مكية/مدنية' : (SURAHS[surahN - 1].t === 'M' ? 'Meccan' : 'Medinan')}`;

  // Mushaf page container + night mode + font vars
  const mushaf = rd.closest('.mushaf') || rd.parentElement;
  if (mushaf) mushaf.classList.toggle('mnight', prefs.dark);
  rd.className = 'mushaf-page-inner';
  rd.style.setProperty('--rd-font', prefs.font + 'px');
  rd.style.setProperty('--rd-line', String(prefs.line));

  let html = `
    <div class="mushaf-surah-hdr">
      <div class="msh-ar" dir="rtl">${sur.ar}</div>
      <div class="msh-sub">
        <span>${sur.en} · ${sur.tr}</span>
        <span>${sur.ayahs.length} ${t('quran.verses')}</span>
        <button class="msh-play" id="mshPlay">▶ ${L ? 'استماع' : 'Listen'}</button>
      </div>
    </div>`;

  // Bismillah before every surah except Al-Fatiha (1) and At-Tawbah (9)
  if (surahN !== 1 && surahN !== 9) {
    html += `<div class="mushaf-bismillah" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>`;
  }

  // Continuous flow: inline ayahs, each ending in a medallion
  html += `<div class="mushaf-flow" dir="rtl">`;
  html += sur.ayahs.map((ay) => `
    <span class="ayah-inline${bookmarks.has(ay.n) ? ' marked' : ''}" id="ayah-${sur.n}-${ay.n}" data-s="${sur.n}" data-a="${ay.n}">${ay.ar}<span class="ayah-medal" aria-label="${ay.n}">${arNum(ay.n)}</span></span>${prefs.tr ? '' : ' '}`).join('');
  html += `</div>`;

  // Translation blocks (optional, inserted after the flow)
  if (prefs.tr) {
    html += `<div class="mushaf-trs">` + sur.ayahs.map((ay) => `
      <div class="mushaf-tr"><span class="mtr-n">${sur.n}:${ay.n}</span> ${escHtml(ay.en)}</div>`).join('') + `</div>`;
  }

  rd.innerHTML = html;

  // Listen button → existing per-surah player
  const play = $('mshPlay');
  if (play) play.onclick = () => { if (window.qrLoadAndPlay) qrLoadAndPlay(surahN - 1); };

  // Tap any verse → popover with actions
  rd.querySelectorAll('.ayah-inline').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openVpop(+el.dataset.s, +el.dataset.a, e.clientX, e.clientY);
    });
  });

  // Reflect translation toggle state on the pill
  const trBtn = $('rdTr');
  if (trBtn) trBtn.classList.toggle('active', prefs.tr);

  // Switch to the Read tab only after the reader has content, so the tab's
  // "auto-open if empty" logic can't recurse back into this function.
  switchQTab('read');

  // scroll to target ayah or last position
  const target = ayahN ? rd.querySelector(`#ayah-${surahN}-${ayahN}`) : null;
  if (target) setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
};

window.renderBookmarks = function renderBookmarks() {
  const el = $('bmList'); if (!el) return;
  const q = ($('qsInput') && $('qsInput').value || '').toLowerCase().trim();
  let marks = [...DB3.bookmarks].sort((a, b) => b.ts - a.ts);
  if (q) {
    marks = marks.filter((m) => {
      const sur = QURAN_DATA && QURAN_DATA.surahs[m.surah - 1];
      const ay = sur && sur.ayahs[m.ayah - 1];
      return (sur && (sur.en.toLowerCase().includes(q) || sur.ar.includes(q))) || (ay && (ay.ar.includes(q) || ay.en.toLowerCase().includes(q))) || (m.note && m.note.toLowerCase().includes(q));
    });
  }
  el.innerHTML = marks.length ? marks.map((m) => {
    const sur = QURAN_DATA ? QURAN_DATA.surahs[m.surah - 1] : SURAHS[m.surah - 1];
    const ay = QURAN_DATA && sur.ayahs ? sur.ayahs[m.ayah - 1] : null;
    return `<div class="bm-item">
      <div class="bmm" data-open="${m.surah}:${m.ayah}">
        <div class="bm-meta">${S.lang === 'ar' ? sur.ar : sur.en} · ${m.surah}:${m.ayah} ${m.note ? '📝' : ''}</div>
        ${ay ? `<div class="bm-txt">${ay.ar.slice(0, 90)}…</div>` : ''}
        ${m.note ? `<div class="bm-note">${escHtml(m.note)}</div>` : ''}
      </div>
      <button class="icon-btn" data-bmdel="${m.surah}:${m.ayah}" style="width:30px;height:30px;font-size:13px" title="Remove">🗑️</button>
    </div>`;
  }).join('') : `<div class="muted" style="padding:16px;text-align:center">${S.lang === 'ar' ? 'لا علامات مرجعية بعد — افتح وضع القراءة واحفظ آية.' : 'No bookmarks yet — open Read mode and bookmark an ayah.'}</div>`;

  el.querySelectorAll('[data-open]').forEach((n) => (n.onclick = () => {
    const [s, a] = n.dataset.open.split(':').map(Number);
    window.quranOpenReader(s, a);
  }));
  el.querySelectorAll('[data-bmdel]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const [s, a] = b.dataset.bmdel.split(':').map(Number);
    DB3.bookmarks = DB3.bookmarks.filter((x) => !(x.surah === s && x.ayah === a));
    save3(); renderBookmarks();
  }));
};

/* ═══ OFFLINE SEARCH over the bundled dataset ═══ */
let qsTimer = null;
window.wireQuranTabs = function wireQuranTabs() {
  document.querySelectorAll('.qtab').forEach((b) => (b.onclick = () => switchQTab(b.dataset.qtab)));
  $('rdBack').onclick = () => switchQTab('list');
  $('rdPrev').onclick = () => { if (rdSurah > 1) window.quranOpenReader(rdSurah - 1); };
  $('rdNext').onclick = () => { if (rdSurah < 114) window.quranOpenReader(rdSurah + 1); };
  $('rdFontPlus').onclick = () => { DB3.prefs.readerFont = Math.min(48, rdPrefs().font + 2); save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('rdFontMinus').onclick = () => { DB3.prefs.readerFont = Math.max(16, rdPrefs().font - 2); save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('rdLine').onclick = () => { const cur = rdPrefs().line; DB3.prefs.readerLine = cur >= 2.4 ? 1.4 : Math.round((cur + 0.2) * 10) / 10; save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('rdDark').onclick = () => { DB3.prefs.readerDark = !rdPrefs().dark; save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  const trBtn = $('rdTr');
  if (trBtn) trBtn.onclick = () => { DB3.prefs.readerTr = !rdPrefs().tr; save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('qsInput').oninput = () => {
    clearTimeout(qsTimer);
    qsTimer = setTimeout(quranSearch, 250);
  };
};

function switchQTab(name) {
  document.querySelectorAll('.qtab').forEach((b) => b.classList.toggle('active', b.dataset.qtab === name));
  ['list', 'read', 'search', 'marks'].forEach((x) => { const el = $('qtab-' + x); if (el) el.style.display = x === name ? 'block' : 'none'; });
  if (name === 'marks') window.renderBookmarks();
  if (name === 'read' && !$('reader').innerHTML) window.quranOpenReader(rdSurah);
}
window.switchQTab = switchQTab;

function quranSearch() {
  const q = $('qsInput').value.trim();
  const el = $('qsResults');
  if (q.length < 2 || !QURAN_DATA) { el.innerHTML = ''; return; }
  const ql = q.toLowerCase();
  const hits = [];
  for (const sur of QURAN_DATA.surahs) {
    for (const ay of sur.ayahs) {
      if (ay.ar.includes(q) || ay.en.toLowerCase().includes(ql)) {
        hits.push({ sur, ay });
        if (hits.length >= 60) break;
      }
    }
    if (hits.length >= 60) break;
  }
  el.innerHTML = hits.length
    ? `<div class="muted" style="font-size:11.5px;margin-bottom:8px">${hits.length} ${S.lang === 'ar' ? 'نتيجة (أول 60)' : 'results (first 60 shown)'}</div>` + hits.map((h) => `
      <div class="qs-hit" data-open="${h.sur.n}:${h.ay.n}">
        <div class="qsh-meta">${S.lang === 'ar' ? h.sur.ar : h.sur.en} · ${h.sur.n}:${h.ay.n}</div>
        <div class="qsh-ar" dir="rtl">${h.ay.ar}</div>
        <div class="qsh-en">${escHtml(h.ay.en)}</div>
      </div>`).join('')
    : `<div class="muted" style="padding:14px;text-align:center">${S.lang === 'ar' ? 'لا نتائج' : 'No results'}</div>`;
  el.querySelectorAll('[data-open]').forEach((n) => (n.onclick = () => {
    const [s, a] = n.dataset.open.split(':').map(Number);
    window.quranOpenReader(s, a);
  }));
}
