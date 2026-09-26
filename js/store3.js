'use strict';

/* ════════════════════════════════════════════════════════════
   store3 — Phase 3 storage layer.
   Additive only: existing keys (pts/ptl/ptt/ptlg) are untouched.
   One versioned key 'pt3':
   { version, history, dhikrFavs, bookmarks, locations, prefs, customThemes }
   Every value passes validation on load, save, and import.
   ════════════════════════════════════════════════════════════ */

const PT3_KEY = 'pt3';
const PT3_VERSION = 1;

const P3 = { Prayer: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] };

/* ── validators ── */
function isStr(v, max = 500) { return typeof v === 'string' && v.length <= max; }
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function isDateKey(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }
function isColor(v) { return typeof v === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v); }
function isRecordState(v) { return v === 'done' || v === 'missed' || v === ''; }

function validateHistory(h) {
  const out = {};
  if (!h || typeof h !== 'object' || Array.isArray(h)) return out;
  for (const [day, rec] of Object.entries(h)) {
    if (!isDateKey(day) || !rec || typeof rec !== 'object' || Array.isArray(rec)) continue;
    const entry = {};
    for (const p of P3.Prayer) {
      const v = rec[p];
      entry[p] = isRecordState(v) ? v : '';
    }
    // ignore unknown extra fields silently (forward compatibility)
    out[day] = entry;
  }
  return out;
}

function validateBookmarks(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 2000).filter((b) => b && typeof b === 'object'
    && isNum(b.surah) && b.surah >= 1 && b.surah <= 114
    && isNum(b.ayah) && b.ayah >= 1 && b.ayah <= 286
    && isNum(b.ts)).map((b) => ({
    surah: Math.round(b.surah), ayah: Math.round(b.ayah), ts: b.ts,
    note: isStr(b.note, 300) ? b.note : '',
  }));
}

function validateLocations(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 50).filter((l) => l && typeof l === 'object'
    && isStr(l.id, 60) && isNum(l.latitude) && Math.abs(l.latitude) <= 90
    && isNum(l.longitude) && Math.abs(l.longitude) <= 180).map((l) => ({
    id: l.id,
    name: isStr(l.name, 60) ? l.name : (isStr(l.city, 60) ? l.city : 'Location'),
    latitude: l.latitude, longitude: l.longitude,
    city: isStr(l.city, 80) ? l.city : '',
    country: isStr(l.country, 80) ? l.country : '',
    // IANA timezone only when it looks like one; empty string = "system/unknown"
    timezone: isStr(l.timezone, 60) && /^[A-Za-z_]+\/[A-Za-z_+\-0-9]+$|^UTC$/.test(l.timezone) ? l.timezone : '',
  }));
}

function validateDhikrFavs(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((x) => isStr(x, 60)))].slice(0, 200);
}

function validateCustomThemes(list) {
  if (!Array.isArray(list)) return [];
  const TOKEN_KEYS = ['bg', 'surface', 'primary', 'text', 'border', 'accent',
    'hFajr', 'hDhuhr', 'hAsr', 'hMaghrib', 'hIsha'];
  const seen = new Set();
  const out = [];
  for (const th of list) {
    if (!th || typeof th !== 'object' || !isStr(th.id, 40) || !isStr(th.name, 40)) continue;
    if (seen.has(th.id)) continue;
    const tk = th.tokens;
    if (!tk || typeof tk !== 'object') continue;
    const tokens = {};
    let ok = true;
    for (const k of TOKEN_KEYS) {
      if (!isColor(tk[k])) { ok = false; break; }
      tokens[k] = tk[k];
    }
    if (!ok) continue;
    seen.add(th.id);
    out.push({ id: th.id, name: th.name, tokens });
  }
  return out.slice(0, 20);
}

function validatePrefs(p) {
  const out = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
  // reader prefs
  if (isNum(p.readerFont)) out.readerFont = Math.min(48, Math.max(16, p.readerFont));
  if (isNum(p.readerLine)) out.readerLine = Math.min(2.6, Math.max(1.3, p.readerLine));
  if (p.readerDark === true || p.readerDark === false) out.readerDark = p.readerDark;
  if (p.readerTr === true || p.readerTr === false) out.readerTr = p.readerTr;
  if (isNum(p.lastSurah) && p.lastSurah >= 1 && p.lastSurah <= 114) out.lastSurah = Math.round(p.lastSurah);
  if (isNum(p.lastAyah) && p.lastAyah >= 1 && p.lastAyah <= 286) out.lastAyah = Math.round(p.lastAyah);
  // ramadan imsak estimate (NOT authoritative — UI must label it an estimate)
  if (p.ramadan && typeof p.ramadan === 'object') {
    out.ramadan = {
      imsakMode: p.ramadan.imsakMode === 'custom' ? 'custom' : 'fajrOffset',
      imsakOffset: isNum(p.ramadan.imsakOffset) ? Math.min(30, Math.max(0, p.ramadan.imsakOffset)) : 10,
    };
  }
  // daily content toggle
  if (p.dailyContent === true || p.dailyContent === false) out.dailyContent = p.dailyContent;
  // dhikr library per-item progress counters
  if (p.dhikrProg && typeof p.dhikrProg === 'object' && !Array.isArray(p.dhikrProg)) {
    const prog = {};
    for (const [k, v] of Object.entries(p.dhikrProg)) {
      if (isStr(k, 60) && isNum(v) && v >= 0 && v <= 100000) prog[k] = Math.round(v);
    }
    out.dhikrProg = prog;
  }
  // active saved location id
  if (isStr(p.activeLoc, 60)) out.activeLoc = p.activeLoc;
  // per-location adhan profiles live in cfg (pts); nothing here
  return out;
}

function sanitize(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    version: PT3_VERSION,
    history: validateHistory(r.history),
    dhikrFavs: validateDhikrFavs(r.dhikrFavs),
    bookmarks: validateBookmarks(r.bookmarks),
    locations: validateLocations(r.locations),
    prefs: validatePrefs(r.prefs),
    customThemes: validateCustomThemes(r.customThemes),
  };
}

/* ── load / save / merge ── */
function pt3Load() {
  try {
    const raw = localStorage.getItem(PT3_KEY);
    if (!raw) return sanitize({});
    const parsed = JSON.parse(raw);
    // version gate: only version 1 supported; unknown future versions rejected (kept untouched)
    if (parsed && typeof parsed === 'object' && parsed.version !== PT3_VERSION) {
      console.warn('[pt3] unsupported version', parsed.version, '— starting fresh (your old key is preserved)');
      return sanitize({});
    }
    return sanitize(parsed);
  } catch (e) {
    console.warn('[pt3] load failed:', e && e.message);
    return sanitize({});
  }
}

function pt3Save(db) {
  try {
    localStorage.setItem(PT3_KEY, JSON.stringify(sanitize(db)));
  } catch (e) {
    console.warn('[pt3] save failed:', e && e.message);
  }
}

/** Deep-merge a validated partial patch onto the current db. Arrays are replaced wholesale. */
function pt3Merge(db, patch) {
  const clean = sanitize({ ...db, ...patch, version: PT3_VERSION });
  return clean;
}

/* ── history helpers (three-state, explicit recording ONLY) ── */
const HISTORY_STATES = ['', 'done', 'missed']; // Not recorded → Completed → Missed → Not recorded

function historyGet(db, dateKey) {
  const rec = db.history[dateKey];
  return { Fajr: '', Dhuhr: '', Asr: '', Maghrib: '', Isha: '', ...(rec || {}) };
}

/** Cycle one prayer's state; returns next state. Never called automatically. */
function historyCycle(db, dateKey, prayer) {
  if (!P3.Prayer.includes(prayer) || !isDateKey(dateKey)) return null;
  const rec = historyGet(db, dateKey);
  const idx = HISTORY_STATES.indexOf(rec[prayer] === undefined ? '' : rec[prayer]);
  const next = HISTORY_STATES[(idx + 1) % HISTORY_STATES.length];
  if (next === '') delete rec[prayer]; else rec[prayer] = next;
  if (Object.keys(rec).length === 0) delete db.history[dateKey]; else db.history[dateKey] = rec;
  return next;
}

/* ── statistics (deterministic, record-based, neutral labels) ── */
function statsForRange(db, fromKey, toKey) {
  let completed = 0, missed = 0, recorded = 0, days = 0;
  for (const [day, rec] of Object.entries(db.history)) {
    if (day < fromKey || day > toKey) continue;
    days++;
    for (const p of P3.Prayer) {
      if (rec[p] === 'done') { completed++; recorded++; }
      else if (rec[p] === 'missed') { missed++; recorded++; }
    }
  }
  return { days, completed, missed, recorded };
}

/** Streak = consecutive days (ending today or yesterday) with ≥1 recorded prayer. */
function streaks(db) {
  const dayHasRecord = (d) => {
    const rec = db.history[d.toISOString().slice(0, 10)];
    return rec && P3.Prayer.some((p) => rec[p] === 'done' || rec[p] === 'missed');
  };
  // current: walk back from today
  let current = 0;
  const cur = new Date();
  if (!dayHasRecord(cur)) cur.setDate(cur.getDate() - 1); // today may not be recorded yet
  while (dayHasRecord(cur)) { current++; cur.setDate(cur.getDate() - 1); }
  // longest: scan all recorded days
  const days = Object.keys(db.history)
    .filter((k) => db.history[k] && P3.Prayer.some((p) => db.history[k][p] === 'done' || db.history[k][p] === 'missed'))
    .sort();
  let longest = 0, run = 0, prev = null;
  for (const k of days) {
    const d = new Date(k + 'T12:00:00');
    if (prev && (d - prev) === 86400000) run++; else run = 1;
    prev = d;
    if (run > longest) longest = run;
  }
  return { current, longest: Math.max(longest, current) };
}

/* export to window (plain script, no modules) */
window.Store3 = {
  KEY: PT3_KEY, VERSION: PT3_VERSION, PRAYERS: P3.Prayer,
  load: pt3Load, save: pt3Save, merge: pt3Merge,
  historyGet, historyCycle, HISTORY_STATES,
  statsForRange, streaks,
};
