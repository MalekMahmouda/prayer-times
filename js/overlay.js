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

// Media state dump (v1.3.2): "play() resolved" means Chromium ACCEPTED the
// request — this dump proves whether the element is actually rendering audio
// (paused/muted/readyState/error), separating an output-device problem from
// a media-element problem.
function mediaState() {
  return {
    paused: audio.paused,
    muted: audio.muted,
    volume: audio.volume,
    readyState: audio.readyState,
    networkState: audio.networkState,
    currentTime: Math.round((audio.currentTime || 0) * 100) / 100,
    duration: audio.duration,
    sinkId: String(audio.sinkId || ''),
    error: audio.error ? describeMediaError(audio.error) : null,
  };
}

// Media boundaries (v1.3.2): each listener marks one link of the playback
// chain, so a silent failure points at the exact boundary that never logged.
audio.addEventListener('canplay', () => dbg('audio canplay (file decoded by the OS)', { duration: audio.duration }));
audio.addEventListener('loadeddata', () => dbg('audio loadeddata (first frame ready)', mediaState()));
audio.addEventListener('playing', () => dbg('audio playing (output device active)', mediaState()));
audio.addEventListener('volumechange', () => dbg('audio volumechange', { volume: audio.volume, muted: audio.muted }));
audio.addEventListener('stalled', () => dbg('audio stalled', mediaState()));
audio.addEventListener('waiting', () => dbg('audio waiting (buffering)', mediaState()));
audio.addEventListener('pause', () => dbg('audio paused', mediaState()));
audio.addEventListener('ended', () => dbg('audio ended'));
// Output-device health (v1.3.2): Chromium can latch a media stream onto a
// DEAD default endpoint (errored/asleep HDMI "Intel Display Audio", unplugged
// Bluetooth) — the stream then "plays" with currentTime advancing into a
// device with no speakers, while VLC/system sounds use a live device. Cure:
// log the actual endpoints, bind explicitly to the live system default
// (setSinkId('')), and re-bind whenever the device list changes.
let lastDeviceSignature = '';
function outputDeviceSignature() {
  return navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
    ? navigator.mediaDevices.enumerateDevices().then((ds) => {
      const outs = ds.filter((d) => d.kind === 'audiooutput');
      return JSON.stringify(outs.map((d) => `${d.deviceId.slice(0, 8)}|${d.label}`));
    }).catch(() => 'enumeration-failed')
    : Promise.resolve('no-enumerateDevices');
}
async function auditOutputDevices(why) {
  try {
    const sig = await outputDeviceSignature();
    dbg('output devices', { why, count: sig === 'no-enumerateDevices' ? -1 : (sig.match(/\|/g) || []).length, devices: sig, activeSink: String(audio.sinkId || 'default') });
    if (lastDeviceSignature && sig !== lastDeviceSignature) {
      dbg('output device list CHANGED — rebinding sink to system default');
      try { await audio.setSinkId(''); dbg('sink rebound to system default', { sinkId: String(audio.sinkId || 'default') }); } catch (e) { dbg('setSinkId failed', { detail: describeMediaError(e) }); }
    }
    lastDeviceSignature = sig;
  } catch (e) { dbg('output audit failed', { detail: String(e && e.message || e) }); }
}
try {
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => auditOutputDevices('devicechange'));
  }
} catch (e) { /* optional diagnostic only */ }

function stopAndClose(reason) {
  // Why did playback stop? Distinguishes the natural end, the user, and the
  // 6-minute force close — a close WITHOUT a prior 'audio ended'/'audio
  // paused' line means the element stopped on its own (silently).
  try { dbg('overlay closing', Object.assign({ reason: reason || 'unspecified' }, mediaState())); } catch (e) { /* never block the close */ }
  try { audio.pause(); } catch (e) { /* already paused/unavailable — closing the overlay is the user-visible outcome */ }
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
  // Explicit output contract (v1.3.2): the element MUST be unmuted with a
  // clamped volume — no inherited state can silently silence playback.
  const v = Math.min(1, Math.max(0, Number(p.volume)));
  audio.volume = Number.isFinite(v) ? v : 1;
  audio.muted = false;
  volSlider.value = String(audio.volume);

  // Source was resolved by the main process (bundled local file first).
  // Bind to the LIVE system default output (never a stale/errored endpoint).
  try { audio.setSinkId('').catch((e) => dbg('setSinkId(default) failed at show', { detail: describeMediaError(e) })); } catch (e) { /* older Chromium */ }
  auditOutputDevices('show');
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
  closeTimer = setTimeout(() => stopAndClose('max duration reached (6 min)'), MAX_DURATION_MS);
}

document.getElementById('stopBtn').addEventListener('click', () => stopAndClose('user stop button'));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') stopAndClose('user Escape key'); });

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

audio.addEventListener('ended', () => stopAndClose('audio ended'));
audio.addEventListener('error', () => {
  if (!audio.src) return;
  errLine.textContent = (document.getElementById('lbl').dataset.ar === '1')
    ? 'تعذر تحميل ملف الصوت' : 'Could not load the audio file';
});

// Receive adhan events from the main process (registered once, at startup).
if (window.ptOverlay) window.ptOverlay.onShow(show);
