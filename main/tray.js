'use strict';

/**
 * System tray — Prayer Times.
 * Menu shows today's prayer times and a live next-prayer countdown.
 */

const path = require('path');
const { Tray, Menu, nativeImage, app } = require('electron');

let tray = null;

// Minimal fallback so the tray always has something to draw if the .ico fails to load.
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAY0lEQVRYw+2XsQ3AIAwER7FixYolK1asWLFixYoVK1asWLFiHQvmJoVfSd+XgGfJmkmAmYibm9nfeQYhBKSU1t7vHwCAGT/2HfAmBZkN1sYCOluALZ' +
  'oV4BqNB0DYEaBq4BTQKwY1AsyKQY0As2JQI8CsGNSIGwnsmqkJPIvhYSqXl7lz5/6/gQ0bNmxYs2HDhg0bNmzYsGHDhg0bNmzYsGHDhg0bNmzYsGHDhg0bNvz/AOopV+1H8vXUAAAAAElFTkSuQmCC',
  'base64'
);

function icon() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.ico'));
    if (!img.isEmpty()) return img;
  } catch (e) { /* fall through */ }
  return nativeImage.createFromBuffer(FALLBACK_PNG);
}

function createTray({ onOpen, onQuit, onNavigate }) {
  if (tray) return tray;
  tray = new Tray(icon());
  tray.setToolTip('Prayer Times');

  // Left-click toggles the window.
  tray.on('click', () => onOpen());

  rebuild(null);

  // v1.4.0: the old second click handler called rebuild(null), which WIPED
  // the prayer times and next-prayer line from the menu until the next
  // update. Left-click is handled above (onOpen); the context menu rebuilds
  // only from real info (updateTray).

  function rebuild(info) {
    const ctx = Menu.buildFromTemplate(buildTemplate(info, { onOpen, onQuit, onNavigate }));
    tray.setContextMenu(ctx);
  }

  return {
    update(info) {
      if (!tray) return;
      tray.setToolTip(info && info.next
        ? `Next: ${info.next.prayer} at ${info.next.hhmm} (in ${info.next.countdown})`
        : 'Prayer Times');
      rebuild(info);
    },
    destroy() { if (tray) { tray.destroy(); tray = null; } },
  };
}

function buildTemplate(info, { onOpen, onQuit, onNavigate }) {
  const tpl = [];

  if (info && info.next) {
    tpl.push({
      label: `Next: ${info.next.prayer} — ${info.next.hhmm} (in ${info.next.countdown})`,
      click: () => onNavigate && onNavigate('prayers'),
    });
    tpl.push({ type: 'separator' });
  }

  if (info && Array.isArray(info.times) && info.times.length) {
    for (const t of info.times) {
      tpl.push({
        label: `${t.prayer}: ${t.time}`,
        click: () => onNavigate && onNavigate('prayers'),
      });
    }
    tpl.push({ type: 'separator' });
  }

  tpl.push({ label: 'Open Prayer Times', click: () => onOpen() });
  tpl.push({ type: 'separator' });
  tpl.push({ label: 'Quit', click: () => onQuit() });
  return tpl;
}

module.exports = { createTray };
