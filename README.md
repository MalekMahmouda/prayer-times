# Prayer Times · أوقات الصلاة

A native Windows desktop & Android Islamic companion built with Electron — prayer times, Quran, Dhikr, Qibla, and more, with a fully offline-first core.

🌐 **Web app:** https://malekmahmouda.github.io/prayer-times/ — installable PWA, works fully offline after the first visit.

📥 **Downloads:** latest [releases](https://github.com/MalekMahmouda/prayer-times/releases) — Windows installer + signed Android APK.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android%20%7C%20Web-blue) ![Electron](https://img.shields.io/badge/Electron-41-47848F) ![Version](https://img.shields.io/badge/version-1.1.0-green)

## Features

**Prayer engine (offline, no account, no telemetry)**
- Prayer times computed locally via the [adhan](https://github.com/batoulapps/adhan-js) library — 8 calculation methods + Madhab (Shafi/Hanafi)
- Main-process scheduler: 30s fire loop with sleep/resume grace, day rollover, per-prayer minute offsets
- Native Windows notifications, per-prayer pre-adhan reminders
- Fullscreen Adhan overlay with reciter selection, volume, and play/pause
- Timezone-aware display for saved locations

**Islamic content**
- 📖 Quran reader — bundled verified dataset (Tanzil Uthmani text + Sahih International translation, 114 surahs / 6,236 ayahs), offline search (Arabic + English), bookmarks with notes, font/spacing controls
- 🎧 Audio player — 5 reciters, background playback across pages
- 📿 Dhikr library — morning/evening/after-prayer/sleep/general collections, favorites, counter with targets and progress
- 🌙 99 Names of Allah with search
- 🕌 Qibla compass with bearing and distance to the Kaaba
- 🌅 Sun & night times — sunrise, sunset, solar noon, midnight, last third of the night
- 📅 Monthly calendar with Hijri dates and CSV export
- 🌙 Ramadan mode — Iftar countdown, fasting-day indicator, Imsak estimate

**Personal (all local)**
- Prayer history with explicit three-state recording → statistics with streaks
- Multiple saved locations with activation control
- 8 built-in themes + custom theme builder
- Backup/restore as validated JSON
- English / العربية with full RTL layout

**Desktop integration**
- System tray with live next-prayer countdown
- Close-to-tray, start with Windows, single-instance lock
- Always-on-top mini widget and compact Mini Mode
- Keyboard shortcuts (Ctrl+1–7 pages, Ctrl+Shift+P widget, Ctrl+Shift+M mini mode)
- No Electron menu bar, no DevTools in production builds

## Getting started

```bash
npm install
npm start
```

### Build the Windows installer

```bash
npm run package:installer   # → dist/Prayer-Times-Setup-1.0.0.exe
npm run release             # → release/ folder with SHA-256 checksums
```

User data lives in `%APPDATA%\Prayer Times` and survives upgrades and uninstallation.

## Architecture

```
main/               Electron main process
├── main.js         window/tray lifecycle, IPC, notifications, overlay, widget
├── scheduler.js    offline prayer computation + fire loop (adhan lib)
├── tray.js         system tray menu
└── json-store.js   dependency-free settings store
preload.js          secure contextBridge IPC (contextIsolation + sandbox on)
js/                 renderer modules (app, pages, pages3, reader, data, store3)
styles/app.css      design tokens, 8 themes, glass/bento UI, logical-property RTL
data/quran.json     bundled verified Quran text + translation
```

Security model: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, validated IPC channels, no remote debugging endpoints.

## Privacy

Everything personal — settings, prayer history, bookmarks, locations, custom themes — is stored locally. Prayer calculations, Quran text/search, Dhikr, and the calendar work fully offline. Network is used only for optional location lookup and geolocation.

## License

All rights reserved by the author.
