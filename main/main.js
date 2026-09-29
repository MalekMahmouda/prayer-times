'use strict';

/**
 * Prayer Times — Electron main process.
 * Window + tray lifecycle, IPC bridge to the renderer, native notifications,
 * adhan overlay window (local bundled audio, configured volume), widget/mini
 * consumers, start-with-Windows, sleep/resume recovery.
 *
 * The main process is THE scheduler: it decides when prayers happen.
 * The renderer only presents information.
 */

const path = require('path');
const {
  app, BrowserWindow, ipcMain, Notification, nativeImage, Menu, powerMonitor,
} = require('electron');
const { createScheduler } = require('./scheduler');
const { createTray } = require('./tray');
const JsonStore = require('./json-store');
const { resolveAdhanAudio, clampVolume } = require('./adhan-files');

const PRAYER_AR = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

// Branding icon (assets/icon.ico in both dev and packaged layouts).
const APP_ICON = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.ico'));

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

  // No application menu: the window keeps its native title bar, and the default
  // File/Edit/View/Window/Help menu (with its shortcut keys) is never shown.
  Menu.setApplicationMenu(null);


  store = new JsonStore({
    dir: () => app.getPath('userData'),
    name: 'pt-desktop',
    defaults: { closeToTray: true, startWithWindows: false, adhanOverlayEnabled: true },
  });
  closeToTray = !!store.get('closeToTray', true);

  // Dev-only main-process logging (quiet in packaged builds).
  const dlog = (...a) => { if (process.env.PT_DEBUG === '1' || !app.isPackaged) console.log('[Main]', ...a); };

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
      icon: APP_ICON,
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
      icon: APP_ICON,
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
    notify('Prayer Time 🕌', body, () => showMainWindow('prayers'));
  }

  function firePrayerTime({ prayer, time, lang }) {
    const ar = lang === 'ar';
    const nm = ar ? PRAYER_AR[prayer] : prayer;
    const title = ar ? `حان وقت صلاة ${nm}` : `It is time for ${prayer} (${time})`;
    const body = ar ? 'اللهم بارك لنا في اليوم' : 'May Allah accept your prayers';
    notify(title, body, () => showMainWindow('prayers'));
  }

  function fireAdhanEvent({ prayer, time, lang, volume }) {
    // The notification is never blocked by the overlay (or its audio).
    const id = store.get('adhanType', 'alafasy');
    const resolved = resolveAdhanAudio(id);
    dlog(`Adhan audio: ${resolved.kind} → ${resolved.file || resolved.src}`);
    if (store.get('adhanOverlayEnabled', true)) {
      showOverlay({
        prayer,
        nameAr: PRAYER_AR[prayer] || prayer,
        nameEn: prayer,
        time,
        lang: lang || 'en',
        audioSrc: resolved.src,
        audioKind: resolved.kind,
        volume: clampVolume(volume, 1),
      });
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

  // Self-heal after an upgrade/reinstall: re-register startup against the
  // CURRENT executable path when the setting is enabled.
  function refreshAutoLaunchPath() {
    if (store.get('startWithWindows', false)) applyAutoLaunch(true);
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
  ipcMain.handle('pt:update-config', (e, cfg) => {
    if (cfg && cfg.adhanType) store.set('adhanType', String(cfg.adhanType));
    if (cfg && cfg.adhanVol != null) store.set('adhanVol', clampVolume(cfg.adhanVol, 1));
    const res = scheduler.updateConfig(cfg);
    if (res.ok) updateTray(scheduler.getInfo());
    return res;
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
      notify('Prayer Time 🕌 (test)', 'This is how prayer alerts look. Click to open the app.', () => showMainWindow('prayers'));
    }, 3000);
  });

  ipcMain.on('pt:test-overlay', () => {
    // Full pipeline test: resolve the real selected audio, real configured volume.
    const id = store.get('adhanType', 'alafasy');
    const resolved = resolveAdhanAudio(id);
    showOverlay({
      prayer: 'Dhuhr',
      nameAr: PRAYER_AR.Dhuhr,
      nameEn: 'Dhuhr',
      time: '12:12',
      lang: 'en',
      audioSrc: resolved.src,
      audioKind: resolved.kind,
      volume: clampVolume(store.get('adhanVol', 1), 1),
    });
  });

  ipcMain.handle('pt:get-info', () => scheduler.getInfo());
  ipcMain.handle('pt:get-version', () => app.getVersion());
  ipcMain.handle('pt:get-day', (e, dateISO, overrides) => {
    try { return scheduler.getDay(String(dateISO || '').slice(0, 10), overrides || {}); }
    catch (err) { return null; }
  });
  ipcMain.on('overlay:dismiss', () => hideOverlay());

  // ───────────── Phase 3: mini widget & mini mode ─────────────
  // Both are pure consumers of the main scheduler — no timers, no
  // calculation, no notification logic of their own.
  let widgetWin = null;
  let miniWin = null;

  function themeOf() {
    return { id: store.get('lastTheme', 'islamic'), isDark: !!store.get('lastThemeDark', true) };
  }

  function sendInfo(consumer) {
    if (consumer && !consumer.isDestroyed()) consumer.webContents.send('pt:info', scheduler.getInfo());
  }

  function broadcastInfo() {
    sendInfo(widgetWin); sendInfo(miniWin); sendInfo(win);
  }

  function createConsumerWindow(kind) {
    const isMini = kind === 'mini';
    const w = new BrowserWindow({
      width: isMini ? 300 : 240,
      height: isMini ? 200 : 150,
      frame: false,
      alwaysOnTop: true,
      resizable: true,
      skipTaskbar: !isMini,
      backgroundColor: '#0e1526',
      webPreferences: {
        preload: path.join(__dirname, '..', 'widget-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    w.loadFile(path.join(__dirname, '..', 'widget.html'));
    w.once('ready-to-show', () => {
      w.show();
      // Send mode + info immediately: mini chips must render on open, not at
      // the next scheduler push.
      w.webContents.send('pt:mode', { mini: isMini, theme: themeOf() });
      sendInfo(w);
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.on('closed', () => { if (isMini) miniWin = null; else widgetWin = null; });
    return w;
  }

  ipcMain.on('widget:toggle', (e, wanted) => {
    store.set('widgetWanted', !!wanted);
    if (wanted && !widgetWin) widgetWin = createConsumerWindow('widget');
    else if (!wanted && widgetWin) { widgetWin.close(); widgetWin = null; }
  });

  ipcMain.on('mini:toggle', (e, wanted) => {
    if (wanted && !miniWin) { miniWin = createConsumerWindow('mini'); if (win && !win.isDestroyed()) win.hide(); }
    else if (!wanted && miniWin) { miniWin.close(); miniWin = null; showMainWindow(); }
  });

  ipcMain.handle('pt3:get-theme', () => themeOf());
  ipcMain.on('widget:expand', () => {
    // Mini mode expand → close mini, restore the full window (same app state).
    if (miniWin) { miniWin.close(); miniWin = null; }
    showMainWindow();
  });

  // Persist the chosen theme (+ its dark flag) so consumer windows can match it.
  ipcMain.on('pt:set-theme', (e, payload) => {
    const id = payload && typeof payload === 'object' ? payload.id : payload;
    const isDark = payload && typeof payload === 'object' ? !!payload.isDark : undefined;
    if (typeof id === 'string' && id.length < 40) {
      store.set('lastTheme', id);
      if (isDark != null) store.set('lastThemeDark', !!isDark);
    }
  });

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
    scheduler.bus.on('times-updated', (info) => { updateTray(info); broadcastInfo(); });

    // Short fire loop — main-process timers, immune to renderer throttling.
    // Missed-window detection makes the loop gap-tolerant (sleep, throttle).
    schedulerLoop = setInterval(() => scheduler.tick(), 30 * 1000);
    scheduler.tick();

    // System wake → catch up on anything missed while asleep (fires once).
    powerMonitor.on('resume', () => { dlog('System resume'); scheduler.notifyResumed(); });
    powerMonitor.on('unlock-screen', () => scheduler.notifyResumed());

    if (store.get('startWithWindows', false)) applyAutoLaunch(true);
    refreshAutoLaunchPath();

    // Auto-started hidden: don't pop the main window.
    if (process.argv.includes('--hidden')) {
      setTimeout(() => { if (win && !win.isDestroyed()) win.hide(); }, 300);
    }
  });
}
