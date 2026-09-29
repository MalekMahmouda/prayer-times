'use strict';

/* ════════════════════════════════════════════════════════════
   compass.js — live device heading for the Qibla page.
   Depends on app.js: S, t(), $, showToast, qiblaBearing().
   Qibla BEARING math lives in the shared contract (pt-engine);
   this file only supplies the DEVICE HEADING and the relative
   rotation: relativeQibla = normalize(bearing − heading).

   Platforms:
     • Android  → native plugin (window.ptCompass, verified at build time)
     • Browser  → deviceorientation / webkitCompassHeading where available
     • Desktop  → static bearing (no sensors); nothing fake is claimed
   Safe no-op everywhere when no heading source exists.
   ════════════════════════════════════════════════════════════ */

(function () {
  const norm360 = (d) => ((d % 360) + 360) % 360;

  const state = {
    active: false,
    heading: null,        // last accepted heading (deg, 0..360)
    lastAcceptedAt: 0,
    lastRaw: null,
    jitter: 0,            // smoothed |Δheading| — high jitter = unreliable
    source: null,         // 'native' | 'web'
    watchdog: null,
    lastRender: 0,
  };

  const STALE_MS = 3000;      // no updates for this long → unreliable
  const JITTER_LIMIT = 25;    // deg/s smoothed — above = uncalibrated
  const RENDER_MIN_MS = 100;  // throttle DOM updates (~10fps)

  function els() {
    return {
      needle: $('compassIn'),
      mark: $('kaabaMark'),
      status: $('compassStatus'),
      deg: $('qDeg'),
    };
  }

  function relative() {
    if (state.heading == null) return null;
    const b = qiblaBearing();
    return norm360(b - state.heading);
  }

  function renderStatus(key, unreliable) {
    const { status } = els();
    if (!status) return;
    if (unreliable) {
      status.textContent = t('qibla.calibrate');
      status.classList.add('warn');
    } else {
      status.textContent = t(key);
      status.classList.toggle('warn', false);
    }
  }

  function render() {
    if (!state.active) return;
    const now = Date.now();
    const { needle, deg } = els();
    const rel = relative();
    const b = qiblaBearing();
    if (deg) deg.textContent = `${Math.round(b)}°`;
    if (needle && rel != null) needle.style.transform = `rotate(${rel}deg)`;
    if (needle && rel == null) needle.style.transform = `rotate(${b}deg)`;
    renderStatus('qibla.live', isUnreliable());
    state.lastRender = now;
  }

  function isUnreliable() {
    if (state.heading == null) return true;
    if (Date.now() - state.lastAcceptedAt > STALE_MS) return true;
    return state.jitter > JITTER_LIMIT;
  }

  function acceptHeading(deg) {
    if (!Number.isFinite(deg)) return;
    const d = norm360(deg);
    if (state.lastRaw != null) {
      let delta = Math.abs(d - state.lastRaw);
      if (delta > 180) delta = 360 - delta;
      // exponential smoothing of the per-update delta
      state.jitter = state.jitter * 0.8 + delta * 0.2;
    }
    state.lastRaw = d;
    state.heading = d;
    state.lastAcceptedAt = Date.now();
    const now = Date.now();
    if (now - state.lastRender >= RENDER_MIN_MS) render();
  }

  /* ── Sources ─────────────────────────────────────────────── */

  async function startNative() {
    const api = window.ptCompass;
    if (!api || typeof api.start !== 'function') return false;
    try {
      const res = await api.start((heading) => acceptHeading(heading));
      if (res === false) return false;
      state.source = 'native';
      return true;
    } catch (e) { return false; }
  }

  function startWeb() {
    if (typeof window.DeviceOrientationEvent !== 'function') return false;
    const handler = (e) => {
      // iOS exposes compass heading on webkitCompassHeading; Android Chrome
      // exposes alpha (counter-clockwise from north) — convert.
      let h = null;
      if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
      else if (typeof e.alpha === 'number') h = norm360(360 - e.alpha);
      if (h != null) acceptHeading(h);
    };
    const req = () => {
      window.addEventListener('deviceorientation', handler, true);
      state.source = 'web';
    };
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then((r) => { if (r === 'granted') req(); })
          .catch(() => { /* denied → static mode */ });
      } else {
        req();
      }
      return true;
    } catch (e) { return false; }
  }

  function startWatchdog() {
    if (state.watchdog) clearInterval(state.watchdog);
    state.watchdog = setInterval(() => {
      if (!state.active) return;
      if (state.heading == null) {
        // Source exists but never delivered → show static + hint honestly.
        renderStatus('qibla.noSensor', false);
      } else {
        render();
      }
    }, 1000);
  }

  /* Public API — pages.js calls these when the Qibla page shows/hides. */
  window.PTCompass = {
    start() {
      if (state.active) return;
      state.active = true;
      state.jitter = 0;
      state.heading = null;
      state.lastRaw = null;
      (async () => {
        const ok = (await startNative()) || startWeb();
        if (state.active && !ok) {
          // Desktop / unsupported browser: static bearing, honestly labeled.
          renderStatus('qibla.static', false);
        } else {
          startWatchdog();
        }
        render();
      })();
    },
    stop() {
      state.active = false;
      state.heading = null;
      state.jitter = 0;
      if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
      if (state.source === 'web') {
        // listeners are per page-visit; a reload clears them
        state.source = null;
      }
      if (state.source === 'native' && window.ptCompass && typeof window.ptCompass.stop === 'function') {
        try { window.ptCompass.stop(); } catch (e) { /* ignore */ }
        state.source = null;
      }
    },
  };
})();
