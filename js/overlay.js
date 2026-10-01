'use strict';

/**
 * Overlay — adhan playback page (desktop).
 * Presentation only: the main process resolved the audio source (bundled local
 * file first) and the configured volume. This page renders the payload, plays
 * the audio, and closes itself — it never decides WHEN the adhan happens.
 */

const AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

const audio = document.getElementById('adhanAudio');
const playPauseBtn = document.getElementById('playPause');
const volSlider = document.getElementById('vol');
const errLine = document.getElementById('errLine');
let playing = false;
let closeTimer = null;

// Safety: even if 'ended' never fires (truncated file, hung stream), the
// overlay must not stay up forever. Prayer notifications already went out.
const MAX_DURATION_MS = 6 * 60 * 1000;

/* Diagnostics → main process → %APPDATA%\Prayer Times\azan-debug.log.
   Records the full audio lifecycle: src assignment, load() result, play()
   resolution/rejection (with the real DOMException), and error events —
   so the exact failure reason is on disk instead of guessed. */
const dbg = (msg, data) => { try { if (window.ptOverlay) window.ptOverlay.debug(msg, data); } catch (e) { /* never break playback */ } };
function describeMediaError(err) {
  if (!err) return 'unknown';
  if (err instanceof DOMException || (err && err.name)) {
    const codeMap = { 1: 'MEDIA_ERR_ABORTED', 2: 'MEDIA_ERR_NETWORK', 3: 'MEDIA_ERR_DECODE', 4: 'MEDIA_ERR_SRC_NOT_SUPPORTED' };
    const code = (typeof err.code === 'number' && codeMap[err.code]) || (typeof MediaError !== 'undefined' && err instanceof MediaError ? codeMap[err.code] : '');
    return `${err.name || 'Error'}${code ? ':' + code : ''}: ${err.message || ''}`;
  }
  return String(err.message || err);
}
audio.addEventListener('error', () => {
  if (!audio.src) return;
  const me = audio.error;
  dbg('audio error event', { src: audio.src, code: me && me.code, detail: describeMediaError(me) });
});

// Media boundaries (v1.3.2): each listener marks one link of the playback
// chain, so a silent failure points at the exact boundary that never logged.
audio.addEventListener('canplay', () => dbg('audio canplay (file decoded by the OS)', { duration: audio.duration }));
audio.addEventListener('playing', () => dbg('audio playing (output device active)', { currentTime: audio.currentTime }));
audio.addEventListener('ended', () => dbg('audio ended'));

function stopAndClose() {    try { audio.pause(); } catch (e) { /* already paused/unavailable — closing the overlay is the user-visible outcome */ }
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (window.ptOverlay) window.ptOverlay.dismiss();
}

function show(payload) {
  const p = payload || {};
  const ar = p.lang === 'ar';
  const prayer = p.prayer || 'Dhuhr';
  // Boundary: the overlay page actually RECEIVED the adhan payload from main.
  dbg('adhan:show received', { prayer: p.prayer, hasAudioSrc: !!p.audioSrc, hidden: !!p.hidden, volume: p.volume });

  document.getElementById('lbl').textContent = ar ? 'حان وقت الصلاة' : 'It is time for prayer';
  document.getElementById('lbl').dataset.ar = ar ? '1' : '0';
  document.getElementById('nameAr').textContent = p.nameAr || AR[prayer] || prayer;
  document.getElementById('nameEn').textContent = p.nameEn || prayer;
  document.getElementById('timeLine').textContent = p.time || '';
  document.getElementById('stopBtn').textContent = ar ? 'إيقاف الأذان' : 'Stop Adhan';
  document.getElementById('hintTxt').textContent = ar ? 'اضغط' : 'Press';
  document.getElementById('hintTxt2').textContent = ar ? 'للإغلاق' : 'to dismiss';
  errLine.textContent = '';

  // Volume: from the payload (Settings → config → main → event → here).
  // Never reset to 100% — initialize the slider with the configured value.
  const v = Math.min(1, Math.max(0, Number(p.volume)));
  audio.volume = Number.isFinite(v) ? v : 1;
  volSlider.value = String(audio.volume);

  // Source was resolved by the main process (bundled local file first).
  audio.src = p.audioSrc || '';
  dbg('audio.src set', { src: audio.src, volume: audio.volume, prayer });
  try { audio.load(); dbg('audio.load() issued'); } catch (e) { dbg('audio.load() threw', { detail: describeMediaError(e) }); }
  audio.currentTime = 0;
  playing = true;
  playPauseBtn.textContent = '⏸';
  audio.play().then(() => {
    dbg('audio.play() resolved — adhan audio is playing', { src: audio.src });
  }).catch((e) => {
    // Don't loop retries: notification already fired; user can Stop manually.
    dbg('audio.play() REJECTED', { src: audio.src, detail: describeMediaError(e) });
    errLine.textContent = ar ? 'تعذر تشغيل الصوت — يمكنك الإيقاف' : 'Audio unavailable — you can dismiss';
  });

  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => { dbg('max duration reached — force closing'); stopAndClose(); }, MAX_DURATION_MS);
}

document.getElementById('stopBtn').addEventListener('click', stopAndClose);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopAndClose(); });

playPauseBtn.addEventListener('click', () => {
  if (playing) { audio.pause(); playing = false; playPauseBtn.textContent = '▶'; dbg('manual pause'); }
  else {
    audio.play().then(() => dbg('manual resume resolved')).catch((e) => dbg('manual resume REJECTED', { detail: describeMediaError(e) }));
    playing = true; playPauseBtn.textContent = '⏸';
  }
});

volSlider.addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v)) audio.volume = Math.min(1, Math.max(0, v));
});

audio.addEventListener('ended', stopAndClose);
audio.addEventListener('error', () => {
  if (!audio.src) return;
  errLine.textContent = (document.getElementById('lbl').dataset.ar === '1')
    ? 'تعذر تحميل ملف الصوت' : 'Could not load the audio file';
});

// Receive adhan events from the main process (registered once, at startup).
if (window.ptOverlay) window.ptOverlay.onShow(show);
