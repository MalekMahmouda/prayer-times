'use strict';

/* ════════════════════════════════════════════════════════════
   compass.js — v1.3.2 device heading for the Qibla page.
   Depends on app.js: S, t(), $, showToast, qiblaBearing().

   Separation of concerns (v1.3.2 plan, Phase 2):
     • Qibla BEARING  — geographic, engine-owned (pt-engine);
       never depends on a compass.
     • DEVICE HEADING — which way the physical device faces,
       from sensors only.

   Sensor priority (Phase 4):
     1. native plugin  window.ptCompass.start(cb)   [Android shell]
     2. deviceorientationabsolute  (magnetometer-fused absolute)
     3. deviceorientation (e.webkitCompassHeading preferred on iOS;
        plain alpha only accepted when e.absolute === true)
   Relative-only alpha would invent a false north and point the
   Qibla wrong, so it is never trusted.

   Every accepted heading is normalized to 0 ≤ h < 360.
   NaN / Infinity / missing / absurd values are REJECTED (Phase 4).

   Screen rotation (Phase 6): sensors report relative to the device's
   NATURAL (portrait) frame and do not change when the screen rotates
   (W3C Device Orientation §3.1). screen.orientation.angle is the
   screen's counter-clockwise rotation from natural (Screen Orientation
   §2.2), so the heading in the CURRENT screen frame is
   norm360(heading_natural − angle). Legacy window.orientation is
   clockwise and falls back to the same subtract form.

   Relative arrow (Phase 5):
     turn = ((bearing − heading) + 540) % 360 − 180
   → signed −180..180; 0 = Kaaba straight ahead; + = rotate clockwise.

   Lifecycle (Phase 7): exactly ONE web listener per active period;
   start/stop cycles never accumulate; a late iOS permission grant
   after stop() wires nothing.

   Debug readout (Phase 8): PTCompass.debug(true) toggles an honest
   per-metric line — Qibla bearing / Device heading / Turn / Sensor.
   Desktop shows the geographic bearing only and never pretends to
   have a live sensor. PTCompass.snapshot() exposes the same values
   for the contract tests.

   v1.5 audit: the rim 🕋 marker is GONE. One centered needle points at
   the qibla on screen (angle = bearing − heading, tracked unwrapped for
   smooth motion across 0°/360°), with ±2° alignment detection and a
   single haptic buzz when alignment is ENTERED (re-armed on leaving).
   ════════════════════════════════════════════════════════════ */

(function () {
  const norm360 = (d) => ((d % 360) + 360) % 360;
  // Signed smallest rotation from a to b: −180..180, 0 = aligned (Phase 5).
  const signedTurn = (bearing, heading) => ((bearing - heading + 540) % 360) - 180;

  const state = {
    active: false,
    epoch: 0,             // bumped per start() — invalidates stale async grants
    heading: null,        // last accepted heading in the CURRENT screen frame
    lastAcceptedAt: 0,
    lastRaw: null,
    jitter: 0,            // smoothed |Δheading| — high jitter = uncalibrated
    source: null,         // 'native' | 'web'
    sensor: null,         // human-readable sensor label for the debug line
    denied: false,        // iOS permission explicitly denied
    webType: null,        // 'deviceorientationabsolute' | 'deviceorientation'
    fallbackType: null,   // opened after 3s of silence on the primary channel
    sensorTimer: null,
    webHandler: null,     // the ONE web handler (added on start, removed on stop)
    watchdog: null,
    lastRender: 0,
    aligned: false,       // |turn| ≤ ALIGNED_TOL on a fresh heading
    contAngle: null,      // unwrapped needle angle — smooth, no 359↔0 spin
    // v1.4.0: the diagnostic readout is OPT-IN for release (was on by default
    // during the v1.3.2 investigation). Enable with localStorage.ptCompassDebug=1.
    debug: (() => { try { return localStorage.getItem('ptCompassDebug') === '1'; } catch (e) { return false; } })(),
  };

  const STALE_MS = 3000;      // no updates for this long → unreliable
  const JITTER_LIMIT = 25;    // deg/s smoothed — above = uncalibrated
  const RENDER_MIN_MS = 100;  // throttle DOM updates (~10fps)
  const ABSURD_MAX = 1e6;     // "impossible" magnitude → reject the reading
  const ALIGNED_TOL = 2;      // deg — |turn| ≤ 2 counts as facing the Qibla
  const VIBRATE_MS = 80;      // one short buzz on ENTERING alignment (once)

  function els() {
    return {
      dial: $('compassIn'),
      needle: $('qNeedle'),
      status: $('compassStatus'),
      deg: $('qDeg'),
      dbg: $('qDbg'),
    };
  }

  /* ── Screen rotation (Phase 6) ───────────────────────────── */

  function screenAngle() {
    try {
      const so = window.screen && window.screen.orientation;
      if (so && typeof so.angle === 'number' && Number.isFinite(so.angle)) {
        return norm360(so.angle); // counter-clockwise from natural (spec)
      }
    } catch (e) { /* fall through */ }
    if (typeof window.orientation === 'number' && Number.isFinite(window.orientation)) {
      return norm360(window.orientation); // legacy fallback
    }
    return 0;
  }

  /* ── Heading intake (Phase 4) ────────────────────────────── */

  // Rejects NaN / Infinity / null / absurd magnitudes; normalizes the rest.
  function acceptHeading(deg) {
    if (typeof deg !== 'number' || !Number.isFinite(deg)) return false;
    if (Math.abs(deg) > ABSURD_MAX) return false;
    const raw = norm360(deg);
    // Sensors report against the natural portrait frame; re-express the
    // heading in the CURRENT screen frame so landscape reads correctly.
    const adjusted = norm360(raw - screenAngle());
    const now = Date.now();
    if (state.lastRaw != null) {
      let delta = Math.abs(adjusted - state.lastRaw);
      if (delta > 180) delta = 360 - delta;
      state.jitter = state.jitter * 0.8 + delta * 0.2; // exponential smoothing
    }
    state.lastRaw = adjusted;
    state.heading = adjusted;
    state.lastAcceptedAt = now;
    // Alignment (v1.5): shortest angular difference, so 359↔1 wraps
    // correctly. ONE buzz on ENTERING the aligned state; leaving re-arms.
    const turn = signedTurn(qiblaBearing(), adjusted);
    const nowAligned = Math.abs(turn) <= ALIGNED_TOL && !isUnreliable();
    if (nowAligned && !state.aligned) hapticBuzz();
    state.aligned = nowAligned;
    if (now - state.lastRender >= RENDER_MIN_MS) render();
    return true;
  }

  // Extract a TRUSTWORTHY heading from a web orientation event, or null.
  function headingFromEvent(e, webType) {
    if (!e || typeof e !== 'object') return null;
    // iOS exposes a true compass heading directly.
    if (typeof e.webkitCompassHeading === 'number') {
      return { heading: e.webkitCompassHeading, sensor: 'webkitCompassHeading' };
    }
    if (typeof e.alpha !== 'number') return null;
    // Only absolute data may define north. The absolute event type is
    // absolute by definition; plain deviceorientation must say so.
    const absolute = webType === 'deviceorientationabsolute' || e.absolute === true;
    if (!absolute) return null;
    // alpha is counter-sense to compass heading (spec §3.1 note).
    return { heading: 360 - e.alpha, sensor: webType };
  }

  /* ── Rendering (Phases 5 + 8) ────────────────────────────── */

  function sensorLabel() {
    if (state.sensor) return state.sensor;
    if (state.denied) return 'permission denied';
    return 'none';
  }

  function debugLine() {
    const b = qiblaBearing();
    if (state.heading == null) {
      return `Qibla bearing: ${Math.round(norm360(b))}° | Device heading: — | Turn: — | Sensor: ${sensorLabel()}`;
    }
    const turn = signedTurn(b, state.heading);
    const ts = (turn < 0 ? '−' : '+') + Math.abs(Math.round(turn)) + '°';
    return `Qibla bearing: ${Math.round(norm360(b))}° | Device heading: ${Math.round(state.heading)}° | Turn: ${ts} | Sensor: ${sensorLabel()}`;
  }

  function renderStatus(key, warn) {
    const { status } = els();
    if (!status) return;
    status.textContent = t(key);
    status.classList.toggle('warn', !!warn);
  }

  function isUnreliable() {
    if (state.heading == null) return true;
    if (Date.now() - state.lastAcceptedAt > STALE_MS) return true;
    return state.jitter > JITTER_LIMIT;
  }

  // One short buzz when the needle ENTERS the aligned state. Graceful on
  // devices without vibration (desktop Electron, iOS PWA): silent no-op.
  function hapticBuzz() {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(VIBRATE_MS);
      }
    } catch (e) { /* vibration API missing/blocked → stay silent */ }
  }

  function render() {
    if (!state.active) return;
    const now = Date.now();
    const { dial, needle, deg, dbg } = els();
    const b = norm360(qiblaBearing());
    if (deg) deg.textContent = `${Math.round(b)}°`;
    if (dbg && state.debug) dbg.textContent = debugLine();
    // DIAL (map-rose, v1.3.2): the rose rotates by −heading so its N mark
    // sits on true north. With no heading (static) the dial stays north-up.
    if (dial) dial.style.transform = `rotate(${state.heading == null ? 0 : -state.heading}deg)`;
    // NEEDLE (v1.5): one centered needle replaces the rim 🕋 marker. Its
    // screen angle is bearing − heading, so the tip points at the qibla and
    // rests straight up when the device faces the Qibla. The angle is
    // tracked UNWRAPPED and advanced by the shortest-path delta each frame:
    // motion stays smooth across the 0°/360° seam and never spins the long
    // way round. No heading (static desktop) → rests at the bare bearing.
    const target = state.heading == null ? b : norm360(b - state.heading);
    if (state.contAngle == null) state.contAngle = target;
    else state.contAngle += signedTurn(target, norm360(state.contAngle));
    if (needle) needle.style.transform = `rotate(${state.contAngle}deg)`;
    if (state.heading == null) {
      renderStatus(state.denied ? 'qibla.denied' : 'qibla.noSensor', state.denied);
    } else if (state.aligned && !isUnreliable()) {
      renderStatus('qibla.aligned', false);
    } else {
      renderStatus('qibla.live', isUnreliable());
    }
    state.lastRender = now;
  }

  /* ── Sources (Phase 4 priority) ──────────────────────────── */

  async function startNative() {
    const api = window.ptCompass;
    if (!api || typeof api.start !== 'function') return false;
    try {
      const res = await api.start((heading) => {
        if (!state.active) return;
        if (acceptHeading(heading)) state.sensor = 'native plugin';
      });
      if (res === false) return false;
      state.source = 'native';
      if (!state.sensor) state.sensor = 'native plugin';
      return true;
    } catch (e) { return false; }
  }

  // 'deviceorientationabsolute' when the UA exposes it, else the plain event.
  function pickWebType() {
    try {
      if ('ondeviceorientationabsolute' in window) return 'deviceorientationabsolute';
    } catch (e) { /* fall through */ }
    return 'deviceorientation';
  }

  function onWebOrientation(e) {
    if (!state.active) return;
    const got = headingFromEvent(e, state.webType);
    if (!got) return;
    if (acceptHeading(got.heading)) state.sensor = got.sensor;
  }

  // Some Android WebViews expose the absolute event type but never fire it
  // (no magnetometer stack), leaving the page sensor-less forever. If the
  // preferred channel is silent for 3s, open the fallback channel too —
  // validation (absolute flag / webkitCompassHeading) still protects north.
  function openFallbackChannel() {
    const other = state.webType === 'deviceorientationabsolute' ? 'deviceorientation' : 'deviceorientationabsolute';
    if (state.source === 'web' && !state.fallbackType) {
      try {
        window.addEventListener(other, state.webHandler, true);
        state.fallbackType = other;
      } catch (e) { /* ignore */ }
    }
  }

  function startWeb(epoch) {
    if (typeof window.DeviceOrientationEvent !== 'function') return false;
    if (state.webType) return true; // already wired this active period
    state.webType = pickWebType();
    if (!state.webHandler) state.webHandler = onWebOrientation; // ONE stable handler
    if (state.sensorTimer) { clearTimeout(state.sensorTimer); state.sensorTimer = null; }
    state.sensorTimer = setTimeout(() => {
      state.sensorTimer = null;
      if (state.active && state.epoch === epoch && state.heading == null) openFallbackChannel();
    }, 3000);
    const wire = () => {
      // Permission resolved after the page was left (or restarted) → nothing.
      if (!state.active || epoch !== state.epoch) return;
      window.addEventListener(state.webType, state.webHandler, true);
      state.source = 'web';
    };
    try {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        window.DeviceOrientationEvent.requestPermission()
          .then((r) => {
            if (!state.active || epoch !== state.epoch) return; // stale grant
            if (r === 'granted') wire();
            else { state.denied = true; render(); }
          })
          .catch(() => {
            if (!state.active || epoch !== state.epoch) return;
            state.denied = true; render();
          });
        return true;
      }
      wire();
      return true;
    } catch (e) {
      state.webType = null;
      return false;
    }
  }

  function setDebug(on) {
    state.debug = !!on;
    const { dbg } = els();
    if (dbg) {
      dbg.style.display = state.debug ? 'block' : 'none';
      if (state.debug) dbg.textContent = debugLine();
    }
  }

  function startWatchdog() {
    if (state.watchdog) clearInterval(state.watchdog);
    state.watchdog = setInterval(() => {
      if (!state.active) return;
      render(); // decides static vs live honestly from its own state
    }, 1000);
  }

  /* Public API — pages.js calls start/stop when the Qibla page shows/hides. */
  window.PTCompass = {
    start() {
      if (state.active) return;
      state.active = true;
      state.epoch++;
      const epoch = state.epoch;
      state.jitter = 0;
      state.heading = null;
      state.lastRaw = null;
      state.denied = false;
      state.sensor = null;
      state.aligned = false;   // haptic re-arms on every visit
      state.contAngle = null;  // needle re-seeds without spinning
      state.webType = null;
      (async () => {
        const ok = (await startNative()) || startWeb(epoch);
        if (state.active && !ok) {
          // Desktop / unsupported browser: static bearing, honestly labeled.
          renderStatus('qibla.static', false);
        } else {
          startWatchdog();
        }
        render();
        setDebug(state.debug); // P8 readout follows every visit
      })();
    },
    stop() {
      state.active = false;
      state.epoch++; // any pending permission grant is now stale
      state.heading = null;
      state.jitter = 0;
      state.denied = false;
      state.sensor = null;
      state.aligned = false;
      state.contAngle = null;
      if (state.watchdog) { clearInterval(state.watchdog); state.watchdog = null; }
      if (state.source === 'web') {
        // Remove the SAME handler(s) with the SAME capture flag they were
        // added with — otherwise every Qibla visit stacked another listener.
        if (state.sensorTimer) { clearTimeout(state.sensorTimer); state.sensorTimer = null; }
        if (state.webHandler && state.webType) {
          try { window.removeEventListener(state.webType, state.webHandler, true); } catch (e) { /* ignore */ }
        }
        if (state.webHandler && state.fallbackType) {
          try { window.removeEventListener(state.fallbackType, state.webHandler, true); } catch (e) { /* ignore */ }
        }
        state.webType = null;
        state.fallbackType = null;
        state.source = null;
      }
      if (state.source === 'native' && window.ptCompass && typeof window.ptCompass.stop === 'function') {
        try { window.ptCompass.stop(); } catch (e) { /* ignore */ }
        state.source = null;
      }
    },
    // Phase 8: honest debug readout (also drives the contract tests via snapshot).
    debug(on) { setDebug(on); },
    // Machine-readable mirror of the debug line, for tests and diagnostics.
    snapshot() {
      const b = norm360(qiblaBearing());
      return {
        bearing: b,
        heading: state.heading,
        turn: state.heading == null ? null : signedTurn(b, state.heading),
        aligned: state.aligned,
        sensor: sensorLabel(),
        screenAngle: screenAngle(),
        unreliable: isUnreliable(),
      };
    },
  };
})();
