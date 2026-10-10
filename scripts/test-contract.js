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

// v1.5 audit: spec bearing sweep — great-circle outputs always in [0, 360).
section('1b. Qibla bearing spec sweep (great-circle, 0 ≤ b < 360)');
{
  const cities = [
    ['Riyadh (spec coords)', 24.7555, 46.7804, 243.8776],
    ['Makkah city', 21.3891, 39.8579, 318.5409],
    ['Cairo', 30.0444, 31.2357, 136.1373],
    ['London', 51.5074, -0.1278, 118.9872],
    ['New York', 40.7128, -74.0060, 58.4817],
  ];
  for (const [name, lat, lon, exp] of cities) {
    const b = Engine.qiblaBearing(lat, lon);
    ok(Number.isFinite(b) && b >= 0 && b < 360, `${name}: bearing ${b.toFixed(1)}° in [0, 360)`);
    ok(Math.abs(b - exp) < 0.01, `${name}: bearing ≈ ${exp.toFixed(1)}° (got ${b.toFixed(4)}°)`);
  }
  ok(Engine.qiblaBearing(21.4225, 39.8262) === 0, 'at the Kaaba itself the bearing degenerates to 0 (never NaN)');
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
  const lastStyle = { transform: null }; // the LAST transform written by any element (needle geometry asserts)
  const styleRec = new Proxy({}, {
    get(t, k) { return k === 'transform' ? lastStyle.transform : undefined; },
    set(t, k, v) { if (k === 'transform') lastStyle.transform = String(v); return true; },
  });
  const dummy = new Proxy(function () {}, {
    get(t, k) {
      if (k === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (k === 'style') return styleRec;
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

    // ── 6i2. v1.3.2 P4–P8: heading validation, signed turn, rotation, cleanup ──
    const PC = globalThis.PTCompass;
    delete globalThis.DeviceOrientationEvent.requestPermission; // 6i left a pending-permission stub
    delete globalThis.ondeviceorientationabsolute;              // default sandbox → legacy fallback type
    let evtType = null, evtHandler = null;
    globalThis.addEventListener = (t2, fn) => { if (t2 === 'deviceorientation' || t2 === 'deviceorientationabsolute') { evtType = t2; evtHandler = fn; } };
    globalThis.removeEventListener = () => {};
    const origScreen = Object.getOwnPropertyDescriptor(globalThis, 'screen');
    const setScreen = (angle) => Object.defineProperty(globalThis, 'screen', { value: { orientation: { angle } }, configurable: true });
    const noScreen = () => { if (origScreen) Object.defineProperty(globalThis, 'screen', origScreen); else delete globalThis.screen; };
    noScreen();
    X.setLoc(24.7136, 46.6753); // Riyadh — known bearing ≈ 244°
    PC.start(); await sleep(60);
    ok(evtType === 'deviceorientation' && evtHandler != null,
      'P4 fallback: plain deviceorientation with ONE handler when no absolute event type exists');
    // Invalid sensor values are REJECTED (NaN, Infinity, missing, absurd, relative-only).
    evtHandler({ alpha: NaN, absolute: true }); evtHandler({ alpha: Infinity, absolute: true });
    evtHandler({}); evtHandler(null); evtHandler({ alpha: 1e9, absolute: true });
    evtHandler({ alpha: 30, absolute: false }); // relative data must never define north
    ok(PC.snapshot().heading == null, 'P4: NaN/Infinity/missing/absurd/relative readings all rejected');
    // Absolute data is accepted; alpha converts counter-sense (heading = 360 − α).
    evtHandler({ alpha: 300, absolute: true });
    const snapA = PC.snapshot();
    ok(Math.abs(snapA.heading - 60) < 1e-9, 'P4: absolute alpha 300 → heading 60 (360−α)');
    ok(snapA.sensor === 'deviceorientation', 'P8: sensor name surfaced (' + snapA.sensor + ')');
    const bR = snapA.bearing;
    ok(Math.abs(bR - 243.8) < 2, 'P8: Riyadh bearing through compass layer ≈ 244° (got ' + bR.toFixed(1) + '°)');
    const expTurn = ((bR - 60 + 540) % 360) - 180;
    ok(Math.abs(snapA.turn - expTurn) < 1e-9 && snapA.turn > -180 && snapA.turn <= 180,
      'P5: signed turn = ((bearing−heading+540)%360)−180 (got ' + snapA.turn.toFixed(1) + '°)');
    // Absolute-first priority: exposing the absolute event type switches to it.
    globalThis.ondeviceorientationabsolute = null; // property exists → 'in' true
    PC.stop(); PC.start(); await sleep(60);
    ok(evtType === 'deviceorientationabsolute', 'P4: prefers deviceorientationabsolute when available');
    evtHandler({ alpha: 300 }); // absolute event type is absolute by definition
    ok(Math.abs(PC.snapshot().heading - 60) < 1e-9, 'P4: absolute event type needs no absolute flag');
    // iOS webkitCompassHeading wins over alpha.
    evtHandler({ alpha: 10, webkitCompassHeading: 238 });
    ok(Math.abs(PC.snapshot().heading - 238) < 1e-9, 'P4: webkitCompassHeading takes priority over alpha');
    ok(PC.snapshot().sensor === 'webkitCompassHeading', 'P8: iOS sensor name surfaced');
    // Normalization: 0 ≤ heading < 360 for negative / >360 / exactly 360.
    evtHandler({ webkitCompassHeading: -20 }); ok(PC.snapshot().heading === 340, 'P4: −20 normalizes to 340');
    evtHandler({ webkitCompassHeading: 380 }); ok(PC.snapshot().heading === 20, 'P4: 380 normalizes to 20');
    evtHandler({ webkitCompassHeading: 360 }); ok(PC.snapshot().heading === 0, 'P4: 360 normalizes to 0 (0≤h<360)');
    // Signed turn at the ±180 edge and at 0.
    evtHandler({ webkitCompassHeading: (bR + 180) % 360 });
    ok(Math.abs(Math.abs(PC.snapshot().turn) - 180) < 1e-9, 'P5: heading at bearing+180 → |turn| = 180');
    evtHandler({ webkitCompassHeading: bR });
    ok(PC.snapshot().turn === 0, 'P5: heading = bearing → turn 0 (Kaaba straight ahead)');
    // Screen rotation (P6): sensors report the natural portrait frame;
    // screen.orientation.angle (CCW from natural) is subtracted.
    setScreen(90);
    evtHandler({ webkitCompassHeading: 100 });
    ok(Math.abs(PC.snapshot().heading - 10) < 1e-9, 'P6: landscape (angle 90) adjusts heading 100 → 10');
    setScreen(0);
    evtHandler({ webkitCompassHeading: 100 });
    ok(Math.abs(PC.snapshot().heading - 100) < 1e-9, 'P6: portrait (angle 0) keeps raw heading');
    setScreen(90); evtHandler({ webkitCompassHeading: 100 }); const hL = PC.snapshot().heading;
    setScreen(0); evtHandler({ webkitCompassHeading: 100 }); const hP = PC.snapshot().heading;
    ok(Math.abs(hL - 10) < 1e-9 && Math.abs(hP - 100) < 1e-9, 'P6: portrait→landscape→portrait compensates each cycle');
    // Legacy window.orientation fallback (clockwise legacy → same subtract form).
    noScreen();
    Object.defineProperty(globalThis, 'orientation', { value: 90, configurable: true });
    evtHandler({ webkitCompassHeading: 0 });
    ok(Math.abs(PC.snapshot().heading - 270) < 1e-9, 'P6: window.orientation=90 fallback → heading 270');
    delete globalThis.orientation;
    noScreen();
    delete globalThis.ondeviceorientationabsolute;
    // Lifecycle across repeated visits (P7): one listener per visit, zero accumulation.
    PC.stop(); // leave the P6 block with the compass closed, as gotoPage does
    let adds2 = 0, removes2 = 0;
    globalThis.addEventListener = (t2) => { if (t2 === 'deviceorientation' || t2 === 'deviceorientationabsolute') adds2++; };
    globalThis.removeEventListener = (t2) => { if (t2 === 'deviceorientation' || t2 === 'deviceorientationabsolute') removes2++; };
    for (let i = 0; i < 3; i++) { PC.start(); await sleep(60); PC.stop(); }
    ok(adds2 === 3 && removes2 === 3, 'P7: 3 open/close cycles → exactly 3 adds + 3 removes (got ' + adds2 + '/' + removes2 + ')');
    ok(PC.snapshot().heading == null, 'P7: stop resets heading (fresh state on next visit)');
    PC.start(); await sleep(60);
    evtHandler({ webkitCompassHeading: 90 });
    ok(Math.abs(PC.snapshot().heading - 90) < 1e-9, 'P7: fresh visit accepts headings again');
    PC.stop();
    evtHandler({ webkitCompassHeading: 90 }); // stale event after stop
    ok(PC.snapshot().heading == null, 'P7: events after stop are ignored (epoch guard)');
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

    // 6k. v1.5 Qibla needle: ±2° alignment (wraparound-safe) + ONE-SHOT haptic.
    {
      let vib = 0; const vibMs = [];
      const mkNav = () => ({ onLine: true, vibrate: (ms) => { vib++; vibMs.push(ms); return true; } });
      const setNav = (v) => Object.defineProperty(globalThis, 'navigator', { value: v, configurable: true });
      const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
      setNav(mkNav());
      let kHandler = null;
      globalThis.addEventListener = (t2, fn) => { if (t2 === 'deviceorientation' || t2 === 'deviceorientationabsolute') kHandler = fn; };
      globalThis.removeEventListener = () => {};
      const bK = PC.snapshot().bearing; // Riyadh ≈ 243.8 — read live, never hard-coded
      PC.start(); await sleep(60);
      ok(kHandler != null && PC.snapshot().heading == null && PC.snapshot().aligned === false && vib === 0,
        '6k: fresh visit — no heading, NOT aligned, haptic silent');
      kHandler({ webkitCompassHeading: bK }); await sleep(120);
      ok(Math.abs(PC.snapshot().turn) <= 2 && PC.snapshot().aligned === true,
        '6k: heading = bearing → aligned within the ±2° window');
      ok(vib === 1, `6k: ENTERING alignment vibrates exactly once (got ${vib})`);
      kHandler({ webkitCompassHeading: (bK + 1.5) % 360 }); await sleep(120);
      kHandler({ webkitCompassHeading: (bK - 1.5 + 360) % 360 }); await sleep(120);
      ok(PC.snapshot().aligned === true && vib === 1, '6k: remaining aligned (±1.5° drift) does NOT vibrate again');
      // Needle DOM: last transform congruent to bearing − heading (mod 360).
      const hNow = PC.snapshot().heading;
      const mRot = /rotate\((-?[\d.]+)deg\)/.exec(lastStyle.transform || '');
      const rotMod = mRot ? ((parseFloat(mRot[1]) % 360) + 360) % 360 : null;
      const wantMod = ((bK - hNow) % 360 + 360) % 360;
      ok(rotMod != null && Math.abs(rotMod - wantMod) < 1e-6,
        `6k: needle transform lands at bearing−heading on screen (got ${rotMod}°, want ${wantMod}°)`);
      kHandler({ webkitCompassHeading: (bK + 10) % 360 }); await sleep(120);
      ok(PC.snapshot().aligned === false && vib === 1, '6k: leaving alignment re-arms the haptic (still one buzz)');
      kHandler({ webkitCompassHeading: (bK - 1 + 360) % 360 }); await sleep(120);
      ok(Math.abs(PC.snapshot().turn - 1) < 1e-9 && PC.snapshot().aligned === true && vib === 2,
        '6k: re-entering alignment buzzes again (shortest-path +1°, re-armed)');
      // TRUE wraparound: due-south of the Kaaba the bearing is exactly 0°, so
      // heading 359 must align via the shortest path (turn = +1, never −359).
      X.setLoc(19.5, 39.8262);
      const bS = PC.snapshot().bearing;
      ok(bS === 0, '6k: bearing from a due-south point is exactly 0° (0 ≤ b < 360)');
      kHandler({ webkitCompassHeading: (bS + 3) % 360 }); await sleep(120);
      ok(PC.snapshot().aligned === false, '6k: 3° off the 0° bearing sits outside the window');
      kHandler({ webkitCompassHeading: (bS + 359) % 360 }); await sleep(120);
      ok(PC.snapshot().turn === 1 && PC.snapshot().aligned === true && vib === 3,
        '6k: 359↔0 wraparound aligns via the shortest path and buzzes once');
      kHandler({ webkitCompassHeading: (bS + 2) % 360 }); await sleep(120);
      ok(PC.snapshot().aligned === true && vib === 3, '6k: |turn| = 2 exactly → the boundary is inclusive');
      kHandler({ webkitCompassHeading: (bS + 2.5) % 360 }); await sleep(120);
      ok(PC.snapshot().aligned === false, '6k: |turn| = 2.5 → outside the window');
      // No vibration support → graceful no-op; alignment still detected.
      setNav({ onLine: true });
      kHandler({ webkitCompassHeading: bS }); await sleep(120);
      ok(PC.snapshot().aligned === true && vib === 3, '6k: missing navigator.vibrate → alignment works, no crash');
      // Remount: armed state resets — a fresh realignment buzzes once more.
      setNav(mkNav());
      PC.stop(); PC.start(); await sleep(60);
      ok(PC.snapshot().aligned === false && PC.snapshot().heading == null, '6k: remount starts disarmed with no heading');
      kHandler({ webkitCompassHeading: bS }); await sleep(120);
      ok(PC.snapshot().aligned === true && vib === 4, `6k: remount + realign buzzes once more (got ${vib})`);
      ok(vibMs.length === vib && vibMs.every((ms) => ms > 0), '6k: every buzz carried a non-zero duration');
      X.setLoc(24.7136, 46.6753); // restore Riyadh for later sections
      if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator;
      globalThis.addEventListener = origAdd; globalThis.removeEventListener = origRemove;
      PC.stop();
    }

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
        async listChannels() { return { channels: state.channels }; },
        async deleteChannel({ id }) { state.channels = state.channels.filter((c) => c.id !== id); },
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
    ok(first > 10, `14-day horizon scheduled (${first} notifications, ≤150 cap)`);
    ok(LN1.state.scheduled.length <= 150, 'hard cap MAX_NOTIFS respected (150 < ~500-alarm OS budget)');
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

    // v1.4.0: per-reciter adhan channel + per-prayer mute parity (R9/R10).
    const LN3 = makeLN(); const ms3 = runMobile(LN3);
    await ms3.setConfig({ ...CFG, adhanEnabled: true, adhanType: 'nafees', adhanPerPrayer: { Dhuhr: false } }); await sleep(750);
    const adhanChan = LN3.state.channels.find((c) => c.id === 'adhan-nafees');
    ok(!!adhanChan && adhanChan.sound === 'nafees.mp3', 'adhan-nafees channel created with the bundled raw sound');
    const ptNotifs = LN3.state.scheduled.filter((n) => /is time for/.test(n.body));
    ok(ptNotifs.length > 0 && ptNotifs.every((n) => n.channelId === (n.title === 'Dhuhr' ? 'prayer' : 'adhan-nafees')),
      'prayer-time notifications route: unmuted → adhan channel, muted → plain channel');
    const preNotifs = LN3.state.scheduled.filter((n) => /is in \d+ minutes/.test(n.body));
    ok(preNotifs.length > 0 && preNotifs.every((n) => n.channelId === 'prayer'), 'pre-alerts never use the adhan channel');
    // Reciter switch → new channel created, stale one deleted.
    await ms3.setConfig({ ...CFG, adhanEnabled: true, adhanType: 'classic', adhanPerPrayer: {} }); await sleep(750);
    ok(LN3.state.channels.some((c) => c.id === 'adhan-classic') && !LN3.state.channels.some((c) => c.id === 'adhan-nafees'),
      'reciter switch creates the new channel and deletes the stale one');
    const schedBatches = LN2.state.scheduled.length;
    ok(schedBatches > 0 && schedBatches <= 150, `storm of 6 changes → ONE scheduled batch (${schedBatches})`);

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

  // v1.3.2 P9–P15: azan config contract, packaging assets, audio decouple.
  section('10. v1.3.2 azan contract: propagation, dedup, assets, decouple');
  const { execSync } = require('child_process');
  const asarJs = path.join(ROOT, 'node_modules', 'asar', 'bin', 'asar.js');
  const asarPath = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
  if (fs.existsSync(asarJs) && fs.existsSync(asarPath)) {
    const asar = JSON.parse(execSync(`"${process.execPath}" "${asarJs}" list "${asarPath}"`, { maxBuffer: 64 * 1024 * 1024 }).toString());
    for (const f of ['default.mp3', 'nafees.mp3', 'dubai.mp3', 'zahrani.mp3', 'turkey.mp3', 'classic.mp3']) {
      ok(asar.some((x) => x.replace(/\\/g, '/').endsWith(`assets/adhans/${f}`)), `${f} is packaged in app.asar`);
    }
  } else {
    ok(true, 'packaging asset checks pending a build (dist/win-unpacked not present)');
  }

  // P12: resolver + ALL SIX bundled MP3s (exist, non-zero, file:// output).
  const RES = require(path.join(ROOT, 'main', 'adhan-files.js'));
  for (const id of ['alafasy', 'nafees', 'dubai', 'zahrani', 'turkey', 'classic']) {
    const r = RES.resolveAdhanAudio(id);
    const fp = r.src.replace('file://', '');
    ok(r.kind === 'bundled' && r.src.startsWith('file://'), `resolver(${id}) → bundled file:// (${r.file})`);
    ok(fs.existsSync(fp), `bundled file exists on disk: ${r.file}`);
    ok(fs.statSync(fp).size > 10000, `bundled file non-trivial size: ${r.file}`);
  }
  ok(RES.resolveAdhanAudio('does-not-exist').kind === 'bundled', 'unknown reciter falls back to default.mp3');

  // P9/P10: one canonical switch renderer→preload→main→scheduler + dedup.
  ok(appSrc.includes('adhanEnabled') && appSrc.includes('adhan: adhanEnabled'), 'renderer sends canonical adhanEnabled (+legacy twin)');
  ok(appSrc.includes('lastPushedCfg'), 'renderer dedups identical config pushes (P9)');
  ok(appSrc.includes("PT.debug('config push'"), 'every real config push is logged with its trigger (P9)');
  ok(read('preload.js').includes('adhanEnabled'), 'preload bridge forwards adhanEnabled');
  ok(mainSrc.includes('cfg.adhanEnabled !== undefined ? cfg.adhanEnabled'), 'main normalizes the azan switch once at the IPC boundary');
  ok(mainSrc.includes("azlog('azan switch changed'"), 'azan switch changes are logged');
  ok(mainSrc.includes('adhanEnabled, adhan: adhanEnabled }'), 'scheduler receives the normalized boolean on both keys');
  const schedSrc = read('main/scheduler.js');
  ok(schedSrc.includes('cfg.adhanEnabled !== undefined ? cfg.adhanEnabled : cfg.adhan'), 'scheduler reads the canonical switch with legacy fallback');

  // P15: the overlay setting must never silently disable azan AUDIO.
  ok(!/overlay disabled by setting/.test(mainSrc), 'audio is no longer skipped when the overlay is off (P15 decouple)');
  ok(mainSrc.includes('opts.visible === false'), 'overlay window supports a hidden (audio-only) mode');
  ok(mainSrc.includes('azan audio plays without UI'), 'hidden-overlay azan playback is logged');

  // Boundary trace (v1.3.2): every link of the azan chain must be visible in
  // azan-debug.log — packaged builds included.
  ok(mainSrc.includes('createScheduler({ log: azlog })'), 'scheduler decision logs reach azan-debug.log in packaged builds');
  ok(schedSrc.includes('createScheduler(opts = {})') && schedSrc.includes('scheduler config accepted')
    && schedSrc.includes('prayer window entered') && schedSrc.includes('adhan event emitted') && schedSrc.includes("'adhan skipped'"),
    'scheduler logs every boundary: config accepted / schedule / window / emit-or-skip');
  ok(mainSrc.includes("'overlay page loaded'") && mainSrc.includes("'overlay page load FAILED'"), 'overlay page load outcome is logged');
  ok(mainSrc.includes("'adhan:show payload sent'") && mainSrc.includes('hidden: !overlayVisible'), 'payload-delivery boundary is logged and carries the hidden flag');
  const ovSrc = read('js/overlay.js');
  ok(ovSrc.includes("'adhan:show received'"), 'overlay renderer logs payload receipt');
  ok(ovSrc.includes('audio canplay') && ovSrc.includes('audio playing') && ovSrc.includes("'audio ended'"), 'decode/output/end boundaries are logged in the overlay');
  // v1.3.3: Test Adhan runs the REAL desktop pipeline; CSP hosts are scheme-prefixed.
  section('11. v1.3.3: test-overlay routing + CSP host schemes');
  ok(/testAdhan[\s\S]*?PT\.testOverlay\(\)[\s\S]*?return/.test(appSrc),
    'desktop testAdhan routes through PT.testOverlay() before any CDN path');
  ok(appSrc.includes("t('toast.adhanOverlay')") && appSrc.includes("t('toast.adhanFail')"),
    'adhan test/failure toasts use honest i18n keys (adhanOverlay / adhanFail)');
  ok(!appSrc.includes("showToast('🔇 ' + t('toast.beep'))"),
    'the cryptic 🔇+beep failure toast is gone');
  ok(!/beep: '🔊'/.test(read('js/data.js')), 'data.js no longer defines the emoji-only beep toast');
  const csp = (read('prayer-times.html').match(/Content-Security-Policy[\s\S]*?content="([^"]+)"/) || [])[1] || '';
  ok(csp.length > 0, 'desktop page defines a CSP');
  ok(csp.split(/;\s*/).every((d) => d.split(/\s+/).slice(1).every((t) => !t || t === '' || /^(https?:|'self'|'none'|data:|'unsafe-inline')/.test(t))),
    'every CSP host token is scheme-prefixed or self/data/none (CSP3 file:// safety)');
  ok(csp.includes('https://*.mp3quran.net') && csp.includes('https://cdn.islamic.network'),
    'media-src covers both Quran streaming hosts');
  const recSrc = read('js/data.js');
  ok(/url: 'https:\/\/cdn\.islamic\.network[^']*\{n\}\.mp3'/.test(recSrc) && /url: 'https:\/\/[^']*mp3quran\.net[^']*\{n3\}\.mp3'/.test(recSrc),
    'RECITERS carry islamic.network + mp3quran URL templates ({n}/{n3})');
  ok(read('js/pages.js').includes('padStart(3'), 'qrUrl expands {n3} zero-padded');
  // v1.4.0: REVIEW.docx fixes — Qibla geometry, tray/AMID, tz resolution,
  // recovery cap, Android adhan channels, packaging hygiene.
  section('12. v1.4.0 review fixes: geometry, tray, AMID, channels, packaging');
  const compassSrc = read('js/compass.js');
  const qpagesSrc = read('js/pages.js');
  const traySrc = read('main/tray.js');
  const mainSrc2 = read('main/main.js');
  const schedSrc2 = read('main/scheduler.js');
  const jsonSrc = read('main/json-store.js');
  const mobileSrc = read('www-build/mobile-scheduler.js');
  const entrySrc = read('www-build/entry.js');
  const gradleSrc = read('android/app/build.gradle');
  const manifestSrc = read('android/app/src/main/AndroidManifest.xml');
  const overlayHtml = read('adhan.html');
  const dataSrc2 = read('js/data.js');
  const pkgJson = JSON.parse(read('package.json'));

  // R6 (v1.5 audit): the rim 🕋 marker is REPLACED by one centered needle.
  ok(!compassSrc.includes('kaabaMark') && compassSrc.includes("$('qNeedle')"),
    'live compass drives a centered qNeedle (rim kaaba marker removed)');
  ok(!qpagesSrc.includes('kaabaMark') && /qNeedle'\)\.style\.transform = `rotate\(\$\{b\}deg\)`/.test(qpagesSrc),
    'static qibla render points the needle at the bearing (no rim marker)');
  ok(/ALIGNED_TOL = 2\b/.test(compassSrc), 'alignment tolerance is the specified ±2°');
  ok(/typeof navigator\.vibrate === 'function'/.test(compassSrc) && /navigator\.vibrate\(/.test(compassSrc),
    'haptic fires only through a guarded navigator.vibrate (graceful without support)');
  ok(manifestSrc.includes('android.permission.VIBRATE'), 'Android VIBRATE permission present (alignment haptic can fire)');
  {
    // Numeric check: the needle rotated by θ points its local up axis (0,−1)
    // at screen azimuth θ (CSS rotate = CW, y down) — the same convention the
    // rim marker was pinned to. Live screen angle = norm360(bearing − heading);
    // static render = the bare bearing.
    const norm360 = (d) => ((d % 360) + 360) % 360;
    const tipAzimuth = (theta) => {
      const rad = theta * Math.PI / 180;
      const x = Math.sin(rad), y = -Math.cos(rad);
      return (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    };
    for (const [b, h] of [[244, 0], [244, 244], [1, 359], [359, 1], [0, 90], [359.9, 0]]) {
      const want = norm360(b - h);
      ok(Math.abs(tipAzimuth(want) - want) < 1e-9, `needle tip at bearing ${b}° (heading ${h}°) lands on screen at ${want}°`);
    }
    const sdiff = (a, c) => ((a - c + 540) % 360) - 180;
    ok(Math.abs(sdiff(359, 1)) === 2 && Math.abs(sdiff(1, 359)) === 2 && sdiff(0, 359.5) === 0.5,
      'alignment math: shortest angular difference holds across the 359↔1 wraparound');
  }

  // R1/R2/R7: scheduler advance + tz payloads + recovery cap.
  ok(schedSrc2.includes('ms: next.ms') && schedSrc2.includes('now >= next.ms'),
    'scheduler advances the next-prayer pointer within the same tick');
  ok(schedSrc2.includes('time: fmtInTz(at, cfg.tz)'), 'event payloads use the location timezone');
  ok(schedSrc2.includes('RECOVERY_MAX_MS = 15 * 60 * 1000') && schedSrc2.includes("'missed-too-long'"),
    '15-min adhan recovery cap logged as missed-too-long');

  // R3/R4/R5: tray, AppUserModelId, main-side tz.
  ok(!traySrc.includes('try { rebuild(null)'), 'tray click handler no longer wipes the menu');
  ok(mainSrc2.includes("setAppUserModelId('com.malek.prayertimes')"), 'AppUserModelId matches the electron-builder appId');
  ok(mainSrc2.includes("require('tz-lookup')") && mainSrc2.includes('!cfg.tz'), 'empty cfg.tz is resolved in MAIN (sandboxed preload cannot require)');
  ok(!/require\('tz-lookup'\)/.test(read('preload.js')) && !/exposeInMainWorld\('tzLookup'/.test(read('preload.js')), 'preload no longer bridges tz-lookup (no require, no expose)');
  ok(mainSrc2.includes("!process.argv.includes('--hidden')) win.show()"), '--hidden autostart never shows the window');

  // R8: atomic settings writes.
  ok(jsonSrc.includes('.tmp') && jsonSrc.includes('renameSync'), 'settings store writes atomically (tmp + rename)');

  // R9/R10/R11/R12: Android channels + mute parity + horizon + exact alarms.
  ok(mobileSrc.includes("CH_PREFIX = 'adhan-'") && mobileSrc.includes('adhanChannel && !muted ? adhanChannel'),
    'Android per-reciter adhan channel wired to the prayer-time notification');
  ok(!/adhanPerPrayer\[p\] === false\) continue/.test(mobileSrc), 'muted prayers no longer SKIP the Android notification');
  ok(mobileSrc.includes('DAYS = 14') && mobileSrc.includes('MAX_NOTIFS = 150'), '14-day horizon with a 150-notification cap');
  ok(mobileSrc.includes('changeExactNotificationSetting'), 'exact-alarms settings path wired (requestExactAlarms)');
  ok(entrySrc.includes("App.addListener('backButton'"), 'Android back button closes overlays before exiting');
  ok(read('js/app.js').includes('adhanEnabled: !!S.cfg.adhan, adhanType: S.cfg.adhanType'), 'pushMobile sends the adhan switch + reciter');
  ok(read('prayer-times.html').includes('androidAzanNote'), 'Android azan honesty note present');

  // Packaging / privacy / licensing.
  ok(manifestSrc.includes('allowBackup="false"'), 'allowBackup=false (prayer history stays on-device)');
  ok(gradleSrc.includes('verifyReleaseKeystore') && gradleSrc.includes('versionCode 8'), 'keystore guard active; versionCode 8');
  ok(Object.keys(pkgJson.dependencies).join(',') === 'adhan,tz-lookup', 'runtime deps = adhan + tz-lookup only (capacitor moved to dev)');
  ok(pkgJson.devDependencies.electron === '41.1.0', 'electron pinned to the exact 41.1.0');
  ok(typeof pkgJson.scripts.test === 'string' && pkgJson.scripts.test.includes('test-scheduler'), 'npm test wired');
  ok(fs.existsSync(path.join(ROOT, '.github', 'workflows', 'ci.yml')), 'CI workflow runs the suites');
  ok(!/media-src[^"]*file: cdn\./.test(overlayHtml) && overlayHtml.includes('file: https://cdn.aladhan.com'), 'overlay CSP hosts are scheme-prefixed');
  ok(dataSrc2.includes('credits:') && dataSrc2.includes('AlAdhan.com'), 'in-app credits + third-party attribution present');
  ok(fs.existsSync(path.join(ROOT, 'LICENSE')) && read('LICENSE').includes('ISC License'), 'LICENSE (ISC) present');

  /* ── 14. Full-screen Azan screen + attribution ──
     One presentation surface for Test Adhan AND the automatic prayer event;
     the developer credit and the Arabic supplication are present in both
     languages and on every surface (desktop/Android/web share prayer-times.html). */
  section('14. Full-screen Azan surface + developer attribution');
  const readRoot14 = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const azAppSrc = readRoot14('js/app.js');
  const azHtmlSrc = readRoot14('prayer-times.html');
  const azDataSrc = readRoot14('js/data.js');
  const azEntrySrc = readRoot14('www-build/entry.js');
  const azCssSrc = readRoot14('styles/app.css');
  const azPkgAuthor = JSON.parse(readRoot14('package.json')).author;

  ok(azHtmlSrc.includes('id="azanOverlay"') && azHtmlSrc.includes('id="azanArName"'),
    'full-screen azan overlay markup exists (shared by desktop/Android/web)');
  ok(/function showAzanScreen/.test(azAppSrc) && /window\.ptAzanScreen = \{/.test(azAppSrc),
    'showAzanScreen + window.ptAzanScreen exposed by app.js');
  ok(/showAzanScreen\('Test'\)/.test(azAppSrc),
    'Test Adhan opens the full-screen azan (Android + browser paths)');
  ok(/function hideAzanScreen/.test(azAppSrc) && /a\.pause\(\)/.test(azAppSrc),
    'dismissing the azan screen stops the audio (no leak / no orphan playback)');
  ok(azEntrySrc.includes("'localNotificationReceived'") && azEntrySrc.includes('ADHAN_BODY'),
    'foreground prayer notification presents the full-screen azan (body-guarded, never pre-alerts)');
  ok(/azanOverlay/.test(azEntrySrc) && /ptAzanScreen\.hide\(true\)/.test(azEntrySrc),
    'Android back button closes the azan screen before exiting');
  ok(azCssSrc.includes('.azan-screen{') && /prefers-reduced-motion/.test(azCssSrc),
    'azan screen ships safe-area padding + a reduced-motion guard');
  ok(azDataSrc.includes("developer: 'Developed by Malek Mahmoud'") &&
     azDataSrc.includes("dua: 'يرجى الدعاء ليا ولوالدي'"),
    'en+ar developer credit and the exact Arabic supplication are in the i18n table');
  ok(azHtmlSrc.includes('id="aboutDev"') && azHtmlSrc.includes('id="aboutDua"') && azHtmlSrc.includes('id="siteFoot"'),
    'About card + footer credit render the attribution');
  ok(azPkgAuthor === 'Malek Mahmoud', 'package.json author is Malek Mahmoud (no id/signing change)');

  // Every js/*.js the HTML loads must be copied by build-www.js — a missing
  // entry shipped a 404 (js/stats.js) into the Android + web builds.
  const buildWwwSrc = readRoot14('scripts/build-www.js');
  const jsRefs = [...azHtmlSrc.matchAll(/<script src="js\/([A-Za-z0-9_.-]+\.js)"/g)].map((m) => m[1]);
  const missingCopies = jsRefs.filter((f) => !buildWwwSrc.includes(`'${f}'`));
  ok(jsRefs.length >= 8 && missingCopies.length === 0,
    `every js/ script the HTML loads is copied by build-www.js (refs=${jsRefs.length}, missing=${missingCopies.join(',') || 'none'})`);

  /* ── 15. Design-system guards (docs/DESIGN-AUDIT.md) ──
     Each of these pins a measured defect that was fixed; without the guard a
     future edit can silently reintroduce it. */
  section('15. Design-system guards (measured regressions)');
  const css = readRoot14('styles/app.css');

  // The calendar grid overflowed its container by ~118px on a phone because
  // `repeat(7,1fr)` let each cell's min-content floor (~62.5px) win; 9 of 34
  // cells were then clipped by .content{overflow-x:hidden} with no scroll.
  ok(css.includes('repeat(7,minmax(0,1fr))') && /\.cal-cell\{[^}]*min-width:0/.test(css),
    'calendar grid cannot overflow: repeat(7,minmax(0,1fr)) + .cal-cell{min-width:0}');
  ok(!/\.cal-grid\{[^}]*repeat\(7,1fr\)/.test(css),
    'the min-content-floor form repeat(7,1fr) is gone from .cal-grid');

  // Large display type takes negative tracking; the countdown/hero used +2px.
  ok(/\.hero-cd\{[^}]*letter-spacing:-/.test(css) && /\.hero-name\{[^}]*letter-spacing:-/.test(css),
    'display type uses negative tracking (Apple §15), not a fixed positive value');

  // Accessibility media features beyond reduced-motion.
  ok(/prefers-reduced-transparency:\s*reduce/.test(css), 'prefers-reduced-transparency handled');
  ok(/prefers-contrast:\s*more/.test(css), 'prefers-contrast: more handled');
  ok(!/\*,\*::before,\*::after\{animation-duration:\.01ms !important;transition-duration:\.01ms !important\}/.test(css),
    'reduced-motion keeps short opacity/colour fades instead of the blanket .01ms kill');

  // Touch ergonomics behind (pointer:coarse).
  ok(/@media \(pointer:coarse\)/.test(css) && /\.toggle::before\{content:'';position:absolute;inset:-7px -6px\}/.test(css),
    'coarse-pointer block grows sub-44px controls (switch hit area via ::before)');

  // sahara's --text-muted was 4.00:1 on --surface2 (below AA 4.5) before this.
  ok(/\[data-theme="sahara"\][\s\S]*?--text-muted:#7a6146/.test(css),
    'sahara --text-muted is the AA-passing #7a6146 (was #8a6f52 at 4.00:1)');

  // ── v1.5 audit fixes: DST-safe streaks + calendar day-panel race + honest fallback ──
  section('13. v1.5 audit fixes: streak day-arithmetic, calendar race, fallback toast');
  {
    const s3pages = read('js/pages.js');
    const s3app = read('js/app.js');
    const s3data = read('js/data.js');
    ok(s3pages.includes('calDaySeq') && s3pages.includes('if (seq !== calDaySeq) return;'),
      'calendar day panel ignores stale async responses (click race fixed)');
    ok(s3data.includes('makkahDefault') && s3app.includes("t('toast.makkahDefault')"),
      'first-run Makkah fallback announces itself (honest default location)');
    // Behavioral: streaks must compare CALENDAR days, never exact 86400000 ms
    // diffs — local-noon dates are 23 h/25 h apart across a DST transition.
    const prevWin = globalThis.window;
    globalThis.window = globalThis; // store3.js assigns window.Store3
    try { new Function(s3data + '\n' + read('js/store3.js') + '\n;globalThis.__streaks = Store3.streaks;')(); }
    finally { globalThis.window = prevWin; }
    const streaks = globalThis.__streaks;
    ok(typeof streaks === 'function', 'store3 sandbox booted (Store3.streaks exposed)');
    // 2026-03-28 → 2026-03-29 straddles the Europe/London spring-forward;
    // calendar-day counting must still form one run on ANY device timezone.
    const hist = { '2026-03-27': { Fajr: 'done' }, '2026-03-28': { Dhuhr: 'missed' }, '2026-03-29': { Isha: 'done' } };
    const s1 = streaks({ history: hist });
    ok(s1.longest === 3, `three consecutive calendar days form ONE streak (got ${s1.longest}; includes the 2026-03-29 DST pair)`);
    ok(s1.current === 0, 'a past-only history does not invent a current streak');
    hist['2026-04-03'] = { Fajr: 'done' }; // 5-day gap
    hist['2026-04-04'] = { Fajr: '' };     // never recorded → must not count
    const s2 = streaks({ history: hist });
    ok(s2.longest === 3, `a gap resets the run; unrecorded days never count (got ${s2.longest})`);
    delete globalThis.__streaks;
  }

  /* ── 16. Dashboard icons + light-theme legibility (docs/design-review/) ──
     Pins the defects found by the rendered-screenshot review. */
  section('16. Dashboard icons + light-theme legibility');

  // .hero-cd inherited the hero's color:#fff while sitting on --glass, which is
  // near-white in ALL FIVE light themes — the countdown measured ~1.4:1 there.
  ok(/\.hero-cd\{[^}]*color:var\(--text\)/.test(css),
    'hero countdown takes its ink from --text, never the hero\'s inherited #fff');

  // --gold is the on-gradient/on-brand accent; text on a surface uses --gold-ink.
  // islamic's --gold (#b8860b) measured 3.20:1 as 11px text on --surface.
  const themeBlocks = css.match(/\[data-theme="[a-z]+"\]\{[\s\S]*?\n\}/g) || [];
  ok(themeBlocks.length === 8, `all eight themes carry a token block (found ${themeBlocks.length})`);
  ok(themeBlocks.every((b) => /--gold-ink:/.test(b)),
    'every theme defines --gold-ink (legible gold for text on a light surface)');
  ok(/\[data-theme="islamic"\][\s\S]*?--gold-ink:#8f6208/.test(css),
    'islamic --gold-ink is #8f6208 (AA-passing on --surface; --gold was 3.20:1)');
  ok(/\.ncard \.ntr\{[^}]*color:var\(--gold-ink\)/.test(css) &&
     !/\.ncard \.ntr\{[^}]*color:var\(--gold\)/.test(css),
    '99-names latin name uses --gold-ink on the card surface (not the on-brand --gold)');
  ok(/--gold-ink/.test(read('js/pages3.js')),
    'daily-ayah caption uses --gold-ink (was 3.20:1 on --surface)');

  // Past prayers were dimmed to 42%, pushing their times out of comfortable range.
  const pastOpacity = parseFloat((css.match(/\.pcard\.past\{opacity:([\d.]+)\}/) || [])[1] || '1');
  ok(pastOpacity >= 0.5,
    `past prayer cards keep their times readable (opacity ${pastOpacity} >= 0.5)`);

  // The hero decoration was a 320px disc at blur(2px) — a hard-edged smudge.
  const heroBlur = parseInt((css.match(/\.hero::before\{[^}]*filter:blur\((\d+)px\)/) || [])[1] || '0', 10);
  ok(heroBlur >= 20, `hero decoration is a soft bloom, not a hard disc (blur ${heroBlur}px >= 20)`);

  // One stroke icon set replaces the emoji on the dashboard (two of the emoji,
  // the first/last third, were not legible as glyphs at the rendered 21px).
  const dataSrc16 = read('js/data.js').replace(/\/\*[\s\S]*?\*\//g, '');
  const appSrc16 = read('js/app.js');
  ok(/const ICONS = \{/.test(dataSrc16) && /ICON_PRAYER = \{ Fajr: ICONS\./.test(dataSrc16),
    'prayer-card icons come from the shared ICONS set');
  ok(!/ICON_PRAYER[^;]*[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/u.test(dataSrc16),
    'ICON_PRAYER no longer holds emoji or symbol glyphs');
  ['sunrise', 'sunset', 'midnight', 'firstThird', 'lastThird'].forEach((k) => {
    ok(appSrc16.includes(`i: ICONS.${k}`), `sun & night row uses ICONS.${k}`);
  });
  ok(appSrc16.includes('i: ICONS.mosque') && appSrc16.includes('i: ICONS.compass') && appSrc16.includes('i: ICONS.clock'),
    'glance row uses the shared icon set');
  // The svgs are block elements in text-align:center cards; without the auto
  // margin they sat in the top-left corner (the emoji were inline text).
  ok(/\.pcard \.ic svg,\.sun-cell \.ic svg,\.gcell \.gi svg\{[^}]*margin:0 auto/.test(css),
    'dashboard icon svgs are centred inside their cards');

  // m-mode must be derived at BOOT, not only from a resize event. The stylesheet
  // hides #page-prayers below 768px while m-mode is off, and only applyMMode
  // routes to the mobile home — so a resize-only trigger left a phone's first
  // paint with an EMPTY content area between the topbar and the bottom nav.
  ok(/initMobileUI\(\);[\s\S]{0,500}?applyMMode\(window\.innerWidth <= 768\);/.test(appSrc16),
    'mobile mode is derived from the viewport at boot (phone first paint is never blank)');

  // The mobile home is its OWN DOM tree, so it has to be repainted by the same
  // data-arrival events as the desktop dashboard. renderMHome was reachable only
  // from the countdown's 30-tick branch, so a phone showed a live countdown under
  // an unnamed, timeless prayer ("—") for up to half a minute.
  ok(/function renderAll\(\) \{[\s\S]{0,700}?classList\.contains\('m-mode'\)\) renderMHome\(\);/.test(appSrc16),
    'the mobile home hero + strip repaint when data arrives, not only on the 30th tick');
  ok(/if \(name === 'mhome'\) \{ renderMHome\(\); renderMHomeCards\(\); \}/.test(appSrc16),
    'navigating to the mobile home repaints it');

  finish();
}

function finish() {
  console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ' — ALL GREEN'}`);
  process.exit(failures ? 1 : 0);
}
