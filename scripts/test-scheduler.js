'use strict';

/**
 * Scheduler test harness — plain Node, no Electron required.
 * Drives the REAL main-process scheduler (main/scheduler.js) with a fake
 * clock through the plan's required scenarios:
 *
 *   1. All five prayers fire exactly once (prayer-time + adhan).
 *   2. notifMin = 0 → pre-alert exactly AT prayer time (not 10 min default).
 *   3. Sleep/resume gap → missed prayer still fires exactly once (no dupes,
 *      not-yet-due prayers stay silent).
 *   4. Midnight rollover → schedule recomputed, old-day events never fire
 *      after 00:00.
 *   5. Invalid coordinates rejected.
 *   6. Hanafi vs Shafi Asr differs (madhab reaches display + schedule).
 *   7. Volume resolution: per-prayer profile → global → clamp 0..1.
 *   8. Config re-push does not re-fire already-fired prayers.
 *   9. Toggles: notif=false silences notifications but not adhan;
 *      per-prayer adhan=false silences only that prayer's adhan.
 *
 * Run: node scripts/test-scheduler.js
 */

const path = require('path');
const { createScheduler } = require(path.join(__dirname, '..', 'main', 'scheduler.js'));
const { Coordinates, CalculationMethod, PrayerTimes, Prayer, Madhab } = require('adhan');
const EngineRef = require(path.join(__dirname, '..', 'shared', 'pt-engine.js'));

let checks = 0, failures = 0;
function ok(cond, msg) {
  checks++;
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}
function section(name) { console.log('\n— ' + name + ' —'); }

const BASE_CFG = {
  lat: 21.3891, lon: 39.8579, method: '4', madhab: 'shafi',
  offsets: {}, notif: true, notifMin: 10, adhan: true, adhanPerPrayer: {},
  adhanVol: 0.5, adhanType: 'alafasy', lang: 'en', tz: '', preMin: {}, adhanProfiles: {},
};

/** Real prayer instants for the day containing `when` (same engine as scheduler). */
function prayerDates(cfg, when) {
  const params = CalculationMethod.UmmAlQura();
  if (cfg.madhab === 'hanafi') params.madhab = Madhab.Hanafi;
  const pt = new PrayerTimes(new Coordinates(cfg.lat, cfg.lon), new Date(when), params);
  return ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((p) => pt.timeForPrayer(Prayer[p]));
}

function makeApp(cfgOverrides = {}, startAtMs = null) {
  const cfg = { ...BASE_CFG, ...cfgOverrides };
  const s = createScheduler();
  const events = [];
  for (const ev of ['pre-alert', 'prayer-time', 'adhan', 'times-updated']) {
    s.bus.on(ev, (p) => events.push({ ev, ...p }));
  }
  // Fake clock anchored BEFORE today's prayers (00:05 local) unless told
  // otherwise — forward-only from there, like a real clock.
  let now = startAtMs != null ? startAtMs : todayAt(0, 5, 0);
  s._setClock(() => now);
  const res = s.updateConfig(cfg);
  if (!res.ok) throw new Error('config rejected: ' + res.error);
  s.tick();
  return {
    events, s,
    set now(ms) { now = ms; },
    get now() { return now; },
    tick() { s.tick(); },
    count(ev, prayer) { return events.filter((e) => e.ev === ev && (!prayer || e.prayer === prayer)).length; },
    clear() { events.length = 0; },
  };
}

const MIN = 60 * 1000;
const todayAt = (h, m, s = 0) => { const d = new Date(); d.setHours(h, m, s, 0); return d.getTime(); };
const NOON = todayAt(12, 0, 0);

/* ── 1. All five prayers fire exactly once ─────────────────────────────── */
section('1. Five prayers fire exactly once');
{
  const app = makeApp();
  const dates = prayerDates(BASE_CFG, NOON);
  for (const at of dates) {
    app.now = at.getTime() + 5 * 1000;
    app.tick(); app.tick(); // two ticks in the same instant — must not dupe
  }
  ok(app.count('prayer-time') === 5, 'exactly 5 prayer-time notifications (got ' + app.count('prayer-time') + ')');
  ok(app.count('adhan') === 5, 'exactly 5 adhan events (got ' + app.count('adhan') + ')');
  for (const p of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
    ok(app.count('prayer-time', p) === 1 && app.count('adhan', p) === 1, `${p}: 1 notification + 1 adhan`);
  }
  ok(app.events.every((e) => e.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(e.dayKey)), 'events carry YYYY-MM-DD dedup day keys');
}

/* ── 2. notifMin = 0 → pre-alert AT prayer time ────────────────────────── */
section('2. notifMin = 0');
{
  const app = makeApp({ notifMin: 0 });
  const [fajr, dhuhr] = prayerDates(BASE_CFG, NOON);
  app.now = fajr.getTime() - 60 * 1000; app.tick();
  ok(app.count('pre-alert') === 0, 'no pre-alert one minute before (0 means 0, not 10)');
  app.now = fajr.getTime() + 5 * 1000; app.tick();
  const pre = app.events.find((e) => e.ev === 'pre-alert');
  ok(app.count('pre-alert') === 1 && pre && pre.minutes === 0, 'pre-alert fires at T−0 with minutes=0');
  ok(app.count('prayer-time', 'Fajr') === 1 && app.count('adhan', 'Fajr') === 1, 'prayer-time + adhan unaffected by pre-alert tracking');
  app.now = dhuhr.getTime() - 5 * 60 * 1000; app.tick();
  ok(app.count('pre-alert') === 1, 'Dhuhr pre-alert (T−0) does not fire early at T−5min');
}

/* ── 3. Sleep/resume gap recovery ──────────────────────────────────────── */
section('3. Sleep/resume missed-window recovery');
{
  const app = makeApp();
  const dates = prayerDates(BASE_CFG, NOON);
  const [fajr, dhuhr, asr] = dates;
  app.now = fajr.getTime() + 5 * 1000; app.tick();
  ok(app.count('prayer-time', 'Fajr') === 1, 'Fajr fires normally');

  // "Sleep" for 3 hours: no ticks between Fajr and well past Dhuhr.
  app.now = dhuhr.getTime() + 45 * MIN; app.s.notifyResumed();
  ok(app.count('prayer-time', 'Dhuhr') === 1 && app.count('adhan', 'Dhuhr') === 1, 'Dhuhr recovered exactly once after 3h sleep gap');
  ok(app.count('pre-alert', 'Dhuhr') === 0, 'no spurious Dhuhr pre-alert after the gap');
  ok(app.count('prayer-time', 'Asr') === 0, 'Asr (still in the future) does not fire early');

  // Duplicate-tick hardening right after resume.
  app.tick(); app.tick();
  ok(app.count('prayer-time', 'Dhuhr') === 1, 'resume + repeated ticks never duplicate Dhuhr');

  // Pre-alert that fell entirely inside the gap still fires (once).
  const app2 = makeApp({}, todayAt(0, 5, 0));
  app2.now = asr.getTime() - 20 * MIN; app2.tick();
  ok(app2.count('pre-alert', 'Asr') === 0, 'no pre-alert before its time');
  app2.now = asr.getTime() - 3 * MIN; app2.s.notifyResumed();
  ok(app2.count('pre-alert', 'Asr') === 1, 'pre-alert whose moment passed during a gap fires on resume (once)');
}

/* ── 4. Midnight rollover ──────────────────────────────────────────────── */
section('4. Midnight rollover (23:59 → 00:00 → 00:01)');
{
  // 4a. Isha fired before midnight must NOT fire again after.
  const app = makeApp();
  const dates = prayerDates(BASE_CFG, NOON);
  const isha = dates[4];
  app.now = isha.getTime() + 5 * 1000; app.tick();
  const firedBefore = app.count('prayer-time', 'Isha');
  // Advance to 23:59:30 local, then cross midnight.
  const mid = new Date(); mid.setHours(23, 59, 30, 0);
  app.now = mid.getTime(); app.tick();
  app.now = mid.getTime() + 45 * 1000; app.tick(); app.tick(); // 00:00:15
  ok(app.count('prayer-time', 'Isha') === firedBefore, 'yesterday Isha never re-fires after midnight');
  const info = app.s.getInfo();
  ok(info && info.dayKey === app.s._state.dayKey, 'schedule dayKey consistent after rollover');
  ok(app.s._state.firedPrayerKeys.size <= 5, 'old-day fire keys pruned (got ' + app.s._state.firedPrayerKeys.size + ')');
  const fajrNext = new Date(app.now); // next prayer must be tomorrow's Fajr (or later today)
  ok(info && info.next && info.next.prayer === 'Fajr', 'next prayer after midnight is Fajr');

  // 4b. A prayer that passed but never fired cannot fire after midnight.
  // Anchor late in the evening (23:00) so yesterday's Isha is outside the
  // first window — like a scheduler running normally through the evening.
  const app2 = makeApp({}, todayAt(23, 0, 0));
  app2.now = mid.getTime(); app2.tick(); // 23:59:30 — Isha (19:41) not in window
  app2.now = mid.getTime() + 60 * 1000; app2.tick();
  ok(app2.count('prayer-time') === 0 && app2.count('adhan') === 0, 'old-day unfired prayer does not fire after 00:00');
  // And tomorrow's Fajr (hours ahead) stays quiet.
  app2.now = mid.getTime() + 3 * 60 * 1000; app2.tick();
  ok(app2.count('adhan') === 0, 'no future Fajr fire at 00:04');
}

/* ── 5. Invalid coordinates ────────────────────────────────────────────── */
section('5. Invalid coordinates rejected');
{
  const s = createScheduler();
  for (const [lat, lon] of [[NaN, 39.8], [21.4, Infinity], [95, 39.8], [21.4, -200], ['', 39.8]]) {
    const res = s.updateConfig({ ...BASE_CFG, lat, lon });
    ok(res.ok === false, `rejected lat=${JSON.stringify(lat)} lon=${JSON.stringify(lon)}`);
  }
  const good = s.updateConfig({ ...BASE_CFG });
  ok(good.ok === true, 'valid coordinates accepted');
}

/* ── 6. Madhab (Hanafi) reaches display AND schedule ───────────────────── */
section('6. Hanafi Asr (display == scheduler)');
{
  const shafi = createScheduler();
  const hanafi = createScheduler();
  shafi.updateConfig({ ...BASE_CFG, madhab: 'shafi' });
  hanafi.updateConfig({ ...BASE_CFG, madhab: 'hanafi' });
  const dISO = new Date().toISOString().slice(0, 10);
  const dShafi = shafi.getDay(dISO, {});
  const dHanafi = hanafi.getDay(dISO, {});
  ok(dShafi && dHanafi && dShafi.timings.Asr !== dHanafi.timings.Asr,
    `Asr differs (shafi ${dShafi.timings.Asr} vs hanafi ${dHanafi.timings.Asr})`);
  const info = hanafi.getInfo();
  const asrInfo = info.times.find((x) => x.prayer === 'Asr');
  ok(asrInfo && asrInfo.time === dHanafi.timings.Asr, 'scheduled Asr string == displayed (hanafi) Asr');
  // getDay override madhab also works (calendar path)
  const dOverride = hanafi.getDay(dISO, { madhab: 'shafi' });
  ok(dOverride.timings.Asr === dShafi.timings.Asr, 'getDay madhab override respected');
}

/* ── 7. Volume resolution ──────────────────────────────────────────────── */
section('7. Adhan volume resolution');
{
  const app = makeApp({ adhanVol: 0.5, adhanProfiles: { Maghrib: { vol: 0.3 } } });
  const dates = prayerDates(BASE_CFG, NOON);
  app.now = dates[3].getTime() + 5 * 1000; app.tick(); // Maghrib
  const maghrib = app.events.find((e) => e.ev === 'adhan' && e.prayer === 'Maghrib');
  ok(maghrib && Math.abs(maghrib.volume - 0.3) < 1e-9, 'per-prayer profile volume wins (0.3)');
  app.now = dates[4].getTime() + 5 * 1000; app.tick(); // Isha
  const isha = app.events.find((e) => e.ev === 'adhan' && e.prayer === 'Isha');
  ok(isha && isha.volume === 0.5, 'global volume used when no profile (0.5)');

  const app2 = makeApp({ adhanVol: 7 });
  app2.now = prayerDates(BASE_CFG, NOON)[0].getTime() + 5 * 1000; app2.tick();
  const fajr = app2.events.find((e) => e.ev === 'adhan');
  ok(fajr && fajr.volume === 1, 'out-of-range volume clamped to 1 (got ' + (fajr && fajr.volume) + ')');
  const app3 = makeApp({ adhanVol: -2 });
  app3.now = prayerDates(BASE_CFG, NOON)[0].getTime() + 5 * 1000; app3.tick();
  const fajr3 = app3.events.find((e) => e.ev === 'adhan');
  ok(fajr3 && fajr3.volume === 0, 'negative volume clamped to 0');
}

/* ── 10. Location-timezone day (B1) ───────────────────────────────────── */
section('10. Location-timezone day: schedule follows cfg.tz, not the device');
{
  // The device here runs at a UTC+X local offset. Anchoring the fake clock
  // at 21:30 UTC puts the device's calendar day at UTC+X+21:30 while Tokyo
  // is already on the NEXT calendar day (06:30 +09:00) — exactly the skew
  // that used to make the scheduler compute the wrong day.
  const base = Date.UTC(2026, 8, 29, 21, 30, 0, 0);
  const app = makeApp({ ...BASE_CFG, tz: 'Asia/Tokyo', offsets: {} }, base);
  ok(app.s._state.dayKey === '2026-09-30',
    `dayKey is the LOCATION's calendar day (got ${app.s._state.dayKey}, want 2026-09-30)`);
  const info = app.s.getInfo();
  const tTokyo = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
  const instants = EngineRef.computeDayInstant({ lat: BASE_CFG.lat, lon: BASE_CFG.lon, method: BASE_CFG.method, madhab: BASE_CFG.madhab, tz: 'Asia/Tokyo' }, 2026, 9, 30, { Coordinates, CalculationMethod, PrayerTimes, Madhab }).instants;
  const want = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].map((p) => tTokyo(instants[p]));
  const got = info.times.map((x) => x.time);
  ok(JSON.stringify(got) === JSON.stringify(want),
    `info.times match the location-zoned calculation day (got ${got.join(',')} / want ${want.join(',')})`);

  // Fajr fires when its absolute instant passes, even though the device is
  // still on the previous calendar date (pre-fix it was computed for the
  // wrong day and never fired).
  const [fajrTokyo] = ['Fajr'].map(() => instants.Fajr);
  app.now = fajrTokyo + 5 * 1000; app.tick();
  ok(app.count('prayer-time', 'Fajr') === 1 && app.count('adhan', 'Fajr') === 1,
    'Fajr fires at its absolute instant while the device day is still yesterday');

  // Empty tz keeps the legacy device-local behavior (regression guard).
  const legacy = makeApp({ ...BASE_CFG, tz: '', offsets: {} }, todayAt(0, 5, 0));
  const legacyKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  ok(legacy.s._state.dayKey === legacyKey, 'tz: "" keeps device-local day (legacy path unchanged)');
}

/* ── 8. Config re-push does not re-fire ────────────────────────────────── */
section('8. Config re-push / recompute dedup');
{
  const app = makeApp();
  const [fajr] = prayerDates(BASE_CFG, NOON);
  app.now = fajr.getTime() + 5 * 1000; app.tick();
  ok(app.count('adhan', 'Fajr') === 1, 'Fajr fired');
  app.s.updateConfig({ ...BASE_CFG, adhanVol: 0.9 }); // harmless change → recompute path skipped, push anyway
  app.s.recompute();
  app.now = fajr.getTime() + 65 * 1000; app.tick();
  ok(app.count('adhan', 'Fajr') === 1 && app.count('prayer-time', 'Fajr') === 1, 'recompute + later tick never re-fires Fajr');
}

/* ── 9. Toggles ────────────────────────────────────────────────────────── */
section('9. Notification / per-prayer toggles');
{
  const app = makeApp({ notif: false });
  const dates = prayerDates(BASE_CFG, NOON);
  app.now = dates[0].getTime() + 5 * 1000; app.tick();
  ok(app.count('prayer-time') === 0 && app.count('adhan', 'Fajr') === 1, 'notif=false: no notification, adhan still fires');

  const app2 = makeApp({ adhanPerPrayer: { Asr: false } });
  app2.now = dates[2].getTime() + 5 * 1000; app2.tick();
  ok(app2.count('adhan', 'Asr') === 0 && app2.count('prayer-time', 'Asr') === 1, 'per-prayer adhan=false: silent adhan, notification kept');
  app2.now = dates[3].getTime() + 5 * 1000; app2.tick();
  ok(app2.count('adhan', 'Maghrib') === 1, 'other prayers unaffected by per-prayer mute');
}

/* ── Summary ───────────────────────────────────────────────────────────── */
console.log(`\n${checks - failures}/${checks} checks passed${failures ? ` — ${failures} FAILED` : ' — ALL GREEN'}`);
process.exit(failures ? 1 : 0);
