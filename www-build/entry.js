// esbuild entry: adhan lib + mobile scheduler bridge, exposed on window.
import {
  Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab, Prayer,
} from 'adhan';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import './mobile-scheduler.js';

// Deps for js/platform.js offline computation (same lib the desktop uses).
window.__ptAdhan = { Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab, Prayer };

if (Capacitor.isNativePlatform()) {
  // Reschedule notifications after resume: covers timezone/DST/date changes
  // that happened while the app was away. Boot rescheduling is native
  // (LocalNotificationRestoreReceiver in the plugin manifest).
  App.addListener('resume', () => { if (window.ptMobile) window.ptMobile.reschedule(); });

  // Status bar icon style; safe-area CSS keeps content clear of the cutout.
  window.ptStatusBar = function (dark) {
    try { StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch (e) { /* ignore */ }
  };
}
