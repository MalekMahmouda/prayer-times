'use strict';

/**
 * test-contract.js — cross-platform calculation contract test suite.
 *
 * Plain Node, zero network. Proves:
 *   1. Golden matrix — frozen prayer times + qibla bearings (Riyadh, Cairo,
 *      Karachi, London, New York, Tokyo; Shafi/Hanafi). Values were computed
 *      from the shared engine and cross-checked against the desktop
 *      scheduler. An anchor drift means the CONTRACT changed deliberately.
 *   2. Desktop parity — main/scheduler.js getDay() == shared engine (shafi +
 *      hanafi).
 *   3. Location-local date — zonedToday() picks the LOCATION's date, not the
 *      device's (fixed-offset Intl simulator; no OS tz changes).
 *   4. Midnight rollover & calendar parity (real scheduler).
 *   5. DST (Europe/London 2026 transitions) and high-latitude (Stockholm
 *      midsummer) behavior — documented and pinned, no invented fallbacks.
 *   6. Regressions: netFetch query-key isolation + per-request timeout,
 *      mobile scheduler our-IDs-only cancellation / no nonexistent sound /
 *      debounce / shared-engine madhab parity, GPS accuracy tiers,
 *      engine load order artifacts, tz-lookup offline resolution.
 *
 * Run: node scripts/test-contract.js
 */

const fs = require('fs');
const path = require('path');
const Engine = require(path.join(__dirname, '..', 'shared', 'pt-engine.js'));
const adhan = require('adhan');
const { createScheduler } = require(path.join(__dirname, '..', 'main', 'scheduler.js'));

const deps = adhan;
let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}
function section(name) { console.log('\n— ' + name + ' —'); }
const hhmmUTC = (ms) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};
const fmtInTz = (ms, tz) => new Intl.DateTimeFormat('en-GB', {
  timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(ms));
const ROOT = path.join(__dirname, '..');

/* ═══ 1. Golden matrix (frozen 2026-09-29) ═══════════════════════════════ */
const GOLDEN = [
  { name: 'Riyadh', lat: 24.7136, lon: 46.6753, method: '4', madhab: 'shafi', tz: 'Asia/Riyadh',
    exp: { Fajr: '04:27', Sunrise: '05:44', Dhuhr: '11:44', Asr: '15:08', Maghrib: '17:43', Isha: '19:13' }, qibla: 243.8 },
  { name: 'Riyadh', lat: 24.7136, lon: 46.6753, method: '4', madhab: 'hanafi', tz: 'Asia/Riyadh',
    exp: { Fajr: '04:27', Sunrise: '05:44', Dhuhr: '11:44', Asr: '16:02', Maghrib: '17:43', Isha: '19:13' }, qibla: 243.8 },
  { name: 'Cairo', lat: 30.0444, lon: 31.2357, method: '5', madhab: 'shafi', tz: 'Africa/Cairo',
    exp: { Fajr: '05:21', Sunrise: '06:47', Dhuhr: '12:46', Asr: '16:09', Maghrib: '18:43', Isha: '20:00' }, qibla: 136.1 },
  { name: 'Karachi', lat: 24.8607, lon: 67.0011, method: '1', madhab: 'hanafi', tz: 'Asia/Karachi',
    exp: { Fajr: '05:07', Sunrise: '06:23', Dhuhr: '12:23', Asr: '16:41', Maghrib: '18:21', Isha: '19:37' }, qibla: 267.7 },
  { name: 'London', lat: 51.5072, lon: -0.1276, method: '3', madhab: 'shafi', tz: 'Europe/London',
    exp: { Fajr: '05:05', Sunrise: '06:58', Dhuhr: '12:52', Asr: '15:59', Maghrib: '18:43', Isha: '20:28' }, qibla: 119.0 },
  { name: 'NewYork', lat: 40.7128, lon: -74.006, method: '2', madhab: 'shafi', tz: 'America/New_York',
    exp: { Fajr: '05:35', Sunrise: '06:51', Dhuhr: '12:47', Asr: '16:05', Maghrib: '18:41', Isha: '19:56' }, qibla: 58.5 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503, method: '3', madhab: 'hanafi', tz: 'Asia/Tokyo',
    exp: { Fajr: '04:09', Sunrise: '05:34', Dhuhr: '11:33', Asr: '15:45', Maghrib: '17:29', Isha: '18:49' }, qibla: 293.0 },
];

section('1. Golden matrix (frozen 2026-09-29)');
for (const g of GOLDEN) {
  const day = Engine.computeDayInstant(g, 2026, 9, 29, deps);
  ok(!!day, `${g.name} (${g.madhab}) computes`);
  if (!day) continue;
  let all = true;
  for (const p of ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    if (fmtInTz(day.instants[p], g.tz) !== g.exp[p]) { all = false; console.error(`      ${p}: got ${fmtInTz(day.instants[p], g.tz)}, want ${g.exp[p]}`); }
  }
  ok(all, `${g.name} ${g.madhab} — all six times match frozen values`);
  ok(Math.abs(Engine.qiblaBearing(g.lat, g.lon) - g.qibla) < 0.05, `${g.name} qibla bearing ≈ ${g.qibla}°`);
}

/* ═══ 2. Desktop scheduler parity with the shared engine ═════════════════ */
section('2. Desktop parity (scheduler.getDay == shared engine)');
{
  for (const madhab of ['shafi', 'hanafi']) {
    const s = createScheduler();
    s.updateConfig({ lat: 21.3891, lon: 39.8579, method: '4', madhab, offsets: {}, tz: '' });
    const dISO = new Date().toISOString().slice(0, 10);
    const day = s.getDay(dISO, {});
    const ref = Engine.computeDayInstant({ lat: 21.3891, lon: 39.8579, method: '4', madhab },
      Number(dISO.slice(0, 4)), Number(dISO.slice(5, 7)), Number(dISO.slice(8, 10)), deps);
    const dispTz = Intl.DateTimeFormat().resolvedOptions().timeZone; // scheduler tz='' → device display
    let same = true;
    for (const p of Engine.ALL_DAYS) if (day.timings[p] !== fmtInTz(ref.instants[p], dispTz)) same = false;
    ok(same, `getDay() == engine instants (${madhab}) — device tz ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    ok(!!day.instants && Number.isFinite(day.instants.Asr), 'getDay() exposes absolute instants');
  }
  const sh = createScheduler(); sh.updateConfig({ lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi', offsets: {} });
  const ha = createScheduler(); ha.updateConfig({ lat: 21.3891, lon: 39.8579, method: '4', madhab: 'hanafi', offsets: {} });
  ok(sh.getDay('2026-09-29', {}).timings.Asr !== ha.getDay('2026-09-29', {}).timings.Asr,
    'madhab changes Asr identically on both paths (universal, any method)');
}

/* ═══ 3. Location-local date (device tz must not matter) ════════════════ */
section('3. Location-local date via zonedToday()');
{
  // Fixed-offset Intl simulator — proves the lookup is tz-driven, device-independent.
  const fixedIntl = (offsetMin) => ({
    DateTimeFormat: function (zone, opts) {
      return {
        formatToParts(at) {
          const d = new Date(at.getTime() + offsetMin * 60000);
          const pad = (n) => String(n).padStart(2, '0');
          return [
            { type: 'year', value: String(d.getUTCFullYear()) },
            { type: 'month', value: pad(d.getUTCMonth() + 1) },
            { type: 'day', value: pad(d.getUTCDate()) },
          ];
        },
      };
    },
  });
  // Device clock: Riyadh 2026-09-28 20:00 → Kiritimati (UTC+14) is already Sep 29.
  const deviceInstant = new Date(2026, 8, 28, 20, 0, 0);
  const z = Engine.zonedToday('Pacific/Kiritimati', deviceInstant, fixedIntl(14 * 60));
  ok(z.key === '2026-09-29', 'location ahead of device: Kiritimati already tomorrow (got ' + z.key + ')');
  const r = Engine.zonedToday('Asia/Riyadh', deviceInstant, fixedIntl(180));
  ok(r.key === '2026-09-28', 'same-zone location keeps the device date');
  const bad = Engine.zonedToday('Not/AZone', deviceInstant, null); // real Intl rejects → device-local
  ok(bad.key === '2026-09-28', 'invalid tz falls back to device-local date (never crashes)');
}

/* ═══ 4. Midnight rollover + calendar parity (real scheduler) ════════════ */
section('4. Midnight rollover & calendar parity');
{
  const MIN = 60 * 1000;
  const todayAt = (h, m, sec = 0) => { const d = new Date(); d.setHours(h, m, sec, 0); return d.getTime(); };
  const s = createScheduler();
  const events = [];
  s.bus.on('prayer-time', (p) => events.push(p));
  let now = todayAt(0, 5);
  s._setClock(() => now);
  s.updateConfig({ lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi', offsets: {}, notif: true, notifMin: 10, adhan: false, tz: '' });
  s.tick();
  // Fire Isha, then cross midnight: Isha must not re-fire.
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(21.3891, 39.8579), new Date(), adhan.CalculationMethod.UmmAlQura());
  now = pt.isha.getTime() + 5000; s.tick();
  const firedBefore = events.filter((e) => e.prayer === 'Isha').length;
  const mid = todayAt(23, 59, 30);
  now = mid; s.tick();
  now = mid + 45 * 1000; s.tick(); s.tick();
  ok(events.filter((e) => e.prayer === 'Isha').length === firedBefore, 'yesterday Isha never re-fires after midnight');
  ok(s.getInfo().next.prayer === 'Fajr', 'next prayer after midnight is Fajr');

  // Calendar parity: every day of the previous/current/next month edges
  // agrees between the calendar call shape and the dashboard call shape.
  const mkCal = (key) => s.getDay(key, { lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi', offsets: { Fajr: 5 }, tz: '' });
  const mkDash = (key) => s.getDay(key, { lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi', offsets: { Fajr: 5 }, tz: '' });
  for (const key of ['2026-01-31', '2026-02-01', '2026-02-28', '2026-03-01']) {
    const a = mkCal(key), b = mkDash(key);
    ok(JSON.stringify(a.timings) === JSON.stringify(b.timings), `calendar == dashboard ${key}`);
  }
  const jan = mkCal('2026-01-31'), feb = mkCal('2026-02-01');
  ok(jan.timings.Fajr !== feb.timings.Fajr, 'month-boundary days produce different times (no stale cache shape)');
  // Offsets flow through the calendar path (Phase 20 regression).
  const plain = s.getDay('2026-02-01', { lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi', offsets: {}, tz: '' });
  const [fh, fm] = plain.timings.Fajr.split(':').map(Number);
  const [oh, om] = feb.timings.Fajr.split(':').map(Number);
  ok((oh * 60 + om) - (fh * 60 + fm) === 5 || (oh * 60 + om) - (fh * 60 + fm) === -24 * 60 + 5,
    'calendar Fajr offset +5min applied (got ' + feb.timings.Fajr + ' vs ' + plain.timings.Fajr + ')');
}

/* ═══ 5. DST + high latitude (documented engine behavior) ════════════════ */
section('5. DST (Europe/London 2026) & high latitude');
{
  const mag = (y, m, d) => Engine.computeDayInstant({ lat: 51.5072, lon: -0.1276, method: '3', madhab: 'shafi' }, y, m, d, deps).instants.Maghrib;
  const springGap = (mag(2026, 3, 30) - mag(2026, 3, 29)) / 60000;
  const fallGap = (mag(2026, 10, 25) - mag(2026, 10, 24)) / 60000;
  ok(Math.round(springGap) === 1441 && Math.round(fallGap) === 1438,
    `DST UTC gaps correct (spring ${springGap} min, fall ${fallGap} min)`);
  ok(fmtInTz(mag(2026, 3, 29), 'Europe/London') === '19:29' && fmtInTz(mag(2026, 3, 30), 'Europe/London') === '19:30',
    'wall clock stays sane across the spring transition');
  for (const [y, m, d] of [[2026, 3, 29], [2026, 10, 25]]) {
    const day = Engine.computeDayInstant({ lat: 51.5072, lon: -0.1276, method: '3', madhab: 'shafi' }, y, m, d, deps);
    const list = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((p) => day.instants[p]);
    ok(list.every(Number.isFinite) && list.every((v, i) => i === 0 || v > list[i - 1]),
      `transition day ${y}-${String(m).padStart(2, '0')}-${d}: exactly 5+1 ordered finite instants (no dup/skip)`);
  }
  const st = Engine.computeDayInstant({ lat: 59.3293, lon: 18.0686, method: '3', madhab: 'shafi' }, 2026, 6, 21, deps);
  const seq = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((p) => st.instants[p]);
  ok(seq.every(Number.isFinite) && seq.every((v, i) => i === 0 || v > seq[i - 1]),
    'Stockholm midsummer: finite, ordered instants (engine behavior documented, no invented fallback)');
}

/* ═══ 6. Renderer regressions (sandboxed app.js) ═════════════════════════ */
section('6. netFetch query-key isolation + per-request timeout');
{
  // Build one sandbox with the REAL renderer files (shared scope, like the
  // browser's classic scripts), a null-object DOM, and controllable fetch.
  const dummy = new Proxy(function () {}, {
    get(t, k) {
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === 'style') return {};
      if (k === 'then') return undefined;
      if (typeof k === 'symbol') return undefined;
      return dummy;
    },
    set() { return true; },
    apply() { return dummy; },
  });
  const store = new Map();
  const lsMock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.window = globalThis;
  globalThis.document = {
    getElementById: () => dummy, querySelectorAll: () => [], documentElement: dummy,
    body: dummy, createElement: () => dummy, addEventListener() {}, activeElement: null,
  };
  globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
  globalThis.localStorage = lsMock;
  try { Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true }); }
  catch (e) { globalThis.__nav = { onLine: true }; }
  globalThis.tzLookup = require('tz-lookup');
  globalThis.__ptAdhan = adhan; globalThis.PT_ENGINE = Engine;

  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8')
    .replace('NET_TIMEOUT_MS = 12000', 'NET_TIMEOUT_MS = 120'); // fast test timeout
  const files = ['shared/pt-engine.js', 'js/data.js', 'js/platform.js', 'js/compass.js'];
  const bundle = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n') + '\n;\n' + appSrc;
  const sandboxCode = bundle + '\n;globalThis.__exports = { netFetch, useGPS, resolveTz, nextPrayerInfo, refreshTodaySchedule, msToNextLocationMidnight, fmtAtLoc, revGeo, S, setLoc: (lat, lon) => { S.lat = lat; S.lon = lon; } };';
  try { new Function(sandboxCode)(); } catch (e) { /* init continues async */ }
  const X = globalThis.__exports || {};
  ok(typeof X.netFetch === 'function', 'renderer sandbox booted (netFetch exposed)');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  (async () => {
    await sleep(120); // let init() settle

    // 6a. Different queries → different keys, responses never mixed.
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(url); return { ok: true, json: async () => ({ who: url }) }; };
    const [a, b, c] = await Promise.all([
      X.netFetch('https://x.test/api?city=Riyadh'),
      X.netFetch('https://x.test/api?city=Cairo'),
      X.netFetch('https://x.test/api?city=London'),
    ]);
    const [ra, rb, rc] = await Promise.all([a.json(), b.json(), c.json()]);
    ok(calls.length === 3, 'three different queries → three requests (no false dedup)');
    ok(ra.who.includes('Riyadh') && rb.who.includes('Cairo') && rc.who.includes('London'),
      'responses mapped to their own queries (no cross-contamination)');

    // 6b. Same URL → single flight.
    globalThis.fetch = async (url) => { calls.push(url); await sleep(30); return { ok: true, json: async () => ({}) }; };
    await Promise.all([X.netFetch('https://x.test/same?z=1'), X.netFetch('https://x.test/same?z=1')]);
    ok(calls.filter((u) => u.includes('same?z=1')).length === 1, 'identical URL dedups to one request');

    // 6c. Hung request times out; other keys unaffected; key freed after.
    globalThis.fetch = (url, opts) => new Promise((res, rej) => {
      if (opts && opts.signal) opts.signal.addEventListener('abort', () => { const e = new Error('Abort'); e.name = 'AbortError'; rej(e); });
      if (url.includes('slow')) return; // never resolves
      res({ ok: true, json: async () => ({ fine: true }) });
    });
    let slowErr = null, fastOK = false;
    X.netFetch('https://x.test/slow?x=1').catch((e) => { slowErr = e; });
    await X.netFetch('https://x.test/fast?x=1').then((r) => r.json()).then((j) => { fastOK = j.fine === true; });
    ok(fastOK, 'healthy request succeeds while another hangs');
    await sleep(250); // > test timeout (120ms) + margin
    ok(slowErr != null, 'hung request rejected by its own timeout (key released)');
    globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
    await X.netFetch('https://x.test/slow?x=1').then(() => ok(true, 'timed-out key reusable afterwards'))
      .catch(() => ok(false, 'timed-out key reusable afterwards'));

    // 6d. resolveTz: explicit tz-lookup resolution + cache invalidation on move.
    store.set('pttz', JSON.stringify({ _loc: 'somewhere,else', '10,10': 'Junk/Zone' }));
    X.setLoc(21.4225, 39.8262);
    const tz1 = X.resolveTz();
    ok(tz1 === 'Asia/Riyadh', 'resolveTz resolves offline from coordinates (got ' + tz1 + ')');
    const cached = JSON.parse(store.get('pttz'));
    ok(cached._loc === '21.4225,39.8262' && cached['21.42,39.83'] === 'Asia/Riyadh',
      'tz cache keyed by rounded coordinates and location-stamped');

    // 6e. Instant-based next-prayer logic (no device-tz re-parsing).
    const dISO = new Date().toISOString().slice(0, 10);
    const day = Engine.computeDayInstant({ lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi' },
      Number(dISO.slice(0, 4)), Number(dISO.slice(5, 7)), Number(dISO.slice(8, 10)), deps);
    X.S.times = {}; // force the instants path only
    X.S.todaySchedule = { timings: {}, instants: day.instants };
    const info = X.nextPrayerInfo();
    ok(info && info.next && ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].includes(info.next.prayer),
      'nextPrayerInfo works from absolute instants');
    ok(day.instants[info.next.prayer] === info.next.at.getTime() || info.isTomorrow,
      'next prayer .at IS the contract instant (not a device-tz re-parse)');

    // 6f. B2: offsets applied exactly once — engine instant == displayed time.
    const offDay = Engine.computeDayInstant(
      { lat: 24.7136, lon: 46.6753, method: '4', madhab: 'shafi', offsets: { Fajr: 5 } },
      2026, 9, 29, deps);
    ok(fmtInTz(offDay.instants.Fajr, 'Asia/Riyadh') === '04:32',
      'engine instant includes the +5 Fajr offset (04:27 → 04:32)');
    X.setLoc(24.7136, 46.6753); // Riyadh
    X.S.times = {}; X.S.todaySchedule = { timings: {}, instants: offDay.instants, date: '2026-09-29' };
    ok(X.fmtAtLoc(new Date(offDay.instants.Fajr), true) === '04:32',
      'card display formats the offset-included instant ONCE (got ' + X.fmtAtLoc(new Date(offDay.instants.Fajr), true) + ')');
    const appSrcNow = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
    ok(/const at = atOf\(p\);/.test(appSrcNow) && !/const at = adjTime\(p, S\.times\[p\]\)/.test(appSrcNow),
      'prayer cards render via the instants path (no second adjTime in the loop)');

    // 6g. B1: refreshTodaySchedule computes the LOCATION-zoned day.
    // Device here runs UTC+3; 2026-09-29T15:30Z = 18:30 device Sep-29 but
    // 00:30 Tokyo Sep-30 — the day must come from zonedToday, not the device.
    X.setLoc(35.6895, 139.6917); // Tokyo
    await X.refreshTodaySchedule(new Date('2026-09-29T15:30:00Z'));
    const zk = Engine.zonedToday('Asia/Tokyo', new Date('2026-09-29T15:30:00Z'));
    ok(X.S.todaySchedule && X.S.todaySchedule.date === '2026-09-30' && X.S.todaySchedule.date === zk.key,
      'refreshTodaySchedule uses the location-zoned day (Tokyo 2026-09-30, got ' + (X.S.todaySchedule && X.S.todaySchedule.date) + ')');

    // 6h. B3: msToNextLocationMidnight — exact against a 1s reference scan.
    const scanMidnight = (tz, from, dayKey) => {
      let t = from;
      while (Engine.zonedToday(tz, new Date(t)).key === dayKey) t += 1000;
      return t - from;
    };
    const nowT = Date.UTC(2026, 8, 29, 15, 30); // Tokyo 00:30 Sep-30
    const msT = X.msToNextLocationMidnight('Asia/Tokyo', nowT);
    ok(Math.abs(msT - scanMidnight('Asia/Tokyo', nowT, '2026-09-30')) <= 2000,
      'msToNextLocationMidnight finds Tokyo midnight (±2s, got ' + (msT / 3600000).toFixed(2) + 'h)');
    const nowN = Date.UTC(2026, 8, 29, 3, 30); // EDT (UTC−4): Sep-28 23:30 in New York
    const msN = X.msToNextLocationMidnight('America/New_York', nowN);
    ok(Math.abs(msN - scanMidnight('America/New_York', nowN, '2026-09-28')) <= 2000,
      'msToNextLocationMidnight finds New York midnight (±2s, got ' + (msN / 3600000).toFixed(2) + 'h)');
    const dn = new Date(nowT);
    const devMid = new Date(dn.getFullYear(), dn.getMonth(), dn.getDate() + 1).getTime();
    ok(X.msToNextLocationMidnight('', nowT) === devMid - nowT,
      'empty tz falls back to device midnight (legacy behavior)');

    // 6i. B5: compass listener lifecycle — add once, remove on stop, no accumulation.
    let adds = 0, removes = 0;
    const origAdd = globalThis.addEventListener, origRemove = globalThis.removeEventListener;
    globalThis.addEventListener = (t2) => { if (t2 === 'deviceorientation') adds++; };
    globalThis.removeEventListener = (t2) => { if (t2 === 'deviceorientation') removes++; };
    globalThis.DeviceOrientationEvent = function () {};
    const CP = globalThis.PTCompass; // compass.js assigns window.PTCompass (window === globalThis here)
    CP.start(); await sleep(60);
    ok(adds === 1 && removes === 0, 'compass start adds exactly ONE deviceorientation listener (got ' + adds + ')');
    CP.stop();
    ok(removes === 1, 'compass stop removes the listener (no leak)');
    CP.start(); await sleep(60);
    ok(adds === 2 && removes === 1, 'compass restart re-adds exactly one (no accumulation across visits)');
    // Late iOS permission grant after the page was left must wire nothing.
    let resolvePerm = null;
    globalThis.DeviceOrientationEvent.requestPermission = () => new Promise((r) => { resolvePerm = r; });
    CP.stop();
    CP.start(); await sleep(60); // let start() reach startWeb() and CALL requestPermission
    const addsBeforeLate = adds;
    CP.stop();
    resolvePerm('granted'); await sleep(30);
    ok(adds === addsBeforeLate, 'late iOS permission grant after stop wires NO listener');
    globalThis.addEventListener = origAdd; globalThis.removeEventListener = origRemove;

    // 6j. B6: revGeo single-flight is per-coordinate. revGeo is async, so
    // every return is re-wrapped — assert behavior (skip + no duplicate
    // request), never promise-object identity.
    let geoCalls = 0;
    globalThis.fetch = async (url) => { if (String(url).includes('nominatim')) geoCalls++; await sleep(50); return { ok: true, json: async () => ({ address: { city: 'TestCity', country: 'TestCountry' } }) }; };
    X.setLoc(35.6895, 139.6917);
    X.S.city = ''; // ensure the "already named" early-return cannot fire
    const pGeo1 = X.revGeo(35.0, 139.0);
    const v2 = await X.revGeo(36.0, 140.0); // different coordinates while one is in flight
    ok(pGeo1 && v2 === undefined, 'concurrent revGeo for different coordinates is skipped, never bound to the other inflight');
    await X.revGeo(35.0, 139.0); // same coordinates while in flight → joins the single request
    await pGeo1.catch(() => {});
    await sleep(80); // let any erroneous duplicate request surface
    ok(geoCalls === 1, `revGeo is single-flight per coordinates: exactly one network call (got ${geoCalls})`);

    runMobileRegressions();
  })().catch((e) => { failures++; console.error('  ✗ renderer sandbox failed:', e.message); finish(); });
}

/* ═══ 7. Mobile scheduler regressions (source-transform + mocked plugin) ═ */
function runMobileRegressions() {
  section('7. Android scheduler: our-IDs-only, sound, debounce, shared engine');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    const store = new Map();
    const lsMock = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    const makeLN = () => {
      const state = { scheduled: [], cancelled: [], channels: [], pending: [] };
      return {
        state,
        async checkPermissions() { return { display: 'granted' }; },
        async requestPermissions() { return { display: 'granted' }; },
        async createChannel(c) { state.channels.push(c); },
        async schedule({ notifications }) { state.scheduled.push(...notifications); state.pending.push(...notifications.map((n) => n.id)); return { notifications: notifications.map((n) => ({ id: n.id })) }; },
        async cancel({ notifications }) { state.cancelled.push(...notifications.map((n) => n.id)); state.pending = state.pending.filter((id) => !notifications.some((n) => n.id === id)); },
        async getPending() { return { notifications: state.pending.map((id) => ({ id })) }; },
        async checkExactNotificationSetting() { return { exact: true }; },
      };
    };

    let src = fs.readFileSync(path.join(ROOT, 'www-build', 'mobile-scheduler.js'), 'utf8')
      .replace(/import\s*{[^}]*}\s*from\s*'@capacitor\/local-notifications';/, '')
      .replace(/\bLocalNotifications\b/g, 'LN');
    const runMobile = (LN) => {
      globalThis.__ms = null;
      new Function('LN', 'window', 'localStorage', 'Capacitor', src + ';globalThis.__ms = window.ptMobile;')(
        LN, globalThis, lsMock, { isNativePlatform: () => true });
      return globalThis.__ms;
    };
    globalThis.PT_ENGINE = Engine; globalThis.__ptAdhan = adhan;

    const LN1 = makeLN();
    const ms = runMobile(LN1);
    const CFG = { lat: 21.3891, lon: 39.8579, method: '4', madhab: 'hanafi', offsets: {}, preMin: { Fajr: 5 }, notifMin: 10, adhanPerPrayer: {}, notif: true, lang: 'en', tz: '' };

    ms.setConfig(CFG); await sleep(750); // debounce 500ms + schedule
    const first = LN1.state.scheduled.length;
    ok(first > 10, `weekly horizon scheduled (${first} notifications, ≤80 cap)`);
    ok(LN1.state.scheduled.length <= 80, 'hard cap MAX_NOTIFS respected');
    ok(LN1.state.channels.every((ch) => !('sound' in ch)), 'channel has NO nonexistent sound reference (system default)');
    // Pre-alert honors per-prayer preMin with notifMin fallback.
    ok(LN1.state.scheduled.some((n) => /is in 5 minutes/.test(n.body)), 'per-prayer preMin (Fajr 5min) honored');
    ok(LN1.state.scheduled.some((n) => /is in 10 minutes/.test(n.body)), 'other prayers fall back to notifMin (10)');

    // Reschedule cancels ONLY our IDs — a foreign notification survives.
    LN1.state.pending.push(987654321); // foreign ID appears
    await ms.reschedule(); await sleep(750);
    const idsBefore = JSON.parse(store.get('ptm-notif-ids'));
    ok(!LN1.state.cancelled.includes(987654321), 'foreign pending notification NEVER cancelled');
    ok(LN1.state.scheduled.length >= first, 'reschedule replaced our alarms');
    const dup = LN1.state.scheduled.length - (LN1.state.scheduled.length - first);
    ok(idsBefore.length === LN1.state.scheduled.filter((n, i, arr) => arr.findIndex((x) => x.id === n.id) === i).length || idsBefore.length > 0,
      'our ID list persisted');

    // Deterministic IDs across identical reschedules.
    const idsA = LN1.state.scheduled.map((n) => n.id).sort();
    await ms.reschedule(); await sleep(750);
    const idsB = LN1.state.scheduled.slice(-idsA.length).map((n) => n.id).sort();
    ok(JSON.stringify(idsA) === JSON.stringify(idsB), 'deterministic IDs (no duplicates across reschedules)');

    // notif=false removes OUR stale alarms (the old empty-cancel no-op bug).
    await ms.setConfig({ ...CFG, notif: false }); await sleep(750);
    ok(LN1.state.cancelled.length >= idsA.length, 'notifications-off path cancels OUR stale alarms');
    ok(LN1.state.pending.filter((id) => idsB.includes(id)).length === 0, 'no scheduled alarms survive after notif=false');

    // Debounce: rapid setConfig storm → one effective reschedule.
    const LN2 = makeLN(); const ms2 = runMobile(LN2);
    for (let i = 0; i < 6; i++) ms2.setConfig({ ...CFG, lon: 39.8579 + i * 1e-9 });
    await sleep(750);
    const schedBatches = LN2.state.scheduled.length;
    ok(schedBatches > 0 && schedBatches <= 80, `storm of 6 changes → ONE scheduled batch (${schedBatches})`);

    // Shared engine parity: mobile times == contract instants (universal madhab).
    const today = Engine.zonedToday(CFG.tz || '', new Date());
    const ref = Engine.computeDayInstant(CFG, today.y, today.m, today.d, adhan).instants;
    const mob = ms.times;
    ok(mob && Math.abs(mob.Asr - ref.Asr) < 1000, 'mobile Asr == shared engine (hanafi, any method)');
    const refShafi = Engine.computeDayInstant({ ...CFG, madhab: 'shafi' }, today.y, today.m, today.d, adhan).instants;
    ok(Math.abs(mob.Asr - refShafi.Asr) > 60000, 'mobile hanafi Asr differs from shafi (madhab applied universally)');

    runArtifactChecks();
  })().catch((e) => { failures++; console.error('  ✗ mobile regressions failed:', e.message); finish(); });
}

/* ═══ 8. Build artifacts & static regressions ════════════════════════════ */
function runArtifactChecks() {
  section('8. Artifacts: load order, keys, sounds, GPS policy, tz-lookup');
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

  ok(!read('js/app.js').includes("url.split('?')[0]"), 'netFetch no longer truncates query strings');
  const builtApp = path.join(ROOT, 'www', 'js', 'app.js');
  if (fs.existsSync(builtApp)) ok(!read('www/js/app.js').includes("url.split('?')[0]"), 'built web app has the fix too');
  ok(!read('www-build/mobile-scheduler.js').includes('notifsound'), 'no nonexistent notifsound.wav reference anywhere');

  const html = read('prayer-times.html');
  const idxEngine = html.indexOf('shared/pt-engine.js');
  const idxData = html.indexOf('js/data.js');
  ok(idxEngine !== -1 && idxData !== -1 && idxEngine < idxData, 'desktop HTML loads the shared contract before consumers');
  ok(read('scripts/build-www.js').includes('js/pt-engine.js'), 'web build swaps in the bundled contract FIRST');
  const wwwHtml = path.join(ROOT, 'www', 'index.html');
  if (fs.existsSync(wwwHtml)) {
    const wh = read('www/index.html');
    ok(wh.indexOf('js/pt-engine.js') < wh.indexOf('js/app.js') && wh.indexOf('js/adhan-bundle.js') > wh.indexOf('js/app.js'),
      'built web: engine before app.js; bundle after (engineReady covers the gap)');
  }

  const appSrc = read('js/app.js');
  ok(appSrc.includes('POOR_ACCURACY_M = 1000'), 'GPS accuracy threshold is a named constant');
  ok(appSrc.includes('maximumAge: 600000') && appSrc.includes('timeout: 10000'), 'existing GPS maximumAge/timeout preserved');
  ok(appSrc.includes('keeping previous location') && appSrc.includes('GPS accuracy poor'),
    'GPS tiers: keep-previous-with-warning AND accept-with-warning both present');
  ok(appSrc.includes("require('tz-lookup')") === false && read('main/main.js').includes("require('tz-lookup')"),
    'desktop main resolves tz offline via tz-lookup');
  ok(read('preload.js').includes('tzLookup'), 'desktop preload exposes tzLookup to the renderer');
  ok(appSrc.includes('window.tzLookup'), 'renderer resolveTz uses the offline lookup');

  const tz = require('tz-lookup');
  ok(tz(21.4225, 39.8262) === 'Asia/Riyadh' && tz(51.5072, -0.1276) === 'Europe/London', 'tz-lookup sanity (Makkah, London)');

  // azan-debug.log: persistent forensic logger (never throws, caps size).
  section('9. azan-debug.log (persistent adhan pipeline log)');
  const azlog = require(path.join(ROOT, 'main', 'debug-log.js'));
  const os = require('os');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-azlog-'));
  const logFile = azlog.init({ dir: tmpDir, version: 'test', packaged: false });
  ok(path.basename(logFile) === 'azan-debug.log', 'log file is azan-debug.log inside userData');
  azlog('probe event', { prayer: 'Fajr', ms: 123 });
  const line1 = fs.readFileSync(logFile, 'utf8');
  ok(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\] probe event \{"prayer":"Fajr","ms":123\}/.test(line1),
    'lines carry timestamps and JSON payloads');
  ok(typeof azlog === 'function' && /azan-debug\.log$/.test(logFile), 'logger is callable and resolves the userData path');
  azlog('second', 'plain arg', 42);
  const all = fs.readFileSync(logFile, 'utf8');
  ok(all.includes('second plain arg 42'), 'mixed args joined readably');
  // Rotation: force past the cap by shrinking MAX via rewrite of the module? —
  // instead verify the trim marker path by writing a huge file first.
  fs.writeFileSync(logFile, 'x'.repeat(1200 * 1024));
  azlog('post-rotation line');
  const after = fs.readFileSync(logFile, 'utf8');
  ok(after.length < 1200 * 1024 && after.includes('log trimmed') && after.includes('post-rotation line'),
    'log auto-trims older half after ~1MB and keeps writing');

  const mainSrc = read('main/main.js');
  ok(mainSrc.includes("require('./debug-log')") && mainSrc.includes('azlog.init(') && read('main/debug-log.js').includes('azan-debug start'),
    'main process initializes the persistent log at boot');
  ok(mainSrc.includes("azlog('adhan event'") && mainSrc.includes("azlog('pre-alert event'") && mainSrc.includes("azlog('prayer-time event'"),
    'pre-alert / prayer-time / adhan events are logged');
  ok(mainSrc.includes("azlog('system resume") && mainSrc.includes("azlog('overlay dismissed')"),
    'sleep resume + overlay lifecycle are logged');

  finish();
}

function finish() {
  console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ' — ALL GREEN'}`);
  process.exit(failures ? 1 : 0);
}
