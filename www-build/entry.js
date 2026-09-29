// esbuild entry: adhan lib + shared contract + mobile scheduler bridge.
import {
  Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab, Prayer,
} from 'adhan';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import tzLookup from 'tz-lookup';
import './mobile-scheduler.js';

// Deps for js/platform.js offline computation (same lib + SAME contract file
// the desktop scheduler uses).
window.__ptAdhan = { Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab, Prayer };

// Offline coordinate→IANA-timezone lookup — the same package the desktop
// uses, so GPS/manual locations resolve identically on every platform.
window.tzLookup = tzLookup;

if (Capacitor.isNativePlatform()) {
  // Reschedule notifications after resume: covers timezone/DST/date changes
  // that happened while the app was away (debounced + serialized inside the
  // scheduler). Boot rescheduling is native
  // (LocalNotificationRestoreReceiver in the plugin manifest).
  App.addListener('resume', () => { if (window.ptMobile) window.ptMobile.reschedule(); });

  // Status bar icon style; safe-area CSS keeps content clear of the cutout.
  window.ptStatusBar = function (dark) {
    try { StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch (e) { /* ignore */ }
  };
  // Live compass: the Android WebView exposes deviceorientation(absolute)
  // with true-north-referenced alpha (js/compass.js consumes it). A dedicated
  // native plugin can replace this later — see docs/TESTING.md.
}
