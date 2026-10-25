'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(reduce = false) {
  const elements = [], frames = new Map();
  let id = 0, listener;
  class Element {
    constructor() {
      this.children = []; this.parentElement = null; this.style = { transform: '' };
      this.classes = new Set(); this.animations = []; this._text = '';
      this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c) };
      elements.push(this);
    }
    set className(v) { this.classes = new Set(v.split(' ')); }
    set textContent(v) { this.children.forEach(c => c.parentElement = null); this.children = []; this._text = v; }
    get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
    set innerHTML(v) { this.textContent = v; }
    appendChild(c) { this.children.push(c); c.parentElement = this; }
    contains(c) { return this.children.some(x => x === c || x.contains(c)); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    animate() { const a = { cancel() { if (this.oncancel) this.oncancel(); } }; this.animations.push(a); return a; }
    getAnimations() { return this.animations.concat(...this.children.map(c => c.getAnimations())); }
  }
  const media = { matches: reduce, addEventListener(type, cb) { listener = cb; } };
  const document = { createElement: () => new Element(), querySelectorAll: () => elements.filter(e => e.classes.has('cd-face')) };
  const window = { matchMedia: () => media, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/motion.js'), 'utf8'), {
    window, document, Element, requestAnimationFrame: cb => { frames.set(++id, cb); return id; },
    cancelAnimationFrame: i => frames.delete(i), setTimeout, clearTimeout
  });
  return {
    motion: window.PTMotion, element: () => new Element(), frames,
    toggle(v) { media.matches = v; listener(); },
    step() { const pending = [...frames.values()]; frames.clear(); pending.forEach(cb => cb()); },
    settle() { let n = 0; while (frames.size && n++ < 1000) this.step(); assert.equal(frames.size, 0, 'spring must settle'); }
  };
}
const angle = e => Number(e.style.transform.match(/rotate\(([-\d.]+)deg\)/)[1]);
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS', name); }

test('spring has finite velocity and only one animation loop during retargets', () => {
  const h = setup(), needle = h.element(); needle.style.transform = 'rotate(0deg)';
  h.motion.springAngle(needle, 90); h.motion.springAngle(needle, 100);
  assert.equal(h.frames.size, 1); h.step(); assert.ok(Number.isFinite(angle(needle)));
  h.motion.springAngle(needle, 110); assert.equal(h.frames.size, 1);
  h.settle(); assert.ok(Math.abs(angle(needle) - 110) < .1);
});
test('spring follows short path across zero and arbitrary negative revolutions', () => {
  for (const [start, end, expected] of [[359, 1, 361], [1, 359, -1], [0, -1081, -1]]) {
    const h = setup(), needle = h.element(); needle.style.transform = `rotate(${start}deg)`;
    h.motion.springAngle(needle, end); h.step(); assert.ok(Math.abs(angle(needle) - start) < 1);
    h.settle(); assert.ok(Math.abs(angle(needle) - expected) < .1);
  }
});
test('reduced motion immediately cancels a running spring and can resume', () => {
  const h = setup(), needle = h.element(); needle.style.transform = 'rotate(0deg)';
  h.motion.springAngle(needle, 90); h.step(); h.toggle(true);
  assert.equal(h.frames.size, 0); assert.equal(angle(needle), 90);
  h.motion.springAngle(needle, 180); assert.equal(angle(needle), 180); assert.equal(h.frames.size, 0);
  h.toggle(false); h.motion.springAngle(needle, 200); h.settle(); assert.ok(Math.abs(angle(needle) - 200) < .1);
});
test('countdown survives repeated reduced-motion toggles without stale detached cells', () => {
  const h = setup(), cd = h.element();
  h.motion.setCountdown(cd, '01:00:00'); h.motion.setCountdown(cd, '00:59:59');
  h.toggle(true); assert.equal(cd.textContent, '00:59:59'); assert.equal(cd.children.length, 0);
  h.motion.setCountdown(cd, '00:59:58'); h.toggle(false); h.motion.setCountdown(cd, '00:59:57');
  assert.equal(cd.textContent, '00:59:57'); assert.equal(cd.children.length, 8);
  h.toggle(true); h.toggle(false); h.motion.setCountdown(cd, '00:59:56'); assert.equal(cd.textContent, '00:59:56');
});
test('countdown starts reduced, rebuilds after format or external DOM changes, and clears safely', () => {
  const h = setup(true), cd = h.element(); h.motion.setCountdown(cd, '00:01:00');
  h.toggle(false); h.motion.setCountdown(cd, '00:00:59'); assert.equal(cd.children.length, 8);
  h.motion.setCountdown(cd, '100:00:00'); assert.equal(cd.textContent, '100:00:00');
  cd.textContent = 'loading'; h.motion.setCountdown(cd, '99:59:59'); assert.equal(cd.textContent, '99:59:59');
  h.motion.clearCountdown(cd); assert.equal(cd.textContent, '--:--:--');
  h.motion.setCountdown(cd, '00:00:01'); assert.equal(cd.textContent, '00:00:01');
});
test('digit cells fit a whole tabular digit and cannot flex-shrink', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles/motion.css'), 'utf8');
  assert.match(css, /\.cd-face \.cell\.font\{width:1ch;/);
  assert.match(css, /\.cd-face \.cell\{[^}]*flex:none/);
});
test('reduced-motion CSS removes transitions instead of leaving residual fades', () => {
  const css = fs.readFileSync(path.join(__dirname, '../styles/app.css'), 'utf8');
  const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(block, 'reduced-motion media query exists');
  assert.match(block[1], /transition-property:none\s*!important/);
  assert.match(block[1], /transition-duration:0s\s*!important/);
  assert.doesNotMatch(block[1], /transition-duration:\.15s/);
});
console.log(`${tests} motion regression tests passed.`);
