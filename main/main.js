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
const fs = require('fs');
const { fileURLToPath } = require('url');
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
    // v1.4.0: MUST match electron-builder's appId (com.malek.prayertimes) —
    // Windows resolves installed-app notifications through this exact id; a
    // mismatch means toasts may never appear on the installed build.
    app.setAppUserModelId('com.malek.prayertimes');
  }

  // No application menu: the window keeps its native title bar, and the default
  // File/Edit/View/Window/Help menu (with its shortcut keys) is never shown.
  Menu.setApplicationMenu(null);


  store = new JsonStore({
    dir: () => app.getPath('userData'),
    name: 'pt-desktop',
    defaults: { closeToTray: true, startWithWindows: false, adhanOverlayEnabled: true, adhanEnabled: false },
  });
  closeToTray = !!store.get('closeToTray', true);

  // Persistent forensic log (ALWAYS on): %APPDATA%\Prayer Times\azan-debug.log
  // Answers "why did my adhan/notification not fire?" after the fact — no
  // debug flag needed. Console output is mirrored into it as well.
  const azlog = require('./debug-log');
  try {
    azlog.init({ dir: app.getPath('userData'), version: app.getVersion(), packaged: app.isPackaged });
    const origLog = console.log.bind(console);
    console.log = (...a) => { origLog(...a); azlog(...a); };
  } catch (e) { /* logging must never block startup */ }

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

    // v1.4.0: --hidden autostart must never flash the window. The old
    // ready-to-show → show() + 300 ms hide timer could flash on slow machines
    // (or leave it visible if the timer fired before ready-to-show).
    win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });

    // Same window-level audio audit for the main window (Quran playback path).
    try { azlog('main window audio config', { audioMuted: win.webContents.isAudioMuted() }); } catch (e) { /* diagnostic only */ }
    win.webContents.on('audio-state-changed', (e, muted) => {
      azlog('main webContents audio-state-changed', { muted: !!muted });
    });

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
    azlog('pre-alert event', { prayer, minutes, lang });
    const ar = lang === 'ar';
    const nm = ar ? PRAYER_AR[prayer] : prayer;
    const body = ar
      ? `تبدأ صلاة ${nm} بعد ${minutes} دقيقة`
      : `${prayer} starts in ${minutes} minute${minutes === 1 ? '' : 's'}`;
    notify('Prayer Time 🕌', body, () => showMainWindow('prayers'));
  }

  function firePrayerTime({ prayer, time, lang }) {
    azlog('prayer-time event', { prayer, time, lang });
    const ar = lang === 'ar';
    const nm = ar ? PRAYER_AR[prayer] : prayer;
    const title = ar ? `حان وقت صلاة ${nm}` : `It is time for ${prayer} (${time})`;
    const body = ar ? 'اللهم بارك لنا في اليوم' : 'May Allah accept your prayers';
    notify(title, body, () => showMainWindow('prayers'));
  }

  // Diagnostic: stat the resolved audio file so the log shows existence +
  // size at the moment of use (catches missing/asar-unpack path regressions).
  function probeAudioFile(resolved) {
    try {
      if (resolved && typeof resolved.src === 'string' && resolved.src.startsWith('file:')) {
        const fp = fileURLToPath(resolved.src);
        try {
          const st = fs.statSync(fp);
          azlog('audio file OK', { path: fp, bytes: st.size });
        } catch (e) {
          azlog('audio file MISSING', { path: fp, error: e.message });
        }
      } else {
        azlog('audio source is remote (no file probe)', { src: resolved && resolved.src });
      }
    } catch (e) { azlog('audio probe failed', { error: e.message }); }
  }

  function fireAdhanEvent({ prayer, time, lang, volume }) {
    // v1.3.2 P15 DECOUPLE: the azan AUDIO plays whenever the adhan event
    // fires. The overlay toggle only decides whether the fullscreen window
    // is VISIBLE — with it off, the same overlay page plays the audio
    // invisibly (identical src → load → play lifecycle, then auto-closes).
    // Disabling the overlay must never silently disable the azan.
    const id = store.get('adhanType', 'alafasy');
    const resolved = resolveAdhanAudio(id);
    dlog(`Adhan audio: ${resolved.kind} → ${resolved.file || resolved.src}`);
    const overlayVisible = !!store.get('adhanOverlayEnabled', true);
    azlog('adhan event', { prayer, time, volume, adhanType: id, kind: resolved.kind, src: resolved.src, overlayVisible });
    probeAudioFile(resolved);
    showOverlay({
      prayer,
      nameAr: PRAYER_AR[prayer] || prayer,
      nameEn: prayer,
      time,
      lang: lang || 'en',
      audioSrc: resolved.src,
      audioKind: resolved.kind,
      volume: clampVolume(volume, 1),
      hidden: !overlayVisible, // observability: the overlay page logs it back
    }, { visible: overlayVisible });
    azlog(overlayVisible ? 'overlay shown' : 'overlay hidden — azan audio plays without UI', { prayer, time });
  }

  // ────────────────────────────────────────────────────────────
  // Adhan overlay (fullscreen, always-on-top, plays audio)
  // ────────────────────────────────────────────────────────────
  function showOverlay(payload, opts) {
    // v1.3.2 P15: visible=false → the overlay window stays hidden while its
    // audio still plays (overlay setting must not gate azan audio).
    const visible = !(opts && opts.visible === false);
    if (overlay && !overlay.isDestroyed()) {
      azlog('overlay reused for new adhan', { prayer: payload && payload.prayer, visible });
      overlay.webContents.send('adhan:show', payload);
      if (visible) { overlay.show(); overlay.focus(); }
      else if (overlay.isVisible()) overlay.hide();
      return;
    }
    const { screen } = require('electron');
    const { width, height } = screen.getPrimaryDisplay().workArea;
    azlog('overlay window created', { visible });
    overlay = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      fullscreen: visible,
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
        // Hidden (audio-only) playback must never be throttled or suspended.
        backgroundThrottling: false,
      },
    });
    // v1.3.2: audit the WINDOW-level audio state Chromium actually applies —
    // this is the layer above the <audio> element (win.setAudioMuted etc.).
    try { azlog('overlay audio config', { audioMuted: overlay.webContents.isAudioMuted() }); } catch (e) { /* diagnostic only */ }
    overlay.webContents.on('audio-state-changed', (e, muted) => {
      azlog('webContents audio-state-changed', { muted: !!muted });
    });
    overlay.loadFile(path.join(__dirname, '..', 'adhan.html'));
    // Boundary: the overlay PAGE must actually load before anything can play.
    overlay.webContents.once('did-finish-load', () => azlog('overlay page loaded'));
    overlay.webContents.once('did-fail-load', (e, code, desc) => azlog('overlay page load FAILED', { code, desc }));
    overlay.once('ready-to-show', () => {
      if (payload) overlay.webContents.send('adhan:show', payload);
      // Boundary: the payload left main → the overlay renderer takes over.
      azlog('adhan:show payload sent', { prayer: payload && payload.prayer, visible });
      if (visible) { overlay.show(); overlay.focus(); }
    });
    overlay.on('closed', () => { azlog('overlay window closed'); overlay = null; });
  }

  function hideOverlay() {
    azlog('overlay dismissed');
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
    azlog('config update from renderer', {
      lat: cfg && cfg.lat, lon: cfg && cfg.lon, method: cfg && cfg.method, madhab: cfg && cfg.madhab,
      tz: cfg && cfg.tz, notif: cfg && cfg.notif, notifMin: cfg && cfg.notifMin,
      adhan: cfg && cfg.adhan, adhanType: cfg && cfg.adhanType, adhanVol: cfg && cfg.adhanVol,
    });
    if (cfg && cfg.adhanType) store.set('adhanType', String(cfg.adhanType));
    if (cfg && cfg.adhanVol != null) store.set('adhanVol', clampVolume(cfg.adhanVol, 1));
    // v1.4.0: resolve the timezone MAIN-side when the renderer could not.
    // The sandboxed preload can require only Electron built-ins, so
    // window.tzLookup was always undefined on desktop — GPS/typed-city
    // locations silently fell back to the device timezone. tz-lookup runs
    // fine here (same pattern pt:get-day already used).
    if (cfg && cfg.lat != null && !cfg.tz) {
      try { cfg.tz = require('tz-lookup')(Number(cfg.lat), Number(cfg.lon)) || ''; } catch (err) { /* out of range */ }
    }
    // v1.3.2 P10 — azan switch normalization, once, at the IPC boundary:
    // adhanEnabled is authoritative; legacy `adhan` is only a fallback.
    const azanRaw = cfg && cfg.adhanEnabled !== undefined ? cfg.adhanEnabled : (cfg ? cfg.adhan : undefined);
    const adhanEnabled = azanRaw === true || azanRaw === 'true';
    if (azanRaw !== undefined && store.get('adhanEnabled') !== adhanEnabled) {
      azlog('azan switch changed', { from: store.get('adhanEnabled'), to: adhanEnabled });
    }
    store.set('adhanEnabled', adhanEnabled); // observable state mirror
    const toScheduler = { ...cfg, adhanEnabled, adhan: adhanEnabled };
    const res = scheduler.updateConfig(toScheduler);
    if (!res.ok) azlog('config REJECTED', { error: res.error });
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
    azlog('test-alert requested (fires in 3s)');
    // Fires a real pre-alert 3 s later so the user can see the whole pipeline.
    setTimeout(() => {
      notify('Prayer Time 🕌 (test)', 'This is how prayer alerts look. Click to open the app.', () => showMainWindow('prayers'));
    }, 3000);
  });

  ipcMain.on('pt:test-overlay', () => {
    // Full pipeline test: resolve the real selected audio, real configured volume.
    const id = store.get('adhanType', 'alafasy');
    const resolved = resolveAdhanAudio(id);
    azlog('test-overlay requested', { adhanType: id, kind: resolved.kind, src: resolved.src });
    probeAudioFile(resolved);
    showOverlay({
      prayer: 'Dhuhr',
      nameAr: PRAYER_AR.Dhuhr,
      nameEn: 'Dhuhr',
      time: '12:12',
      lang: 'en',
      audioSrc: resolved.src,
      audioKind: resolved.kind,
      volume: clampVolume(store.get('adhanVol', 1), 1),
    }, { visible: !!store.get('adhanOverlayEnabled', true) });
  });

  ipcMain.handle('pt:get-info', () => scheduler.getInfo());
  ipcMain.handle('pt:get-version', () => app.getVersion());
  ipcMain.handle('pt:get-day', (e, dateISO, overrides) => {
    try {
      const ov = overrides || {};
      // Coordinates without a zone (GPS/manual locations): resolve via the
      // offline coordinate→IANA lookup — same source as the renderer.
      if (!ov.tz && Number.isFinite(Number(ov.lat)) && Number.isFinite(Number(ov.lon))) {
        try { ov.tz = require('tz-lookup')(Number(ov.lat), Number(ov.lon)) || ''; } catch (err) { /* out of range */ }
      }
      return scheduler.getDay(String(dateISO || '').slice(0, 10), ov);
    }
    catch (err) { return null; }
  });
  ipcMain.on('overlay:dismiss', () => hideOverlay());
  // v1.3.2 P9: one-way renderer diagnostics (toggle intent, push triggers).
  ipcMain.on('pt:debug', (e, msg, data) => {
    azlog('[renderer]', String(msg == null ? '' : msg).slice(0, 300), data == null ? '' : data);
  });
  // One-way diagnostics channel from the overlay renderer (audio lifecycle).
  ipcMain.on('overlay:debug', (e, msg, data) => {
    azlog('[overlay]', String(msg == null ? '' : msg).slice(0, 300), data == null ? '' : data);
  });

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

    scheduler = createScheduler({ log: azlog }); // scheduler decisions → azan-debug.log
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
    azlog('scheduler started', { tickMs: 30000 });
    // v1.4.0: push the (possibly recomputed) info to tray + widget + mini
    // after EVERY tick, not only on config changes — the surfaces stayed on a
    // stale next-prayer name for hours without this.
    schedulerLoop = setInterval(() => {
      scheduler.tick();
      updateTray(scheduler.getInfo());
      broadcastInfo();
    }, 30 * 1000);
    scheduler.tick();
    updateTray(scheduler.getInfo());
    broadcastInfo();

    // System wake → catch up on anything missed while asleep (fires once).
    powerMonitor.on('resume', () => { dlog('System resume'); azlog('system resume — recovering missed window'); scheduler.notifyResumed(); });
    powerMonitor.on('unlock-screen', () => { azlog('screen unlock — recovering missed window'); scheduler.notifyResumed(); });

    if (store.get('startWithWindows', false)) applyAutoLaunch(true);
    refreshAutoLaunchPath();

    // Auto-started hidden: don't pop the main window.
    if (process.argv.includes('--hidden')) {
      setTimeout(() => { if (win && !win.isDestroyed()) win.hide(); }, 300);
    }
  });
}
