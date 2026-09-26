'use strict';

/**
 * widget-preload — bridge for widget.html and mini-mode.
 * Read-only consumer of main-process scheduler data. No scheduling logic.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ptWidget', {
  onMode: (cb) => ipcRenderer.on('pt:mode', (e, payload) => cb(payload)),
  onInfo: (cb) => ipcRenderer.on('pt:info', (e, payload) => cb(payload)),
  getTheme: () => ipcRenderer.invoke('pt3:get-theme'),
  expand: () => ipcRenderer.send('widget:expand'),
});
