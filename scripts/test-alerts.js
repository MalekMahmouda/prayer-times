'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Engine = require('../shared/pt-engine');
const adhan = require('adhan');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('PASS ' + label); }
const BASE = { lat: 24.7136, lon: 46.6753, tz: 'Asia/Riyadh', method: '4', madhab: 'shafi', offsets: {}, notif: true, adhanEnabled: true, adhanPerPrayer: {}, preMin: {}, notifMin: 10, beep: true, lang: 'en' };
const NOW = Date.parse('2026-10-22T08:00:00Z');
const day = Engine.computeDayInstant(BASE, 2026, 10, 22, adhan);
function harness(source, { now = NOW, native = false, storage = new Map(), permission = 'granted', worker = true, notificationFails = false } = {}) {
  let clock = now;
  const timers = new Map(); let nextTimer = 0;
  const state = { audio: [], beep: 0, shown: [], requests: 0, errors: [], listeners: {} };
  class Clock extends Date { constructor(...a) { super(...(a.length ? a : [clock])); } static now() { return clock; } }
  const context = {
    Date: Clock, console,
    PT_ENGINE: Engine, __ptAdhan: adhan,
    isSecureContext: true,
    Capacitor: { isNativePlatform: () => native },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)) },
    setInterval: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    setTimeout: (fn) => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: (id) => timers.delete(id), clearInterval: (id) => timers.delete(id),
    addEventListener: (name, fn) => { state.listeners[name] = fn; },
    document: { hidden: false, addEventListener() {} },
    navigator: { serviceWorker: worker ? { getRegistration: async () => ({ showNotification: async (title, opts) => { state.shown.push({ title, ...opts }); } }) } : undefined },
  };
  context.window = context;
  context.Notification = class {
    static permission = permission;
    static async requestPermission() { state.requests++; return permission; }
    constructor(title, opts) { if (notificationFails) throw new Error('not supported'); state.shown.push({ title, ...opts }); }
  };
  vm.createContext(context); vm.runInContext(source, context);
  const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
  return { context, state, storage, timers, flush,
    now(value) { clock = value; },
    async runTimers() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn()); await flush(); },
  };
}
function web(opts) {
  const h = harness(read('js/web-alerts.js'), opts);
  h.configure = (cfg = BASE) => h.context.PTWebAlerts.configure(cfg, {
    onAdhan: (p) => h.state.audio.push(p), onBeep: () => h.state.beep++, onError: (kind) => h.state.errors.push(kind),
  });
  h.tick = async (now) => { h.now(now); await h.context.PTWebAlerts.tick(now); await h.flush(); };
  return h;
}
function mobile({ denied = false, exact = 'granted', failBatch = 0 } = {}) {
  const calls = { schedule: [], cancel: [], channels: [], requested: 0, batches: 0 };
  const plugin = {
    checkPermissions: async () => ({ display: denied ? 'denied' : 'granted' }),
    requestPermissions: async () => { calls.requested++; return { display: denied ? 'denied' : 'granted' }; },
    checkExactNotificationSetting: async () => ({ exact_alarm: exact }),
    changeExactNotificationSetting: async () => ({ exact_alarm: 'granted' }),
    createChannel: async (c) => calls.channels.push(c),
    cancel: async ({ notifications }) => calls.cancel.push(...notifications),
    schedule: async ({ notifications }) => { calls.batches++; if (calls.batches === failBatch) throw new Error('simulated native batch failure'); calls.schedule.push(...notifications); },
  };
  const source = read('www-build/mobile-scheduler.js').replace(/^import .*;\r?\n/gm, '');
  const h = harness('', { native: true }); h.context.LocalNotifications = plugin;
  vm.runInContext(source, h.context);
  h.calls = calls; h.api = h.context.ptMobile;
  h.configure = async (cfg = BASE) => { h.api.setConfig(cfg); await h.runTimers(); };
  return h;
}
(async () => {
  const preAt = day.instants.Dhuhr - 10 * 60000;
  let h = web({ now: preAt - 1000 }); h.configure();
  ok(h.state.requests === 0, 'startup never prompts for browser permission');
  await h.tick(preAt);
  ok(h.state.shown.length === 1 && /10 minutes/.test(h.state.shown[0].body), 'pre-alert fires at the shared absolute instant');
  ok(h.state.audio.length === 0, 'pre-alert never plays the adhan');
  await h.tick(preAt + 1000); ok(h.state.shown.length === 1, 'repeated ticks do not duplicate a pre-alert');
  await h.tick(day.instants.Dhuhr);
  ok(h.state.audio.join() === 'Dhuhr' && h.state.shown.length === 2, 'prayer notification and adhan fire independently at prayer time');
  const nextTab = web({ now: day.instants.Dhuhr - 1000, storage: h.storage }); nextTab.configure(); await nextTab.tick(day.instants.Dhuhr);
  ok(nextTab.state.audio.length === 0 && nextTab.state.shown.length === 0, 'persisted claims prevent replay across reloads/tabs');
  h = web({ now: day.instants.Asr - 1000 }); h.configure({ ...BASE, notif: false }); await h.tick(day.instants.Asr);
  ok(h.state.audio.length === 1 && h.state.shown.length === 0, 'adhan works with reminder notifications switched off');
  h = web({ now: day.instants.Asr - 1000 }); h.configure({ ...BASE, adhanPerPrayer: { Asr: false }, beep: false }); await h.tick(day.instants.Asr);
  ok(h.state.audio.length === 0 && h.state.beep === 0 && h.state.shown.length === 1, 'per-prayer mute preserves a silent notification');
  h = web({ now: day.instants.Asr - 1000 }); h.configure({ ...BASE, adhanEnabled: false, notifMin: 0 }); await h.tick(day.instants.Asr);
  ok(h.state.shown.length === 1 && h.state.audio.length === 0, 'zero-minute alert is not doubled and respects adhan off');
  h = web({ now: day.instants.Asr - 1000, permission: 'denied' }); h.configure(); await h.tick(day.instants.Asr);
  ok(h.state.shown.length === 0 && h.state.audio.length === 1 && h.state.requests === 0, 'denied notifications do not suppress independently enabled audio');
  h = web({ now: day.instants.Asr - 1000 }); h.configure(); await h.tick(day.instants.Asr + 3600000);
  ok(h.state.audio.length === 0, 'resume never bursts hours-old adhans');
  h = web({ now: day.instants.Asr - 1000, native: true }); h.configure(); await h.tick(day.instants.Asr);
  ok(h.state.shown.length === 0 && h.timers.size === 0, 'browser scheduler never duplicates native Android alarms');
  h = web({ worker: false, notificationFails: true }); h.configure();
  ok(await h.context.PTWebAlerts.notify('Test', 'body', 'tag') === false && h.state.errors.length === 1, 'unsupported constructor failure is handled without an uncaught error');
  h = web({ permission: 'default' }); h.configure(); await h.context.PTWebAlerts.requestPermission();
  ok(h.state.requests === 1, 'permission is requested only through the explicit gesture API');
  h.context.isSecureContext = false; ok(h.context.PTWebAlerts.permission() === 'insecure', 'HTTP capability is reported honestly');
  const shifted = { ...BASE, offsets: { Asr: 7 }, tz: 'Asia/Riyadh' };
  const shiftedAt = Engine.computeDayInstant(shifted, 2026, 10, 22, adhan).instants.Asr;
  h = web({ now: shiftedAt - 1000 }); h.configure(shifted); await h.tick(shiftedAt);
  ok(h.state.audio.join() === 'Asr', 'location timezone and prayer offsets are applied exactly once');
  h = web({ now: day.instants.Asr - 1000 }); h.configure({ ...BASE, lang: 'ar' }); await h.tick(day.instants.Asr);
  ok(h.state.shown[0].body.includes('العصر'), 'Arabic notification uses the Arabic prayer name');
  h = web({ now: day.instants.Asr - 1000 }); h.configure({ ...BASE, notif: false, adhanEnabled: false }); await h.tick(day.instants.Asr);
  ok(h.state.audio.length === 0 && h.state.shown.length === 0, 'both switches off is genuinely silent');
  let m = mobile(); await m.configure();
  ok(m.calls.schedule.length > 60 && m.calls.schedule.length <= 150, 'native Android schedules the capped two-week horizon');
  ok(m.calls.requested === 0, 'background native reschedule never prompts for permission');
  ok((await m.api.notifStatus()).exact === true, 'exact_alarm granted is read from the real Capacitor field');
  ok(m.calls.channels.every((c) => typeof c.visibility === 'number'), 'native channel visibility uses the required numeric type');
  const silent = m.calls.channels.find((c) => c.id === 'prayer-silent');
  ok(silent.importance === 2 && silent.vibration === false, 'silent channel is low-importance and non-vibrating');
  m = mobile({ exact: 'denied' }); await m.configure();
  ok((await m.api.notifStatus()).exact === false, 'denied exact alarm remains false rather than unknown');
  ok(await m.api.requestExactAlarms() === true, 'exact alarm settings request reads the returned permission state');
  m = mobile(); await m.configure({ ...BASE, notif: false, adhanPerPrayer: { Asr: false } });
  ok(m.calls.schedule.length > 0 && m.calls.schedule.every((n) => n.extra.kind === 'adhan' && n.extra.playAdhan && n.extra.prayer !== 'Asr'), 'native adhan is independent of reminders and honors per-prayer mute');
  m = mobile(); await m.configure({ ...BASE, adhanPerPrayer: { Asr: false } });
  ok(m.calls.schedule.filter((n) => n.extra.kind === 'adhan' && n.extra.prayer === 'Asr').every((n) => n.channelId === 'prayer-silent' && !n.extra.playAdhan), 'muted native prayers cannot present a playing-adhan screen');
  m = mobile(); await m.configure({ ...BASE, beep: false, adhanEnabled: false });
  ok(m.calls.schedule.every((n) => n.channelId === 'prayer-silent'), 'native beep off selects the silent channel');
  m = mobile({ denied: true }); await m.configure();
  ok(m.calls.schedule.length === 0 && m.calls.requested === 0, 'denied Android permission creates no hidden prompt or schedule');
  ok(await m.api.requestPermissions() === false && m.calls.requested === 1, 'explicit native permission request reports denial');
  m = mobile(); await m.configure(); const old = m.calls.schedule.length;
  await m.configure({ ...BASE, notif: false, adhanEnabled: false });
  ok(m.calls.cancel.length === old && JSON.parse(m.storage.get('ptm-notif-ids')).length === 0, 'switching both off cancels all and only tracked native alarms');
  m = mobile(); await m.configure(); await m.api.testNotification();
  const test = m.calls.schedule.at(-1);
  ok(test.extra.kind === 'test' && test.schedule.at.getTime() === NOW + 3000, 'native test button schedules an actual native notification in three seconds');
  m = mobile({ failBatch: 2 }); await m.configure();
  ok(JSON.parse(m.storage.get('ptm-notif-ids')).length >= 80, 'partial native scheduling failure keeps cancellable IDs for successful and attempted batches');
  await m.configure({ ...BASE, notif: false, adhanEnabled: false });
  ok(m.calls.cancel.length >= 80, 'partial native schedule is cleaned up on disable');
  // Integration: execute the real renderer config functions without a desktop bridge.
  const app = read('js/app.js');
  const push = app.slice(app.indexOf('function pushCfg()'), app.indexOf('/* ═══ TIMEZONE RESOLUTION'));
  const adapters = app.slice(app.indexOf('function pushMobile()'), app.indexOf('/* ═══ ANDROID:'));
  const received = { mobile: [], web: [] };
  const window = { addEventListener() {}, ptMobile: { setConfig: (c) => received.mobile.push(c) }, PTWebAlerts: { configure: (c) => received.web.push(c) } };
  new Function('window', 'S', 'PT', 'IS_DESKTOP', 'resolveTz', 'showAzanScreen', 'playAdhanBrowser', 'beep', 'showToast', push + adapters + ';pushCfg();')(
    window, { lat: BASE.lat, lon: BASE.lon, lang: 'en', cfg: { ...BASE, adhan: true } }, null, false, () => BASE.tz, () => {}, () => {}, () => {}, () => {});
  ok(received.mobile.length === 1 && received.web.length === 1 && received.mobile[0].adhanEnabled, 'non-Electron config changes reach BOTH mobile and web schedulers');
  ok(read('scripts/build-web.js').includes("'js/web-alerts.js'") && read('scripts/build-www.js').includes("'web-alerts.js'"), 'web/mobile builds include the browser scheduler asset');
  if (fs.existsSync(path.join(ROOT, 'dist-web/sw.js'))) {
    const sw = read('dist-web/sw.js');
    ok(sw.includes('adhans/default.mp3') && sw.includes('adhans/nafees.mp3') && sw.includes('notificationclick'), 'built service worker caches adhan recordings and handles notification taps');
    new vm.Script(sw); ok(true, 'generated service worker parses successfully');
  }
  // Playback integration: verify the actual renderer source/volume selection.
  let current = { ...BASE, adhanType: 'alafasy', adhanVol: 0.6, adhanProfiles: {} };
  const audio = { src: '', volume: 1, currentTime: 20, play: () => Promise.resolve() };
  const status = { textContent: '' }; const toasts = [];
  const audioSource = app.slice(app.indexOf('function browserAdhanSource'), app.indexOf('/* ═══ FULL-SCREEN AZAN SCREEN'));
  const player = new Function('S', 'ADHAN_SOUNDS', '$', 'showToast', 't', audioSource + ';return { playAdhanBrowser, browserAdhanSource };')(
    { cfg: current, lang: 'en' }, { alafasy: '', nafees: '', classic: '' }, (id) => id === 'adhanAudio' ? audio : status, (msg) => toasts.push(msg), (key) => key);
  player.playAdhanBrowser('Dhuhr');
  ok(audio.src === './adhans/default.mp3' && audio.volume === 0.6 && audio.currentTime === 0, 'playback uses the bundled default recording and configured volume');
  current.adhanType = 'nafees'; player.playAdhanBrowser('Dhuhr');
  ok(audio.src === './adhans/nafees.mp3', 'changing reciter actually replaces the previous playback source');
  current.adhanProfiles.Asr = { reciter: 'classic', vol: 2 }; player.playAdhanBrowser('Asr');
  ok(audio.src === './adhans/classic.mp3' && audio.volume === 1, 'per-prayer playback profile overrides global settings and clamps volume');
  current.adhanType = '../bad'; player.playAdhanBrowser('Dhuhr');
  ok(audio.src === './adhans/default.mp3', 'invalid reciter cannot escape the bundled audio directory');
  audio.play = () => Promise.reject({ name: 'NotAllowedError' }); player.playAdhanBrowser('Dhuhr'); await new Promise(setImmediate);
  ok(status.textContent.includes('Audio blocked') && toasts.length === 1, 'autoplay rejection displays actionable status instead of claiming sound is playing');
  audio.play = () => Promise.reject({ name: 'NotSupportedError' }); player.playAdhanBrowser('Dhuhr'); await new Promise(setImmediate);
  ok(status.textContent === 'toast.adhanFail', 'missing or unsupported media is not mislabeled as a permission denial');
  if (fs.existsSync(path.join(ROOT, 'dist-web/sw.js'))) {
    const handlers = {}; let shell;
    vm.runInNewContext(read('dist-web/sw.js') + ';globalThis.shellCopy = SHELL;', { self: { addEventListener: (type, cb) => { handlers[type] = cb; } }, globalThis: { set shellCopy(value) { shell = value; } } });
    ok(shell.every((file) => fs.existsSync(path.join(ROOT, 'dist-web', file))), 'every precached shell and audio asset exists in the local web build');
    for (const file of ['js/web-alerts.js', 'js/app.js', 'js/pages.js']) assert.equal(read('dist-web/' + file), read(file));
    ok(true, 'built alert and renderer assets exactly match the tested source files');
  }
  console.log(`${checks} alert regression checks passed.`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
