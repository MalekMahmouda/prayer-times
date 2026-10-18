'use strict';

/**
 * extras.js — the two surfaces that are not prayer calculation:
 *   1. Quran Radio      — two live stations on the Quran page
 *   2. Get Prayer Times — download / source / releases cards in Settings
 *
 * Everything here is null-guarded, so the file is inert on the pages that do
 * not contain these blocks (adhan.html, widget.html, overlay).
 */

/* ── The release the download cards point at ──────────────────────────────
   Verified against the public releases API on 2026-10-18:
     tag v1.5.0 · APK 51,986,418 bytes (49.6 MB) · minSdk 24 = Android 7.0
   WHEN SHIPPING A RELEASE bump version + apk + mb here — the version text, the
   "Latest:" chip and the APK href all read from this object, so nothing else
   needs editing and no card can drift onto a file that does not exist. */
const PT_RELEASE = {
  version: '1.5.0',
  apk: 'Prayer-Times-1.5.0-android.apk',
  mb: '49.6',
};
const PT_REPO = 'https://github.com/Malekmahmouda/prayer-times';

/* ── Stations ─────────────────────────────────────────────────────────────
   Both endpoints were chosen for one hard constraint: the site is served over
   HTTPS, so a stream that 302s to a plain-http edge node is dead on arrival
   (the browser blocks it as mixed content before the audio element ever sees
   it). The famous Radiojar entry points for these two stations — the ones
   mp3quran and the Cairo listings publish — fail exactly that way, which is
   why they are not used here.

   Every URL below was checked on 2026-10-18: HTTP 200, audio/mpeg|mp3, no
   redirect, no expiring token, and an icy-name where the host sends one. */
const PT_RADIO_STATIONS = [
  // إذاعة القرآن الكريم (مكة المكرمة) — the Makkah Quran Radio rebroadcast.
  { id: 'saudi', nameKey: 'radio.saudiName', subKey: 'radio.saudiSub', url: 'https://edge.mixlr.com/channel/rwumx' },
  // إذاعة القرآن الكريم (القاهرة) — the host identifies itself as
  // "Holy Quran Radio Cairo" in its ICY headers.
  { id: 'egypt', nameKey: 'radio.egyptName', subKey: 'radio.egyptSub', url: 'https://radio.xecod.com/station/quran-cairo' },
];

const ptEl = (id) => document.getElementById(id);
const ptBtnId = (st) => 'radio' + st.id.charAt(0).toUpperCase() + st.id.slice(1);

let ptRadioAudio = null;
let ptRadioStation = null;   // station currently loaded into the audio element
let ptRadioError = false;    // last play attempt failed (network / blocked / 4xx)

/* ═══ RADIO: state → DOM ═══ */
function ptRadioSync() {
  const a = ptRadioAudio;
  const playing = !!(a && ptRadioStation && !a.paused && !ptRadioError);
  for (const st of PT_RADIO_STATIONS) {
    const btn = ptEl(ptBtnId(st));
    if (!btn) continue;
    const on = playing && ptRadioStation.id === st.id;
    btn.classList.toggle('playing', on);
    btn.classList.toggle('failed', on === false && ptRadioError && ptRadioStation.id === st.id);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  const row = ptEl('radioVolRow');
  if (row) row.hidden = !playing;
}

function ptRadioStatus() {
  const el = ptEl('radioStatus');
  if (!el) return;
  el.classList.toggle('err', ptRadioError);
  if (ptRadioError) { el.textContent = t('radio.error'); return; }
  const playing = ptRadioAudio && ptRadioStation && !ptRadioAudio.paused;
  el.textContent = playing ? t('radio.playingPrefix') + t(ptRadioStation.nameKey) : '';
}

function ptRadioPaintMediaSession() {
  if (!('mediaSession' in navigator) || !window.MediaMetadata || !ptRadioStation) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t(ptRadioStation.nameKey),
      artist: t('radio.title'),
      album: 'Prayer Times',
    });
  } catch (e) { /* older WebView */ }
}

function ptRadioStop() {
  const a = ptRadioAudio;
  if (!a) return;
  a.pause();
  ptRadioError = false;
  ptRadioStation = null;
  ptRadioStatus();
  ptRadioSync();
  if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {} }
}

function ptRadioToggle(st) {
  const a = ptRadioAudio;
  if (!a) return;
  // Same station already sounding → the button is a stop button.
  if (ptRadioStation && ptRadioStation.id === st.id && !a.paused && !ptRadioError) { ptRadioStop(); return; }

  ptRadioStation = st;
  ptRadioError = false;
  a.src = st.url;   // fresh entry point every time: live edge, fresh token
  a.load();
  ptRadioStatus();
  ptRadioSync();
  ptRadioPaintMediaSession();

  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch(() => {
      if (!ptRadioStation || ptRadioStation.id !== st.id) return;  // superseded
      ptRadioError = true;
      ptRadioStatus();
      ptRadioSync();
    });
  }
}

function ptRadioInit() {
  const a = ptEl('radioAudio');
  if (!a || !ptEl('radioBar')) return;
  ptRadioAudio = a;

  const vol = ptEl('radioVol');
  const saved = parseFloat(localStorage.getItem('ptrv'));
  a.volume = isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 1;
  if (vol) {
    vol.value = String(a.volume);
    vol.addEventListener('input', () => {
      const v = Math.min(1, Math.max(0, parseFloat(vol.value) || 0));
      a.volume = v;
      try { localStorage.setItem('ptrv', String(v)); } catch (e) { /* private mode */ }
    });
  }

  for (const st of PT_RADIO_STATIONS) {
    const btn = ptEl(ptBtnId(st));
    if (btn) btn.addEventListener('click', () => ptRadioToggle(st));
  }

  a.addEventListener('playing', () => {
    ptRadioError = false;
    ptRadioStatus(); ptRadioSync(); ptRadioPaintMediaSession();
    if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {} }
  });
  a.addEventListener('pause', () => { ptRadioStatus(); ptRadioSync(); });
  a.addEventListener('error', () => {
    if (!ptRadioStation) return;
    ptRadioError = true;
    ptRadioStatus(); ptRadioSync();
  });

  /* Never talk over another audio source: the adhan, the pre-prayer beep or a
     surah. `play` does not bubble, but a capture listener on document still
     sees it, which covers the Quran player that this file cannot reach. */
  document.addEventListener('play', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'AUDIO' || el === a) return;
    if (!a.paused) ptRadioStop();
  }, true);

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => { if (ptRadioStation) ptRadioToggle(ptRadioStation); });
      navigator.mediaSession.setActionHandler('pause', () => ptRadioStop());
      navigator.mediaSession.setActionHandler('stop', () => ptRadioStop());
    } catch (e) { /* unsupported action names */ }
  }
}

/* ═══ DOWNLOADS: verified release → cards ═══ */
function ptApplyRelease() {
  const elVer = ptEl('dlAndroidVer');
  if (elVer) elVer.textContent = t('dl.verPrefix') + PT_RELEASE.version;
  const elSize = ptEl('dlAndroidSize');
  if (elSize) elSize.textContent = PT_RELEASE.mb + ' ' + t('dl.unitMB') + ' · ' + t('dl.androidReq');
  const elBtn = ptEl('dlAndroidBtn');
  if (elBtn) elBtn.href = PT_REPO + '/releases/download/v' + PT_RELEASE.version + '/' + PT_RELEASE.apk;
  const elTag = ptEl('dlRelTag');
  if (elTag) elTag.textContent = t('dl.latestPrefix') + 'v' + PT_RELEASE.version;
}

/* ═══ i18n — called from applyLang() on every language switch ═══ */
function applyExtrasLang() {
  const set = (id, key) => { const el = ptEl(id); if (el) el.textContent = t(key); };

  set('dlTitle', 'dl.title');
  set('dlLead', 'dl.lead');
  set('dlAndroidT', 'dl.androidT');
  set('dlAndroidS', 'dl.androidS');
  set('dlAndroidBtnT', 'dl.androidBtn');
  set('dlAndroidNote', 'dl.androidNote');
  set('dlCodeT', 'dl.codeT');
  set('dlCodeS', 'dl.codeS');
  set('dlCodeBtnT', 'dl.codeBtn');
  set('dlCodeNote', 'dl.codeNote');
  set('dlRelT', 'dl.relT');
  set('dlRelS', 'dl.relS');
  set('dlRelBtnT', 'dl.relBtn');
  set('dlRelNote', 'dl.relNote');
  set('dlFootT', 'dl.footT');
  ptApplyRelease();

  set('radioTitle', 'radio.title');
  for (const st of PT_RADIO_STATIONS) {
    set(ptBtnId(st) + 'Name', st.nameKey);
    set(ptBtnId(st) + 'Sub', st.subKey);
  }
  const vol = ptEl('radioVol');
  if (vol) vol.setAttribute('aria-label', t('radio.vol'));

  ptRadioStatus();
  ptRadioSync();
  ptRadioPaintMediaSession();
}

window.applyExtrasLang = applyExtrasLang;

/* ═══ #downloads — a real anchor ═══
   The downloads block lives on the Settings page, which the SPA reaches by
   switching pages rather than by navigating. Without this, a shared
   /#downloads link would land on the dashboard and do nothing. */
function ptOpenDownloads() {
  const el = ptEl('downloads');
  if (!el) return;
  if (typeof window.gotoPage === 'function') window.gotoPage('settings');
  const soft = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // One frame later: the page switch has painted, so the scroll targets the
  // visible layout instead of the page that was on screen.
  requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: soft ? 'smooth' : 'auto' }));
}

function ptCheckHash() { if (location.hash === '#downloads') ptOpenDownloads(); }

function ptExtrasInit() {
  ptRadioInit();
  applyExtrasLang();
  ptCheckHash();
  // Re-run on load: initMobileUI() (app.js, registered earlier on the same
  // event) re-enters on 'prayers' when it settles the viewport mode, which
  // would otherwise wipe the page this hash asked for.
  window.addEventListener('load', ptCheckHash);
  window.addEventListener('hashchange', ptCheckHash);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ptExtrasInit);
else ptExtrasInit();
