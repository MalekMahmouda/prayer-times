'use strict';

/* ═════════════════════════════════════════════════════════════════════
   Prayer Times — motion module (js/motion.js)
   The one place JS-driven motion lives, mirroring styles/motion.css.
   Exposed as window.PTMotion. Depends on nothing at load time; the app
   globals it reads late are documented per-function.

   Tools used, cheapest first: CSS transitions/animations (motion.css) ·
   WAAPI (element.animate — countdown roll, taps) · rAF spring solver
   (compass needle) · View Transitions API (page + theme changes).
   Properties: transform and opacity only. prefers-reduced-motion gates
   every blocking call here; CSS-side motion is already covered by the
   global reduce rule in app.css.
   ═════════════════════════════════════════════════════════════════════ */

(function () {
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => REDUCE.matches;
  const supportsVT = typeof document.startViewTransition === 'function';

  function el(sel) { return (typeof $ === 'function') ? $(sel) : document.querySelector(sel); }

  const PTM = {};

  /* ── 1. Countdown: rolling digits ────────────────────────────────────
     setCountdown(elm, 'HH:MM:SS'). Builds a per-character face on first use.
     Only changed digits roll: the new value slides in from the top while the
     old slides out the bottom (a countdown counts down — the odometer turns
     downward), 220ms ease-out, transform+opacity only. Colons stay static.
     Reduced motion / first paint: plain textContent swap. */
  const faces = new WeakMap();
  PTM.setCountdown = function (elm, str) {
    if (!elm) return;
    if (reduced() || !('animate' in Element.prototype)) { elm.textContent = str; return; }
    let st = faces.get(elm);
    if (!st) {
      st = { chars: null, cells: [] };
      elm.innerHTML = '';
      elm.style.minWidth = '';
      elm.classList.add('cd-face');
      st.cells = Array.from(str).map((c) => {
        const cell = document.createElement('span');
        cell.className = 'cell ' + (c === ':' ? 'f' : 'font');
        const v = document.createElement('span');
        v.className = 'v'; v.textContent = c;
        cell.appendChild(v);
        elm.appendChild(cell);
        return v;
      });
      st.chars = Array.from(str);
      faces.set(elm, st);
      return;
    }
    const next = Array.from(str);
    if (next.length !== st.cells.length && next.length !== 8) { elm.textContent = str; return; }
    if (next.length !== st.cells.length) {
      elm.textContent = str; faces.delete(elm); return; // format changed — fall back safely
    }
    for (let i = 0; i < next.length; i++) {
      if (st.chars[i] === next[i]) continue;
      const v = st.cells[i];
      if (next[i] === ':') { v.textContent = ':'; }
      else {
        const old = document.createElement('span');
        old.className = 'old'; old.textContent = st.chars[i];
        v.textContent = next[i];
        v.parentElement.appendChild(old);
        v.animate(
          [{ transform: 'translateY(-55%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
          { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
        const out = old.animate(
          [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(55%)', opacity: 0 }],
          { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' }
        );
        out.onfinish = () => old.remove();
        out.oncancel = () => old.remove();
      }
      st.chars[i] = next[i];
    }
  };

  PTM.clearCountdown = function (elm) {
    if (!elm) return;
    faces.delete(elm);
    elm.classList.remove('cd-face');
    elm.textContent = '--:--:--';
  };

  /* Loading skeleton — the countdown keeps its column but shows a shimmer
     block (the .skeleton blend already defined in app.css) while times are
     still loading. Replaced by the first real setCountdown call. */
  PTM.skeleton = function (elm) {
    if (!elm || faces.get(elm)) return;
    elm.style.minWidth = '7ch';
    elm.innerHTML = '<span class="skeleton cd-skel"></span>';
  };

  /* ── 2. Countdown progress arc ───────────────────────────────────────
     Thin rounded-rect stroke around the countdown chip: elapsed fraction of
     the prayer interval, drawn with pathLength=100. Mirrored via scaleX in
     RTL by motion.css on the parent (single svg transform). */
  PTM.mountArc = function (fromEl) {
    if (!fromEl || fromEl.querySelector('.cd-arc')) return;
    const pos = getComputedStyle(fromEl).position;
    if (pos === 'static') fromEl.style.position = 'relative';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'cd-arc');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '1.75'); rect.setAttribute('y', '1.75');
    rect.setAttribute('width', '96.5'); rect.setAttribute('height', '96.5');
    rect.setAttribute('rx', '13'); rect.setAttribute('pathLength', '100');
    rect.style.strokeDasharray = '100'; rect.style.strokeDashoffset = '100';
    svg.appendChild(rect);
    fromEl.appendChild(svg);
  };

  PTM.setArc = function (hostEl, frac) {
    const rect = hostEl && hostEl.querySelector('.cd-arc rect');
    if (!rect) return;
    rect.style.strokeDashoffset = String(100 * (1 - Math.max(0, Math.min(1, frac))));
  };

  /* Mobile: hairline progress bar under the countdown (same fraction). */
  PTM.setBar = function (hostEl, frac) {
    const i = hostEl && hostEl.querySelector('.mh-prog i');
    if (!i) return;
    i.style.transform = 'scaleX(' + Math.max(0, Math.min(1, frac)).toFixed(4) + ')';
  };
  PTM.mountBar = function (hostEl) {
    if (!hostEl || hostEl.querySelector('.mh-prog')) return;
    const d = document.createElement('div');
    d.className = 'mh-prog'; d.setAttribute('aria-hidden', 'true');
    d.appendChild(document.createElement('i'));
    hostEl.appendChild(d);
  };

  /* Fraction of the interval between the previous and next prayer that has
     elapsed. Reads (documented app-globals): S.times, PRAYERS,
     S.todaySchedule.instants, nextPrayerInfo()/instantNow()/adjTime().
     Returns null when times are unavailable (the arc stays empty). */
  PTM.prayerIntervalFrac = function () {
    if (typeof S === 'undefined' || !S.times) return null;
    try {
      const info = (typeof nextPrayerInfo === 'function') ? nextPrayerInfo() : null;
      if (!info) return null;
      const now = (typeof instantNow === 'function') ? instantNow() : new Date();
      const I = S.todaySchedule && S.todaySchedule.instants;
      const atOf = (p) => (I && Number.isFinite(I[p])) ? new Date(I[p]) : (typeof adjTime === 'function' ? adjTime(p, S.times[p]) : null);
      let prev;
      if (info.isTomorrow || info.idx === 0) prev = atOf('Isha'); // next is (tomorrow's) Fajr
      else prev = atOf((typeof PRAYERS !== 'undefined' ? PRAYERS : [])[info.idx - 1]);
      if (!prev || !info.next || !(info.next.at > prev)) return null;
      return (now - prev) / (info.next.at - prev);
    } catch (e) { return null; }
  };

  /* ── 3. Sun & night arc ──────────────────────────────────────────────
     One card per dashboard: horizon, day arc, marker. Whole-line drawing
     only; the marker moves via transform (transition in motion.css).
     Reads (late-bound): S.todaySchedule.sun / S.times.Sunrise|Sunset,
     resolveTz(), zonedNowHM() — minutes are the LOCATION's wall clock. */
  function parseMin(hhmm) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const h = +m[1], mn = +m[2];
    return (h % 24) * 60 + mn;
  }
  function nowMinNow() {
    try {
      if (typeof resolveTz === 'function' && typeof zonedNowHM === 'function') return zonedNowHM(resolveTz());
    } catch (e) { /* fall through */ }
    const n = new Date(); return n.getHours() * 60 + n.getMinutes();
  }
  function arcMarkup() {
    return '<div class="sa-lbl" aria-hidden="true"><span class="sa-rise"></span><span class="sa-set"></span></div>' +
      '<svg viewBox="0 0 120 74" role="img">' +
      '  <line x1="6" y1="62" x2="114" y2="62" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>' +
      '  <path d="M6 62 A54 50 0 0 1 114 62" fill="none" stroke="var(--gold)" stroke-opacity=".5" stroke-width="1.25" vector-effect="non-scaling-stroke" stroke-linecap="round"/>' +
      '  <g class="pt-sun-marker">' +
      // user-unit sizes are calibrated for the card's rendered width
      // (.sun-arc svg ≈ 500–560px → ≈4.3× scale): 2.5u ≈ 11px marker disc
      '    <circle r="2.5" fill="var(--gold)"/>' +
      '    <path class="pt-sun-horn" d="M-4.5 0a4.5 4.5 0 0 1 9 0" fill="none" stroke="var(--gold)" stroke-opacity=".3" stroke-width="0.8"/>' +
      '  </g>' +
      '</svg>';
  }
  function sunPos(t) { // t∈0..1 along the day arc
    return { x: 6 + 108 * t, y: 62 - 50 * Math.sin(Math.PI * t) };
  }
  PTM.mountSunArc = function (anchorEl) { // anchor: insert before this element
    if (!anchorEl || !anchorEl.parentElement) return null;
    const host = anchorEl.parentElement.querySelector('.sun-arc[data-pt]');
    if (host) return host;
    const card = document.createElement('div');
    card.className = 'sun-arc card'; card.dataset.pt = '1';
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = arcMarkup();
    anchorEl.parentElement.insertBefore(card, anchorEl);
    return card;
  };
  PTM.updateSunArc = function () { // find both mounted arcs in the document
    const sun = (typeof S !== 'undefined' && S.todaySchedule && S.todaySchedule.sun) || {};
    const rise = parseMin(sun.sunrise || (S.times && S.times.Sunrise));
    const set = parseMin(sun.sunset || (S.times && S.times.Sunset));
    document.querySelectorAll('.sun-arc[data-pt]').forEach((card) => {
      if (rise == null || set == null) { card.style.display = 'none'; return; }
      card.style.display = '';
      const riseLbl = card.querySelector('.sa-rise'), setLbl = card.querySelector('.sa-set');
      const mm = (v) => String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
      if (riseLbl && typeof fmtAtLoc === 'function') riseLbl.textContent = t('sunrise') + ' ' + (sun.sunrise || (S.times && S.times.Sunrise) || mm(rise));
      if (setLbl && typeof fmtAtLoc === 'function') setLbl.textContent = t('sunset') + ' ' + (sun.sunset || (S.times && S.times.Sunset) || mm(set));
      const now = nowMinNow();
      let x, y, moon = false;
      if (now >= rise && now <= set) {
        const p = sunPos((now - rise) / (set - rise)); x = p.x; y = p.y;
      } else {
        // Night: the marker rests just below the horizon at the night's own
        // progress (sunset→sunrise through midnight), dimmed to a moon disc.
        moon = true;
        let nightLen = (1440 - set) + rise;
        let done = now > set ? (now - set) : (now + (1440 - set));
        const p = sunPos(Math.max(0, Math.min(1, done / nightLen)));
        x = p.x; y = 62 + 10;
      }
      const g = card.querySelector('.pt-sun-marker');
      if (g) {
        g.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px)';
        g.style.opacity = moon ? .55 : 1;
        const horn = g.querySelector('.pt-sun-horn');
        if (horn) horn.style.display = moon ? 'none' : '';
      }
    });
  };

  /* ── 4. Compass needle spring ────────────────────────────────────────
     A critically-tuned spring (slight, honest overshoot ≪ the ±2° tolerance)
     written with a fixed-dt Euler pass. Targets may arrive at 10fps from the
     sensor (shortest-path delta, unwrapped accumulator in compass.js state —
     we re-wrap internally so the spring never fights 359↔0). */
  const springs = new WeakMap();
  const SPRING = { k: 0.022, damp: 0.86 }; // per-frame (60fps): stiffness / damping
  PTM.springAngle = function (elm, targetDeg) {
    if (!elm) return;
    if (reduced()) { elm.style.transform = 'rotate(' + targetDeg + 'deg)'; return; }
    let st = springs.get(elm);
    if (!st) { st = { next: targetDeg }; springs.set(elm, st); }
    st.next = targetDeg;
    if (st.running) return;
    // current rotation from the inline style (compass.js tracks unwrapped)
    const cur = parseFloat((elm.style.transform.match(/rotate\((-?[\d.]+)deg\)/) || [])[1] || targetDeg);
    st.cur = Number.isFinite(cur) ? cur : targetDeg;
    const step = () => {
      if (springs.get(elm) !== st) { st.running = false; return; }
      // retarget mid-flight: prefer the shortest angular path to the new goal
      let delta = st.next - st.cur;
      delta = ((delta + 540) % 360) - 180;
      const target = st.cur + delta;
      // damped spring: acceleration proportional to displacement, velocity lost
      // to damping each frame — a small, honest overshoot, then settle
      st.vel = (st.vel + (target - st.cur) * SPRING.k) * SPRING.damp;
      st.cur += st.vel;
      elm.style.transform = 'rotate(' + st.cur.toFixed(3) + 'deg)';
      if (Math.abs(target - st.cur) < 0.05 && Math.abs(st.vel) < 0.05) {
        elm.style.transform = 'rotate(' + target.toFixed(2) + 'deg)';
        st.running = false;
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /* ── 5. Dhikr counter feedback ─────────────────────────────────────── */
  const dhikrTap = { last: null }; // last pointerdown position (tap-centered ripple)
  PTM.dhikrTap = function (ring, countEl, milestone) {
    if (reduced()) return;
    if (ring) {
      const r = ring.getBoundingClientRect();
      const rip = document.createElement('span');
      rip.className = 'dhikr-ripple';
      const size = Math.max(42, Math.min(r.width, r.height) * 0.9);
      rip.style.width = rip.style.height = size + 'px';
      // centered on the tap point, clamped inside the ring
      const ev = dhikrTap.last || null;
      const cx = ev ? ev.x : r.left + r.width / 2, cy = ev ? ev.y : r.top + r.height / 2;
      rip.style.left = (cx - r.left - size / 2) + 'px';
      rip.style.top = (cy - r.top - size / 2) + 'px';
      ring.appendChild(rip);
      rip.addEventListener('animationend', () => rip.remove(), { once: true });
    }
    if (countEl) {
      countEl.classList.remove('pop');
      void countEl.offsetWidth; // restart the pop on rapid taps
      countEl.classList.add('pop');
      countEl.addEventListener('animationend', () => countEl.classList.remove('pop'), { once: true });
    }
    if (milestone && ring) {
      ring.classList.remove('milestone');
      void ring.offsetWidth;
      ring.classList.add('milestone');
      setTimeout(() => ring.classList.remove('milestone'), 800);
    }
    // Haptics: short buzz on every tap, a double-buzz on the milestone.
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(milestone ? [18, 40, 26] : 10);
      }
    } catch (e) { /* no haptics — stay silent */ }
  };
  PTM.beginTap = function (ev) { // call from pointerdown/tap handlers
    try {
      dhikrTap.last = { x: ev.clientX, y: ev.clientY };
    } catch (e) { /* ignore */ }
  };

  /* ── 6. Page navigation (shared-axis View Transitions) ────────────────
     navigate(fn, toIdx, fromIdx): fn performs the DOM swap synchronously.
     Direction from the page order; omitted indexes = neutral. Reduced
     motion / no VT support: call fn directly. */
  PTM.navigate = function (fn, toIdx, fromIdx) {
    if (reduced() || !supportsVT) { fn(); return; }
    const dir = (toIdx == null || fromIdx == null || toIdx === fromIdx) || toIdx > fromIdx ? 'fwd' : 'back';
    const root = document.documentElement;
    root.dataset.vtdir = dir;
    let vt;
    try { vt = document.startViewTransition(fn); }
    catch (e) { fn(); return; }
    if (vt && vt.finished) vt.finished.then(() => { delete root.dataset.vtdir; }).catch(() => { delete root.dataset.vtdir; });
  };

  /* ── 7. Theme switch: circular reveal from the tapped swatch ───────── */
  PTM.themeChange = function (apply, ev) {
    if (reduced() || !supportsVT) { apply(); return; }
    const root = document.documentElement;
    const x = ev && Number.isFinite(ev.clientX) ? ev.clientX : window.innerWidth - 92;
    const y = ev && Number.isFinite(ev.clientY) ? ev.clientY : 96;
    root.style.setProperty('--pt-mx', x + 'px');
    root.style.setProperty('--pt-my', y + 'px');
    // Reveal around the tap point in VIEWPORT coordinates; the pseudo layers
    // inherit these vars from :root, and the class scope limits the effect to
    // theme changes only (page swaps keep their shared-axis choreography).
    root.classList.add('pt-vt-theme');
    let vt;
    try { vt = document.startViewTransition(apply); }
    catch (e) { root.classList.remove('pt-vt-theme'); apply(); return; }
    if (vt && vt.ready) vt.ready.then(() => { root.classList.remove('pt-vt-theme'); }).catch(() => { root.classList.remove('pt-vt-theme'); });
    if (vt && vt.finished) vt.finished.catch(() => {});
  };

  /* ── 8. Numbers count up — once per element per page load ──────────── */
  const counted = new WeakSet();
  PTM.countUp = function (elm, value) {
    const v = Math.round(+value || 0);
    elm.textContent = String(v);
    if (reduced() || v === 0 || counted.has(elm)) return;
    counted.add(elm);
    if (!('animate' in Element.prototype)) return; // static value already set
    const t0 = performance.now(), dur = 550;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out quart
      elm.textContent = String(Math.round(v * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* ── 9b. List stagger (opt-in entrance) ──────────────────────────────
     Adds the .stagger class so freshly-mounted prayer cards enter with a
     short per-card offset, then removes it so later re-renders (the 30s tick
     repaints the same list) paint instantly. Per-card --i index comes from
     the renderer. Reduced motion is already neutralised globally. */
  PTM.stagger = function (container) {
    if (!container) return;
    container.classList.add('stagger');
    Array.from(container.children).forEach((c, i) => {
      if (!c.style.getPropertyValue('--i')) c.style.setProperty('--i', String(i));
    });
    clearTimeout(PTM.stagger._t);
    PTM.stagger._t = setTimeout(() => container.classList.remove('stagger'), 900);
  };

  /* ── 9. Sidebar sliding indicator ────────────────────────────────────
     One gold bar owned by FAQ-nav container, moved between the active rows by
     transform (motion.css holds the transition). Measured offsets are
     physical px — RTL adds the gutter on the correct side automatically. */
  PTM.indicator = function (navEl, active) {
    if (!navEl) return;
    let bar = navEl.querySelector('.sb-ind');
    if (!bar) {
      if (!active) return;
      bar = document.createElement('span');
      bar.className = 'sb-ind'; bar.setAttribute('aria-hidden', 'true');
      navEl.appendChild(bar);
    }
    if (!active) { bar.style.opacity = '0'; return; }
    const h = active.offsetHeight;
    const top = active.offsetTop + h * 0.18;
    const barH = h * 0.64;
    const rtl = document.documentElement.dir === 'rtl';
    const x = rtl ? (active.offsetLeft + active.offsetWidth + 10) : (active.offsetLeft - 10);
    bar.style.opacity = '1';
    bar.style.width = '3.5px';
    bar.style.height = barH + 'px';
    bar.style.left = '0'; bar.style.top = '0';
    bar.style.transform = 'translate(' + x.toFixed(1) + 'px,' + top.toFixed(1) + 'px)';
  };

  /* Re-run the last indicator position when the sidebar reflows (compact rail,
     window resize, font swap). */
  PTM.layoutIndicators = function () {
    const nav = document.querySelector('.sb-nav');
    if (!nav) return;
    const active = nav.querySelector('.nav-item.active');
    if (active) PTM.indicator(nav, active);
  };
  let rz = null;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(PTM.layoutIndicators, 120);
  });

  window.PTMotion = PTM;
})();
