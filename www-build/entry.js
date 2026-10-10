// esbuild entry: adhan lib + shared contract + mobile scheduler bridge.
import {
  Coordinates, CalculationMethod, PrayerTimes, SunnahTimes, Madhab, Prayer,
} from 'adhan';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
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

  // Foreground full-screen azan (v1.4.0): a prayer-time notification delivered
  // while the app is OPEN presents the SAME full-screen Azan screen the Test
  // Adhan button uses. localNotificationReceived only fires in the foreground;
  // when the app is backgrounded or the screen is locked, Android shows the
  // notification (with the channel's adhan sound) per platform rules — we do
  // not launch an activity over the lock screen. The adhan is distinguished
  // from a pre-alert by its body, never by title alone.
  const ADHAN_BODY = /It is time for|حان الآن/;
  const PRAYER_NAMES = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const prayerOf = (n) => String((n && n.title) || '').split(/[—–-]/)[0].trim();
  const showIfAdhan = (n) => {
    if (!window.ptAzanScreen || !ADHAN_BODY.test(String((n && n.body) || ''))) return;
    const p = prayerOf(n);
    if (PRAYER_NAMES.includes(p)) window.ptAzanScreen.show(p);
  };
  try {
    LocalNotifications.addListener('localNotificationReceived', showIfAdhan);
    // Tapping the notification brings the user back — present the screen too
    // (the channel already played the sound; never start a second source).
    LocalNotifications.addListener('localNotificationActionPerformed', (a) => showIfAdhan(a && a.notification));
  } catch (e) { /* older plugin / web */ }

  // v1.4.0: hardware Back closes overlays first (More sheet → location
  // modal → text-input modal), then walks page history; exiting the app is
  // the LAST resort, never the first effect of a back press.
  App.addListener('backButton', () => {
    const closers = [
      () => { const a = document.getElementById('azanOverlay'); if (a && a.classList.contains('open') && window.ptAzanScreen) { window.ptAzanScreen.hide(true); return true; } return false; },
      () => { const sh = document.getElementById('mMoreSheet'); if (sh && sh.classList.contains('open')) { sh.classList.remove('open'); return true; } return false; },
      () => { const m = document.getElementById('locOverlay'); if (m && m.classList.contains('open')) { m.classList.remove('open'); return true; } return false; },
      () => { const m = document.getElementById('txtModal'); if (m && m.classList.contains('open')) { m.classList.remove('open'); return true; } return false; },
      () => { if (window.history.length > 1) { window.history.back(); return true; } return false; },
    ];
    for (const close of closers) { try { if (close()) return; } catch (e) { /* try next */ } }
    App.exitApp();
  });

  // Status bar icon style; safe-area CSS keeps content clear of the cutout.
  window.ptStatusBar = function (dark) {
    try { StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }); } catch (e) { /* ignore */ }
  };
  // Live compass: the Android WebView exposes deviceorientation(absolute)
  // with true-north-referenced alpha (js/compass.js consumes it). A dedicated
  // native plugin can replace this later — see docs/TESTING.md.
}
