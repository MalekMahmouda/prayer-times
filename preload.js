'use strict';

/**
 * Preload — secure bridge between prayer-times.html and the Electron main process.
 * Everything is optional from the renderer's point of view: if `window.ptDesktop`
 * is absent (plain browser), the app keeps working exactly as before.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Offline coordinate→IANA-timezone lookup (shared with main process).
// Injected into the renderer world; tz-lookup is a tiny pure-data package.
try { contextBridge.exposeInMainWorld('tzLookup', require('tz-lookup')); } catch (e) { /* optional */ }

// Canonical page ids (match gotoPage() in app.js and the tray contract).
const VALID_PAGES = new Set(['prayers', 'calendar', 'qibla', 'quran', 'names', 'dhikr', 'stats', 'settings']);

/** Explicit minutes-before validation: 0 is valid; invalid → default; clamp range. */
function parseNotifMin(v, def = 10, min = 0, max = 120) {
  if (v == null || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.round(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/** Clamp adhan volume to 0.0–1.0 (invalid → fallback). */
function parseVol(v, fallback = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

contextBridge.exposeInMainWorld('ptDesktop', {
  /** Push scheduler config (location, method, offsets, toggles, language). */
  updateConfig: (cfg) => {
    try {
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      return ipcRenderer.invoke('pt:update-config', {
        lat: (c.lat == null || c.lat === '') ? null : Number(c.lat),
        lon: (c.lon == null || c.lon === '') ? null : Number(c.lon),
        method: String(c.method || '4'),
        offsets: c.offsets && typeof c.offsets === 'object' ? c.offsets : {},
        notifMin: parseNotifMin(c.notifMin),
        notif: !!c.notif,
        beep: !!c.beep,
        adhan: !!c.adhan,
        // v1.3.2 P10: adhanEnabled is the ONE authoritative azan switch.
        // Legacy `adhan` is honored only when adhanEnabled is absent.
        adhanEnabled: !!(c.adhanEnabled != null ? c.adhanEnabled : c.adhan),
        adhanPerPrayer: c.adhanPerPrayer && typeof c.adhanPerPrayer === 'object' ? c.adhanPerPrayer : {},
        adhanType: typeof c.adhanType === 'string' ? c.adhanType : 'alafasy',
        adhanVol: parseVol(c.adhanVol, 1),
        adhanProfiles: c.adhanProfiles && typeof c.adhanProfiles === 'object' ? c.adhanProfiles : {},
        madhab: c.madhab === 'hanafi' ? 'hanafi' : 'shafi',
        lang: c.lang === 'ar' ? 'ar' : 'en',
        tz: typeof c.tz === 'string' ? c.tz : '',
        preMin: c.preMin && typeof c.preMin === 'object' ? c.preMin : {},
      });
    } catch (e) { return Promise.resolve({ ok: false, error: 'bridge' }); } // never break the renderer
  },

  setCloseToTray: (v) => ipcRenderer.send('pt:set-close-to-tray', !!v),
  setStartWithWindows: (v) => ipcRenderer.send('pt:set-start-with-windows', !!v),
  setOverlayEnabled: (v) => ipcRenderer.send('pt:set-overlay-enabled', !!v),
  /** One-way renderer diagnostics → main → azan-debug.log (v1.3.2 P9). */
  debug: (msg, data) => { try { ipcRenderer.send('pt:debug', String(msg == null ? '' : msg).slice(0, 300), data == null ? null : data); } catch (e) { /* never break the renderer */ } },
  setTheme: (id, isDark) => {
    try { if (typeof id === 'string' && id.length < 40) ipcRenderer.send('pt:set-theme', { id, isDark }); } catch (e) {}
  },
  widgetToggle: (wanted) => ipcRenderer.send('widget:toggle', !!wanted),
  miniToggle: (wanted) => ipcRenderer.send('mini:toggle', !!wanted),
  /** Push of scheduler info to the main renderer (dashboard refresh). */
  onInfo: (cb) => ipcRenderer.on('pt:info', (e, payload) => cb(payload)),

  /** Fires a real notification after ~3 s so the user can preview alerts. */
  testAlert: () => ipcRenderer.send('pt:test-alert'),

  /** Opens the fullscreen adhan overlay with the real configured audio/volume (test). */
  testOverlay: () => ipcRenderer.send('pt:test-overlay'),

  /** Today's computed times / next prayer from the main-process scheduler. */
  getInfo: () => ipcRenderer.invoke('pt:get-info'),

  /** App version (package.json) for the Settings About line. */
  getVersion: () => ipcRenderer.invoke('pt:get-version').catch(() => ''),

  /** Full timings + sun/night times for an arbitrary date (offline, main process). */
  getDay: (dateISO, overrides) => ipcRenderer.invoke('pt:get-day', dateISO, overrides),

  /** Main → renderer events. */
  onNavigate: (cb) => {
    ipcRenderer.on('pt:navigate', (e, page) => { if (VALID_PAGES.has(page)) cb(page); });
  },
});
