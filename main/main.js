'use strict';

/**
 * Prayer Times — Electron main process.
 * Window + tray lifecycle, IPC bridge to the renderer, native notifications,
 * adhan overlay window, start-with-Windows.
 */

const path = require('path');
const {
  app, BrowserWindow, ipcMain, Notification, nativeImage,
} = require('electron');
const { createScheduler } = require('./scheduler');
const { createTray } = require('./tray');
const JsonStore = require('./json-store');

const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

let win = null;          // main window
let overlay = null;      // fullscreen adhan overlay
let quitting = false;    // true once the user asked to really quit
let closeToTray = true;  // setting controlled by the renderer
let shownTrayHint = false;
let trayApi = null;
let scheduler = null;
let schedulerLoop = null;
let store = null;

const isPrimary = app.requestSingleInstanceLock();
if (!isPrimary) {
  app.quit();
} else {
  if (process.platform === 'win32') {
    // Stable AppUserModelID so Windows toasts show the app name and group in the taskbar.
    app.setAppUserModelId('com.prayertimes.desktop');
  }

  store = new JsonStore({
    dir: () => app.getPath('userData'),
    name: 'pt-desktop',
    defaults: { closeToTray: true, startWithWindows: false, adhanOverlayEnabled: true },
  });
  closeToTray = !!store.get('closeToTray', true);

  // ────────────────────────────────────────────────────────────
  // Window
  // ────────────────────────────────────────────────────────────
  function createWindow() {
    win = new BrowserWindow({
      width: 1200,
      height: 780,
      minWidth: 480,
      minHeight: 520,
      show: false,
      icon: nativeImage.createFromPath(path.join(__dirname, '..', 'icon.ico')),
      backgroundColor: '#f0f5f1',
      webPreferences: {
        preload: path.join(__dirname, '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });

    win.loadFile(path.join(__dirname, '..', 'prayer-times.html'));

    win.once('ready-to-show', () => win.show());

    win.on('close', (e) => {
      if (!quitting && closeToTray && trayApi) {
        e.preventDefault();
        win.hide();
        if (!shownTrayHint) {
          shownTrayHint = true;
          notify('Prayer Times still running', 'Minimized to the system tray. Right-click its icon to quit.', () => showMainWindow());
        }
      }
    });

    win.on('closed', () => { win = null; });
  }

  // ────────────────────────────────────────────────────────────
  // Notifications
  // ────────────────────────────────────────────────────────────
  function notify(title, body, onClick) {
    if (!Notification.isSupported()) return;
    const n = new Notification({
      title,
      body,
      icon: nativeImage.createFromPath(path.join(__dirname, '..', 'icon.ico')),
    });
    if (onClick) n.on('click', onClick);
    n.show();
    return n;
  }

  function firePreAlert({ prayer, minutes, lang }) {
    const ar = lang === 'ar';
    const nm = ar ? PRAYER_AR[prayer] : prayer;
    const body = ar
      ? `تبدأ صلاة ${nm} بعد ${minutes} دقيقة`
      : `${prayer} starts in ${minutes} minute${minutes === 1 ? '' : 's'}`;
    notify('Prayer Time 🕌', body, () => showMainWindow('pagePrayers'));
  }

  function firePrayerTime({ prayer, time, lang }) {
    const ar = lang === 'ar';
    const nm = ar ? PRAYER_AR[prayer] : prayer;
    const title = ar ? `حان وقت صلاة ${nm}` : `It is time for ${prayer} (${time})`;
    const body = ar ? 'اللهم بارك لنا في اليوم' : 'May Allah accept your prayers';
    notify(title, body, () => showMainWindow('pagePrayers'));
  }

  function fireAdhanEvent({ prayer, time, lang }) {
    if (store.get('adhanOverlayEnabled', true)) {
      showOverlay({ prayer, time, lang, adhanType: store.get('adhanType', 'alafasy') });
    }
  }

  // ────────────────────────────────────────────────────────────
  // Adhan overlay (fullscreen, always-on-top, plays audio)
  // ────────────────────────────────────────────────────────────
  function showOverlay(payload) {
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('adhan:show', payload);
      overlay.show();
      overlay.focus();
      return;
    }
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workArea;
    overlay = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      fullscreen: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#0d1640',
      webPreferences: {
        preload: path.join(__dirname, 'overlay-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    overlay.loadFile(path.join(__dirname, '..', 'adhan.html'));
    overlay.once('ready-to-show', () => {
      overlay.show();
      overlay.focus();
      if (payload) overlay.webContents.send('adhan:show', payload);
    });
    overlay.on('closed', () => { overlay = null; });
  }

  function hideOverlay() {
    if (overlay && !overlay.isDestroyed()) overlay.close();
  }

  // ────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────
  function showMainWindow(page) {
    if (!win || win.isDestroyed()) createWindow();
    if (page && win && !win.isDestroyed()) win.webContents.send('pt:navigate', page);
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  function applyAutoLaunch(enabled) {
    try {
      app.setLoginItemSettings({
        openAtLogin: !!enabled,
        path: process.execPath,
        args: ['--hidden'],
      });
    } catch (e) { /* non-fatal */ }
    store.set('startWithWindows', !!enabled);
  }

  function updateTray(info) {
    if (!trayApi) return;
    trayApi.update({
      next: info && info.next ? info.next : null,
      times: info && info.times ? info.times : [],
      lang: (info && info.lang) || 'en',
    });
  }

  // ───────────────────────── IPC ──────────────────────────────
  ipcMain.on('pt:update-config', (e, cfg) => {
    if (cfg && cfg.adhanType) store.set('adhanType', String(cfg.adhanType));
    const res = scheduler.updateConfig(cfg);
    if (res.ok) updateTray(scheduler.getInfo());
  });

  ipcMain.on('pt:set-close-to-tray', (e, v) => {
    closeToTray = !!v;
    store.set('closeToTray', closeToTray);
  });

  ipcMain.on('pt:set-start-with-windows', (e, v) => {
    applyAutoLaunch(v);
  });

  ipcMain.on('pt:set-overlay-enabled', (e, v) => {
    store.set('adhanOverlayEnabled', !!v);
  });

  ipcMain.on('pt:test-alert', () => {
    // Fires a real pre-alert 3 s later so the user can see the whole pipeline.
    setTimeout(() => {
      notify('Prayer Time 🕌 (test)', 'This is how prayer alerts look. Click to open the app.', () => showMainWindow('pagePrayers'));
    }, 3000);
  });

  ipcMain.on('pt:test-overlay', () => {
    showOverlay({ prayer: 'Dhuhr', time: '12:12', lang: 'en' });
  });

  ipcMain.handle('pt:get-info', () => scheduler.getInfo());
  ipcMain.handle('pt:get-day', (e, dateISO, overrides) => {
    try { return scheduler.getDay(String(dateISO || '').slice(0, 10), overrides || {}); }
    catch (err) { return null; }
  });
  ipcMain.on('overlay:dismiss', () => hideOverlay());

  // ───────────────────────── Lifecycle ────────────────────────
  app.on('second-instance', () => showMainWindow());

  app.on('before-quit', () => { quitting = true; });

  app.on('window-all-closed', () => {
    // Keep running when close-to-tray is on; quit otherwise.
    if (!closeToTray || !trayApi) app.quit();
  });

  app.on('will-quit', () => {
    if (schedulerLoop) clearInterval(schedulerLoop);
    if (trayApi) trayApi.destroy();
  });

  app.whenReady().then(() => {
    createWindow();

    scheduler = createScheduler();
    trayApi = createTray({
      onOpen: () => showMainWindow(),
      onQuit: () => { quitting = true; app.quit(); },
      onNavigate: (page) => showMainWindow(page),
    });

    scheduler.bus.on('pre-alert', firePreAlert);
    scheduler.bus.on('prayer-time', firePrayerTime);
    scheduler.bus.on('adhan', fireAdhanEvent);
    scheduler.bus.on('times-updated', updateTray);

    // 30 s fire loop — main-process timers, immune to renderer throttling.
    schedulerLoop = setInterval(() => scheduler.tick(), 30 * 1000);
    scheduler.tick();

    if (store.get('startWithWindows', false)) applyAutoLaunch(true);

    // Auto-started hidden: don't pop the main window.
    if (process.argv.includes('--hidden')) {
      setTimeout(() => { if (win && !win.isDestroyed()) win.hide(); }, 300);
    }
  });
}
