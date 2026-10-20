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
  version: '1.6.0',
  apk: 'Prayer-Times-1.6.0-android.apk',
  mb: '49.6',
};
const PT_REPO = 'https://github.com/Malekmahmouda/prayer-times';

/* ── Stations — where each one actually comes from ────────────────────────
   Both stations the user asked for are the same two feeds everybody publishes,
   and both upstreams sit behind one hard wall: this page is served over HTTPS,
   and Radiojar answers every request with `302 → http://nXX.radiojar.com/...`
   plus a 5-minute token. Chromium refuses the downgrade before the audio
   element ever sees it (measured on the live site: "Media load rejected by URL
   safety check"), and the https edge nodes just redirect to another http node,
   so there is no loop-hole to walk.

   Hence `urls`: an ordered ladder. The first entry is what plays on the web —
   an HTTPS relay carrying the same station — and the canonical Radiojar URL is
   kept second, because the desktop build loads from file:// where no
   mixed-content rule applies and the original feed is the better source.
   Verified 2026-10-19: HTTP 200, audio/mpeg, no redirect, no expiring token. */
const PT_RADIO_STATIONS = [
  /* إذاعة القرآن الكريم — TuneIn s37232 (“Saudi Quran Station”, 100.0 FM)
     resolves to stream.radiojar.com/0tpy1h0kxtzuv. The relay plays the same
     feed; the canonical stays behind it for file:// builds. */
  { id: 'saudi', nameKey: 'radio.saudiName', subKey: 'radio.saudiSub',
    urls: ['https://edge.mixlr.com/channel/rwumx', 'https://stream.radiojar.com/0tpy1h0kxtzuv'] },
  /* إذاعة القرآن الكريم من القاهرة — surahquran.com/Radio-Quran-Cairo.html
     embeds stream.radiojar.com/8s5u5tpdtwzuv; the relay used first identifies
     itself as "Holy Quran Radio Cairo" in its ICY headers, i.e. the same
     station. */
  { id: 'egypt', nameKey: 'radio.egyptName', subKey: 'radio.egyptSub',
    urls: ['https://radio.xecod.com/station/quran-cairo', 'https://stream.radiojar.com/8s5u5tpdtwzuv'] },
];

const ptEl = (id) => document.getElementById(id);
const ptBtnId = (st) => 'radio' + st.id.charAt(0).toUpperCase() + st.id.slice(1);

let ptRadioAudio = null;
let ptRadioStation = null;   // station currently loaded into the audio element
let ptRadioError = false;    // last play attempt failed (network / blocked / 4xx)
let ptRadioTry = 0;          // index into the station's `urls` ladder
let ptRadioAttempt = 0;      // bumped on every src change; stale callbacks compare
let ptRadioBlocked = false;  // the browser refused autoplay — not a dead stream

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
  if (!ptRadioAudio || !ptRadioStation) { el.textContent = ''; return; }
  if (!ptRadioAudio.paused) { el.textContent = t('radio.playingPrefix') + t(ptRadioStation.nameKey); return; }
  if (ptRadioBlocked) { el.textContent = t('radio.tapToPlay'); return; }
  /* Nothing is audible yet but we have not given up: the element is still
     fetching. Saying so is what separates a slow stream from a dead one —
     without it the bar looks like it ignored the tap. */
  el.textContent = ptRadioAudio.readyState < 3 ? t('radio.connecting') : '';
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
  ptRadioAttempt += 1;   // invalidate any in-flight play() / error callback
  a.pause();
  ptRadioError = false;
  ptRadioBlocked = false;
  ptRadioStation = null;
  ptRadioStatus();
  ptRadioSync();
  if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {} }
}

/* Load one rung of the ladder. Everything async carries `attempt`, so a slow
   rejection from a source we have already moved past cannot mark the station
   failed or knock it back a rung. */
function ptRadioPlay(st) {
  const a = ptRadioAudio;
  if (!a) return;
  const attempt = ++ptRadioAttempt;
  ptRadioBlocked = false;
  a.src = st.urls[ptRadioTry];
  a.load();
  ptRadioStatus();
  ptRadioSync();
  ptRadioPaintMediaSession();
  const p = a.play();
  if (p && typeof p.catch === 'function') {
    p.catch((err) => {
      if (attempt !== ptRadioAttempt) return;   // superseded by a newer attempt
      /* Autoplay policy, not the network. Stepping down the ladder here was a
         real bug: the block has nothing to do with the source, so the bar would
         end on the always-blocked Radiojar feed and report a dead stream for a
         station that was never asked properly. Say what happened instead — one
         more tap is a gesture, and the same source then plays. */
      if (err && err.name === 'NotAllowedError') {
        ptRadioBlocked = true;
        ptRadioStatus();
        ptRadioSync();
        return;
      }
      ptRadioFail(st);
    });
  }
}

/* One failure handler for both failure paths (play() rejecting and the element
   firing `error`): step down the ladder, and only surface an error once the
   last rung is spent. */
function ptRadioFail(st) {
  if (!ptRadioStation || ptRadioStation.id !== st.id) return;   // superseded
  if (ptRadioTry + 1 < st.urls.length) { ptRadioTry += 1; ptRadioPlay(st); return; }
  ptRadioError = true;
  ptRadioStatus();
  ptRadioSync();
}

function ptRadioToggle(st) {
  const a = ptRadioAudio;
  if (!a) return;
  // Same station already sounding → the button is a stop button.
  if (ptRadioStation && ptRadioStation.id === st.id && !a.paused && !ptRadioError) { ptRadioStop(); return; }

  ptRadioStation = st;
  ptRadioError = false;
  ptRadioTry = 0;
  ptRadioPlay(st);
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
    ptRadioBlocked = false;
    ptRadioStatus(); ptRadioSync(); ptRadioPaintMediaSession();
    if ('mediaSession' in navigator) { try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {} }
  });
  a.addEventListener('pause', () => { ptRadioStatus(); ptRadioSync(); });
  a.addEventListener('error', () => { if (ptRadioStation) ptRadioFail(ptRadioStation); });

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

/* ═══ DOWNLOADS: verified release → bar ═══ */
function ptApplyRelease() {
  const elMeta = ptEl('dlAndroidMeta');
  if (elMeta) {
    elMeta.textContent = t('dl.verPrefix') + PT_RELEASE.version + ' · ' +
      PT_RELEASE.mb + ' ' + t('dl.unitMB') + ' · ' + t('dl.androidReq');
  }
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
  set('dlAndroidBtnT', 'dl.androidBtn');
  set('dlCodeT', 'dl.codeT');
  set('dlCodeBtnT', 'dl.codeBtn');
  set('dlRelT', 'dl.relT');
  set('dlRelBtnT', 'dl.relBtn');
  set('dlFootT', 'dl.footT');
  set('dlNote', 'dl.note');
  set('dlAndT', 'dl.andT');
  set('dlAnd1', 'dl.and1');
  set('dlAnd2', 'dl.and2');
  set('dlAnd3', 'dl.and3');
  set('dlWebT', 'dl.webT');
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

/* ═══ Hash routes ═══
   This app is a single page: "navigation" is a class swap, so a shared link
   like .../prayer-times/#/quran used to mean nothing. The router keeps the hash
   in sync with whichever page is open (replaceState — no extra history entry,
   no reload) and re-opens it on load and on hashchange.

   `#downloads` (the old anchor, with or without the slash) is still honoured
   and resolves to the Download page, so links already shared keep working. */
const PT_ROUTE_PAGES = ['prayers', 'calendar', 'qibla', 'quran', 'names', 'dhikr', 'stats', 'downloads', 'settings', 'mhome'];
let ptRouterInstalled = false;
let ptRouterOn = false;      // hash writes stay off until the app has booted
let ptRouterQuiet = false;   // a navigation we started ourselves from the hash
let ptPendingRoute = null;   // the route the URL asked for, before boot clobbers it
let ptBootHold = 0;          // ms timestamp: boot navigations must not rewrite the hash

function ptRouteFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '').trim();
  if (!raw) return null;
  const page = raw.split('?')[0];
  if (page === 'downloads') return 'downloads';
  return PT_ROUTE_PAGES.indexOf(page) === -1 ? null : page;
}

function ptGoSilently(name) {
  ptRouterQuiet = true;
  try { window.gotoPage(name); } finally { ptRouterQuiet = false; }
}

function ptRestoreHash(route) {
  const want = '#/' + route;
  if (location.hash === want) return;
  ptRouterQuiet = true;
  try { history.replaceState(null, '', want); } catch (e) { /* file:// or older engine */ }
  ptRouterQuiet = false;
}

/* ═══ Download page ═══
   No scrolling needed any more — the downloads live on their own page — but the
   link still has to land somewhere sensible: focus goes to the list so keyboard
   and screen-reader users arrive where the link promised, instead of being left
   on <body> with no idea the view changed. preventScroll keeps focus from
   nudging the page. */
function ptOpenDownloads() {
  if (typeof window.gotoPage !== 'function') return;
  ptGoSilently('downloads');
  /* Focus the heading, not the panel: it is what a screen reader should read
     first, and a focus ring drawn around a 960px panel reads as a broken double
     border. */
  const el = ptEl('dlTitle');
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
}

function ptApplyRoute() {
  const target = ptRouteFromHash();
  if (!target) return;
  if (target === 'downloads') { ptOpenDownloads(); return; }
  if (typeof window.gotoPage !== 'function') return;
  ptGoSilently(target);
}

function ptSyncHash(name) {
  if (!ptRouterOn || ptRouterQuiet) return;
  /* Boot is not navigation. app.js settles the viewport mode on load by calling
     gotoPage('prayers'), and that call used to overwrite a #/downloads link the
     visitor had just opened — the page was right for one frame, then the URL
     said prayers and the next reload obeyed the URL. The hold expires on its own
     and is cut short by the visitor's first click, so a real navigation is never
     swallowed. */
  if (Date.now() < ptBootHold) return;
  const want = '#/' + (name === 'mhome' ? 'prayers' : name);
  if (location.hash === want) return;
  ptRouterQuiet = true;
  /* finally, not a trailing line: this flag gates EVERY later hash write, so
     letting an exception (or an early return added later) skip the reset would
     freeze the URL on the previous page for the rest of the session. */
  try { history.replaceState(null, '', want); } catch (e) { /* file:// */ }
  finally { ptRouterQuiet = false; }
}

function ptInstallRouter() {
  if (ptRouterInstalled || typeof window.gotoPage !== 'function') return;
  ptRouterInstalled = true;
  const orig = window.gotoPage;
  window.gotoPage = function (name) {
    const r = orig.call(this, name);
    try { ptSyncHash(name); } catch (e) { /* never break navigation over a hash */ }
    return r;
  };
}

function ptExtrasInit() {
  ptRadioInit();
  applyExtrasLang();
  ptInstallRouter();

  /* Remember the route the URL asked for, then open it. Remembering matters:
     the app boots into 'prayers' once the viewport mode settles, which would
     otherwise wipe a #/quran deep link before it could be honoured. */
  const wanted = ptRouteFromHash();
  if (wanted) { ptPendingRoute = wanted; ptApplyRoute(); }

  window.addEventListener('load', () => {
    ptRouterOn = true;
    if (!ptPendingRoute) return;
    const route = ptPendingRoute;
    ptBootHold = Date.now() + 900;
    const settle = () => { if (ptPendingRoute === route) { ptApplyRoute(); ptRestoreHash(route); } };
    settle();
    setTimeout(settle, 140);     // after the resize / mobile-mode debounce
    setTimeout(() => { ptBootHold = 0; }, 900);
  });

  /* The hold above exists for one reason; a click is the visitor disagreeing
     with it, so it ends there. */
  document.addEventListener('pointerdown', () => { ptBootHold = 0; }, { capture: true, passive: true });

  window.addEventListener('hashchange', () => {
    const r = ptRouteFromHash();
    ptPendingRoute = r;
    if (r) ptApplyRoute();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ptExtrasInit);
else ptExtrasInit();
