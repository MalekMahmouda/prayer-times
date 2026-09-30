'use strict';

/**
 * Overlay window preload — the narrowest possible bridge for adhan.html:
 * receives the "show" payload and can only ask to dismiss itself.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ptOverlay', {
  onShow: (cb) => ipcRenderer.on('adhan:show', (e, payload) => cb(payload)),
  dismiss: () => ipcRenderer.send('overlay:dismiss'),
  // Diagnostics only — fire-and-forget lines into azan-debug.log.
  debug: (msg, data) => ipcRenderer.send('overlay:debug', msg, data),
});
