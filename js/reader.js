'use strict';

/* ════════════════════════════════════════════════════════════
   reader — Quran Reading Mode (Phase 3).
   Data: bundled verified data/quran.json (Tanzil texts; never modified).
   Renders ONLY the selected surah into the DOM. Search is offline.
   Depends on: $, S, t(), DB3, save3, escHtml (pages3), showToast.
   ════════════════════════════════════════════════════════════ */

let rdSurah = 1;

function rdPrefs() {
  const p = DB3.prefs;
  return {
    font: p.readerFont || 24,
    line: p.readerLine || 2,
    dark: p.readerDark === true,
    tr: p.readerTr !== false, // default on
  };
}

window.renderReaderState = function renderReaderState() {
  // Called when dataset finishes loading; restore last position.
  const p = DB3.prefs;
  if (p.lastSurah) rdSurah = p.lastSurah;
};

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

  $('rdTitle').textContent = S.lang === 'ar' ? `${sur.n}. ${sur.ar}` : `${sur.n}. ${sur.en}`;
  $('rdMeta').textContent = `${sur.tr} · ${sur.ayahs.length} ${t('quran.verses')} · ${S.lang === 'ar' ? 'مكية/مدنية' : (SURAHS[surahN - 1].t === 'M' ? 'Meccan' : 'Medinan')}`;

  // Header + only this surah's ayahs
  rd.className = 'card reader' + (prefs.dark ? ' reader-dark' : '');
  rd.style.setProperty('--rd-font', prefs.font + 'px');
  rd.style.setProperty('--rd-line', String(prefs.line));
  let html = `<div class="reader-surah-hdr">
    <div class="rsh-ar" dir="rtl">${sur.ar}</div>
    <div class="rsh-en">${sur.en} · ${sur.tr}</div>
  </div>`;
  html += sur.ayahs.map((ay) => `
    <div class="ayah${bookmarks.has(ay.n) ? ' marked' : ''}" id="ayah-${sur.n}-${ay.n}">
      <div class="anum">${ay.n}</div>
      <div class="abody">
        <div class="aar" dir="rtl">${ay.ar}</div>
        ${prefs.tr ? `<div class="aen">${escHtml(ay.en)}</div>` : ''}
        <div class="abtns">
          <button class="abtn" data-bm="${ay.n}">${bookmarks.has(ay.n) ? '🔖 ' + (S.lang === 'ar' ? 'محفوظة' : 'Marked') : '🔖 ' + (S.lang === 'ar' ? 'حفظ' : 'Bookmark')}</button>
          <button class="abtn" data-note="${ay.n}">✎ ${S.lang === 'ar' ? 'ملاحظة' : 'Note'}</button>
          <button class="abtn" data-copy="${ay.n}">⧉ ${S.lang === 'ar' ? 'نسخ' : 'Copy'}</button>
        </div>
      </div>
    </div>`).join('');
  rd.innerHTML = html;

  // wire ayah buttons
  rd.querySelectorAll('[data-bm]').forEach((b) => {
    b.onclick = () => {
      const n = +b.dataset.bm;
      const i = DB3.bookmarks.findIndex((x) => x.surah === surahN && x.ayah === n);
      if (i >= 0) DB3.bookmarks.splice(i, 1); else DB3.bookmarks.push({ surah: surahN, ayah: n, ts: Date.now(), note: '' });
      save3(); quranOpenReader(surahN, n);
    };
  });
  rd.querySelectorAll('[data-note]').forEach((b) => {
    b.onclick = () => {
      const n = +b.dataset.note;
      const ex = DB3.bookmarks.find((x) => x.surah === surahN && x.ayah === n);
      const note = prompt((S.lang === 'ar' ? 'ملاحظة:' : 'Note:'), ex ? ex.note : '');
      if (note === null) return;
      if (ex) ex.note = note.slice(0, 300);
      else DB3.bookmarks.push({ surah: surahN, ayah: n, ts: Date.now(), note: note.slice(0, 300) });
      save3(); quranOpenReader(surahN, n);
    };
  });
  rd.querySelectorAll('[data-copy]').forEach((b) => {
    b.onclick = () => {
      const ay = sur.ayahs.find((x) => x.n === +b.dataset.copy);
      navigator.clipboard.writeText(`${ay.ar}\n${ay.en}\n— ${sur.en} ${surahN}:${ay.n}`).then(() => showToast('⧉ ' + (S.lang === 'ar' ? 'تم النسخ' : 'Copied')));
    };
  });

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
  $('rdFontPlus').onclick = () => { DB3.prefs.readerFont = Math.min(48, rdPrefs().font + 2); save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('rdFontMinus').onclick = () => { DB3.prefs.readerFont = Math.max(16, rdPrefs().font - 2); save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('rdLine').onclick = () => { const cur = rdPrefs().line; DB3.prefs.readerLine = cur >= 2.4 ? 1.4 : Math.round((cur + 0.2) * 10) / 10; save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
  $('rdDark').onclick = () => { DB3.prefs.readerDark = !rdPrefs().dark; save3(); window.quranOpenReader(rdSurah, DB3.prefs.lastAyah); };
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
