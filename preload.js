'use strict';

/**
 * Preload — secure bridge between prayer-times.html and the Electron main process.
 * Everything is optional from the renderer's point of view: if `window.ptDesktop`
 * is absent (plain browser), the app keeps working exactly as before.
 */

const { contextBridge, ipcRenderer } = require('electron');

const VALID_PAGES = new Set(['pagePrayers', 'pageQibla', 'pageAsma', 'pageQuran']);

contextBridge.exposeInMainWorld('ptDesktop', {
  /** Push scheduler config (location, method, offsets, toggles, language). */
  updateConfig: (cfg) => {
    try {
      const c = cfg && typeof cfg === 'object' ? cfg : {};
      ipcRenderer.send('pt:update-config', {
        lat: (c.lat == null || c.lat === '') ? null : Number(c.lat),
        lon: (c.lon == null || c.lon === '') ? null : Number(c.lon),
        method: String(c.method || '4'),
        offsets: c.offsets && typeof c.offsets === 'object' ? c.offsets : {},
        notifMin: Number(c.notifMin) || 10,
        notif: !!c.notif,
        beep: !!c.beep,
        adhan: !!c.adhan,
        adhanPerPrayer: c.adhanPerPrayer && typeof c.adhanPerPrayer === 'object' ? c.adhanPerPrayer : {},
        adhanType: typeof c.adhanType === 'string' ? c.adhanType : 'alafasy',
        madhab: c.madhab === 'hanafi' ? 'hanafi' : 'shafi',
        lang: c.lang === 'ar' ? 'ar' : 'en',
      });
    } catch (e) { /* never break the renderer */ }
  },

  setCloseToTray: (v) => ipcRenderer.send('pt:set-close-to-tray', !!v),
  setStartWithWindows: (v) => ipcRenderer.send('pt:set-start-with-windows', !!v),
  setOverlayEnabled: (v) => ipcRenderer.send('pt:set-overlay-enabled', !!v),
  setTheme: (id) => { try { if (typeof id === 'string' && id.length < 40) ipcRenderer.send('pt:set-theme', id); } catch (e) {} },
  widgetToggle: (wanted) => ipcRenderer.send('widget:toggle', !!wanted),
  miniToggle: (wanted) => ipcRenderer.send('mini:toggle', !!wanted),
  /** Push of scheduler info to the main renderer (dashboard refresh). */
  onInfo: (cb) => ipcRenderer.on('pt:info', (e, payload) => cb(payload)),

  /** Fires a real notification after ~3 s so the user can preview alerts. */
  testAlert: () => ipcRenderer.send('pt:test-alert'),

  /** Opens the fullscreen adhan overlay with a fake prayer (test). */
  testOverlay: () => ipcRenderer.send('pt:test-overlay'),

  /** Today's computed times / next prayer from the main-process scheduler. */
  getInfo: () => ipcRenderer.invoke('pt:get-info'),

  /** Full timings + sun/night times for an arbitrary date (offline, main process). */
  getDay: (dateISO, overrides) => ipcRenderer.invoke('pt:get-day', dateISO, overrides),

  /** Main → renderer events. */
  onNavigate: (cb) => {
    ipcRenderer.on('pt:navigate', (e, page) => { if (VALID_PAGES.has(page)) cb(page); });
  },
});
