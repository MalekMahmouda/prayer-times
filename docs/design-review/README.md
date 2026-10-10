# Visual review — screenshot gallery

Rendered evidence for the visual design pass described in
[../DESIGN-REVIEW.md](../DESIGN-REVIEW.md). **These are real screenshots of the
running application**, not mockups and not source-code readings.

- `before/` — the build as it was at the start of this pass.
- `after/` — the same shots re-taken after the changes.

Filenames map 1:1 between the two directories for every shot they share, so a
pair is a direct before/after of the same screen, viewport, theme, language and
layout direction. `before/` has 38 shots, `after/` has 42: the four extra are
`after/`-only additions (`67`–`70`, see the table).

---

## 1. How these were produced

A dev-only CDP harness (`tmp/visual-capture.js`, scratch — excluded from the
repo) launches headless Chrome, drives the built `dist-web/` over HTTP
(`http://127.0.0.1:8899`), and for **every** shot:

1. pins the viewport and device pixel ratio (`Emulation.setDeviceMetricsOverride`);
2. navigates with a cache-busting query;
3. **unregisters the service worker and clears its caches** — otherwise the SW
   serves the previous build's CSS and a verified fix looks unapplied;
4. **disables CSS transitions before capturing** — `body` cross-fades its colour
   over 0.4 s, and a frozen mid-transition colour is how an earlier pass
   produced "11 contrast failures in midnight" where the settled value was
   6.17:1;
5. forces theme + language + page through the app's own `applyTheme` /
   `applyLang` / `gotoPage`;
6. derives the mobile UI the way the app itself does (`applyMMode`) for the
   narrow shots;
7. waits for fonts plus two frames, then captures.Per-shot results are recorded in `after/_capture-report.json` (viewport, requested
vs. resulting theme/language/direction/m-mode/active page, azan state, document
overflow). **`before/_capture-report.json` is partial**: it holds only the seven
`60`–`66` zoom crops, because the final before-crop pass overwrote the 38-shot
run's manifest. The verified figures below therefore describe the `after/` set;
the `before/` images stand as images.

## 2. Coverage

**Viewports:** 1440×900 @1 (desktop) · 390×844 @3 (phone) · 320×844 @3 (narrow
phone). **Languages:** English (LTR) and Arabic (RTL). **Themes:** islamic,
sahara, ocean, midnight, royal, oled. **42 shots**: 28 desktop, 14 phone-scale.

Machine-verified over all **42** `after/` shots recorded in the report: document
horizontal overflow in **0/42**; theme and language as requested in **42/42**;
RTL **10** / LTR **32**; the azan surface opened in **3/3** azan shots;
**14/14** narrow shots in mobile mode; no capture-harness errors (every shot's
`result.problems` array is empty).

| File | Screen | Theme | Lang | Notes |
|---|---|---|---|---|
| `01-desktop-prayers-islamic-en` | Dashboard | islamic | en | hero, prayer cards, sun & night, glance |
| `02-desktop-calendar-islamic-en` | Calendar | islamic | en | |
| `03-desktop-qibla-islamic-en` | Qibla | islamic | en | |
| `04-desktop-quran-islamic-en` | Quran | islamic | en | surah list, tabs |
| `05-desktop-names-islamic-en` | 99 Names | islamic | en | "Name of the day" hero + 6-col grid |
| `06-desktop-dhikr-islamic-en` | Dhikr | islamic | en | chips + counter |
| `07-desktop-stats-islamic-en` | Stats | islamic | en | |
| `08-desktop-settings-islamic-en` | Settings | islamic | en | three-column card grid |
| `10/11/12-desktop-prayers-{midnight,royal,oled}-en` | Dashboard | 3 dark themes | en | |
| `13/14-desktop-prayers-{sahara,ocean}-en` | Dashboard | 2 more light themes | en | |
| `20-desktop-prayers-islamic-ar` | Dashboard | islamic | ar | full RTL mirror |
| `21-desktop-settings-islamic-ar` | Settings | islamic | ar | |
| `22-desktop-settings-islamic-ar-bottom` | Settings (scrolled) | islamic | ar | About card, developer credit, supplication |
| `23-desktop-calendar-islamic-ar` | Calendar | islamic | ar | |
| `24-desktop-names-midnight-ar` | 99 Names | midnight | ar | Arabic hero name, dark theme |
| `30-desktop-azan-islamic-en` | Full-screen Azan | islamic | en | in-app azan surface |
| `31-desktop-azan-midnight-ar` | Full-screen Azan | midnight | ar | |
| `39-mobile-firstpaint-prayers-islamic-en` | Dashboard, **first paint** | islamic | en | the state a phone shows on load |
| `40/41-mobile-mhome-{islamic-en,midnight-ar}` | Mobile home | light / dark | en / ar | |
| `42/43-mobile-calendar-{en,ar}` | Calendar | islamic | en / ar | |
| `44-mobile-settings-islamic-en` | Settings | islamic | en | |
| `45-mobile-quran-islamic-ar` | Quran | islamic | ar | |
| `46-mobile-qibla-midnight-en` | Qibla | midnight | en | |
| `47-mobile-azan-islamic-en` | Full-screen Azan | islamic | en | |
| `50-narrow320-calendar-islamic-en` | Calendar | islamic | en | narrow-width clip check |
| `51-narrow320-prayers-islamic-ar` | Mobile home | islamic | ar | narrow + RTL |
| `60/61/62-zoom-hero-chip-*` | Countdown chip, 3× | islamic / sahara / midnight | en | the countdown ink fix |
| `63-zoom-sunnight-islamic-en` | Sun & night row, 2× | islamic | en | icon set |
| `64-zoom-glance-islamic-en` | Today at a glance, 2× | islamic | en | icon set |
| `65-zoom-prayercards-islamic-en` | Prayer cards, 2× | islamic | en | icon set + past-card opacity |
| `66-zoom-sidebar-islamic-en` | Sidebar, 2× | islamic | en | chrome icon set |
| `67-zoom-bottomnav-islamic-en` | Bottom nav, 3× | islamic | en | `after/` only — chrome icon set |
| `68-zoom-moresheet-islamic-en` | Mobile "More" sheet | islamic | en | `after/` only — chrome icon set |
| `69-zoom-topbar-islamic-en` | Topbar, 3× | islamic | en | `after/` only — chrome icon set |
| `70-zoom-mobile-hero-islamic-en` | Mobile hero, device scale | islamic | en | `after/` only — hero now filled |

`after/67`–`after/70` have no `before/` counterpart: `67`–`69` were added with
the chrome icon migration, and `70` mid-pass to inspect the mobile hero at native
resolution (see §4).

## 3. Requested screens that do not exist as such

Confirmed from the repository rather than assumed:

- **"Sun Times" is not a page.** Sunrise/sunset/solar noon/midnight and the two
  night thirds are the **"Sun & night" section of the dashboard** (and of the
  mobile home). Covered by `01`, `40`, `63`.
- **"Asma Allah al-Husna" is the "99 Names" page** (`#page-names`), titled
  "99 Names" in the navigation.
- **The Azan interface exists twice.** The shots here capture the **in-app
  full-screen azan surface** (shared by the Android app, the PWA and the Test
  Adhan button). The desktop app additionally has its own always-on-top Electron
  window (`adhan.html`), which is not part of `dist-web/` and therefore not
  reachable from this harness; it was verified separately in the earlier
  desktop pass.
- **The theme list is 8, not 9.** The real themes are `midnight`, `royal`,
  `oled` (dark) and `blue`, `emerald`, `islamic`, `ocean`, `sahara` (light) —
  defined in `js/data.js` `THEMES`. **There is no `violet` and no `light`
  theme**: both are migration aliases (`THEME_MIGRATE`) for `royal` and
  `sahara`. The review brief listed nine names including "Violet" and "Light";
  the repository does not contain them.

Theme coverage note: the gallery shows **6 of the 8 themes** as screenshots
(islamic, sahara, ocean, midnight, royal, oled). `blue` and `emerald` were
covered by measurement only — every theme was measured programmatically for the
countdown chip and the gold token. They are structural near-duplicates of
`ocean` and `islamic`.

## 4. Two measurement traps in this evidence

Both cost real time and both would have produced a false finding:

1. **Gradients are not machine-measurable.** An automated contrast scan walks
   ancestors for an opaque `background-color`; a gradient ancestor has none, so
   the walk escapes to the page background and reports, e.g., white sidebar text
   as 1.09:1 (68 "failures" in the first pass). The sidebar is white text on a
   dark green gradient. Every such row is an artifact and has been excluded —
   and flagged as *unmeasurable*, not as failing. The same trap is why the
   previous audit's gradient-exclusion rule **masked the countdown defect**
   (F1 below): `.hero-cd` sits inside `.hero`, which is a gradient.

2. **Large attachments are downscaled before they reach the reader.** Text in
   the full-page PNGs can smear into unreadable bars. Two examples from this
   pass, both of which I initially misread and had to disprove:
   - the dashboard hero name looked like **"Isra"** in a css-scale capture; the
     DOM says `#heroName` is `Isha`, and a device-scale crop renders "Isha"
     unambiguously;
   - the mobile hero's name/time looked like solid **white and olive blocks**;
     `after/70-zoom-mobile-hero-islamic-en` shows "Fajr" and
     "04:58 AM · Tomorrow" rendering correctly, and the DOM confirms
     `#mName` = "Fajr", white, 40px/800, visible.

   **Therefore: fine text is judged only from the device-scale crops (the `60`-`70`
   series), never from the full-page shots.** Where a claim depends on text, the
   report cites the DOM measurement instead of the pixels.

## 5. Reproducing

```
npm run web                                   # build dist-web/
node tmp/static-server.js                     # serve dist-web/ on 127.0.0.1:8899
node tmp/visual-capture.js                    # writes 42 shots + _capture-report.json into after/
node tmp/visual-capture.js --only=40-mobile   # re-take a single shot by name
```

`tmp/` is scratch and not part of the repository, so the harness must be
recreated if it is needed again; the method above is the specification.
