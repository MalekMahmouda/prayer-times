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

function stopAndClose() {
  try { audio.pause(); } catch (e) {}
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (window.ptOverlay) window.ptOverlay.dismiss();
}

function show(payload) {
  const p = payload || {};
  const ar = p.lang === 'ar';
  const prayer = p.prayer || 'Dhuhr';

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
  audio.currentTime = 0;
  playing = true;
  playPauseBtn.textContent = '⏸';
  audio.play().catch(() => {
    // Don't loop retries: notification already fired; user can Stop manually.
    errLine.textContent = ar ? 'تعذر تشغيل الصوت — يمكنك الإيقاف' : 'Audio unavailable — you can dismiss';
  });

  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(stopAndClose, MAX_DURATION_MS);
}

document.getElementById('stopBtn').addEventListener('click', stopAndClose);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopAndClose(); });

playPauseBtn.addEventListener('click', () => {
  if (playing) { audio.pause(); playing = false; playPauseBtn.textContent = '▶'; }
  else { audio.play().catch(() => {}); playing = true; playPauseBtn.textContent = '⏸'; }
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
