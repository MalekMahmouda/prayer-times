# Changes — Prayer Times

## Unreleased — Download page, Quran Radio, hash routes, sitemap

Everything ships inside the existing single-page shell. No new dependencies, no
backend, no extra build step: the same HTML/CSS/JS goes to Electron, Android
(Capacitor) and the GitHub Pages web build.

### 1. Download — its own page, reached from the sidebar

The three destinations used to sit in a bar under the Stats page, which meant
the one thing a first-time visitor wants was two clicks and a scroll away. They
now have a page (`#page-downloads`) with a filled **Download** row in the
sidebar (and a tile in the mobile More sheet).

| Item | Action | Destination |
| --- | --- | --- |
| Android app | Download for Android (primary) | `releases/download/v1.5.0/Prayer-Times-1.5.0-android.apk` |
| Source code | View on GitHub (secondary) | `github.com/MalekMahmouda/prayer-times` |
| All versions | View all releases (secondary) | `github.com/MalekMahmouda/prayer-times/releases` |

- **Verified, not invented.** The APK is a real asset of the published `v1.5.0`
  release: 51,986,418 bytes (49.6 MB), `minSdkVersion 24` (Android 7.0+).
- Version, size, "Latest:" chip and APK `href` come from one object
  (`PT_RELEASE` in `js/extras.js`), so a release bump is a one-line edit and no
  row can drift onto a file that does not exist.
- Two help cards answer the questions the list raises: how the Android install
  actually goes, and that the web app needs no download at all.
- Every button opens in a new tab with `rel="noopener noreferrer"`, has a text
  label beside its icon, and is ≥44 px tall.
- The old `#downloads` anchor still works and now lands on this page.

### 2. Quran Radio — the two stations the visitor named

- **Saudi Quran Radio** — TuneIn `s37232`, whose stream TuneIn resolves to
  `stream.radiojar.com/0tpy1h0kxtzuv`.
- **Egyptian Quran Radio** — `surahquran.com/Radio-Quran-Cairo.html`, which
  embeds `stream.radiojar.com/8s5u5tpdtwzuv`.

Both upstreams are Radiojar, and Radiojar answers every request with
`302 → http://nXX.radiojar.com/...?rj-tok=…` (5-minute token). Measured on the
live HTTPS site, Chromium refuses that downgrade —
*"Media load rejected by URL safety check"* — and the `https://` edge hosts just
redirect to another `http://` node, so there is no way to walk the loop.

Each station therefore carries an ordered `urls` ladder: an HTTPS relay that
carries the same feed first, the canonical Radiojar URL second (the desktop build
loads from `file://`, where no mixed-content rule applies). Verified 2026-10-19 —
HTTP 200, `audio/mpeg`, no redirect, no expiring token; the Cairo relay
self-identifies as `Holy Quran Radio Cairo` in its ICY headers.

- Its own `<audio id="radioAudio">`: a station can never interrupt the adhan, and
  stopping a station can never stop a prayer alert.
- Starting any other audio (adhan, pre-prayer beep, a surah) stops the radio.
- One station at a time; the button becomes a stop button while it plays
  (`aria-pressed`), and the play glyph becomes an equaliser.
- Status line (`role="status"`, `aria-live="polite"`) says *Connecting…* while a
  stream is being fetched, *Now playing: …* when it is, and an honest failure
  message only when the last rung is spent.
- Autoplay blocks are not treated as dead streams: the browser refusing
  `play()` keeps the source, clears the failure state and says *tap again*,
  instead of stepping the ladder onto the always-blocked feed.
- Media Session metadata is published, so lock-screen/OS media keys work.

### 3. Hash routes (`#/prayers`, `#/quran`, `#/downloads`, …)

Navigation is a class swap, so a shared link used to mean nothing. `js/extras.js`
keeps the URL in sync and re-opens it on boot and on `hashchange`:

| Link | Opens |
| --- | --- |
| `…/prayer-times/#/prayers` | Prayers (mobile home on phones) |
| `…/#/calendar`, `#/qibla`, `#/quran`, `#/names`, `#/dhikr`, `#/stats`, `#/downloads`, `#/settings` | that page |
| `…/#downloads` | the Download page (legacy form) |

`history.replaceState` only — no history spam, no reload. Writes are held off
for the first ~900 ms after `load`, because `applyMMode()` re-enters `prayers`
while settling the viewport and that call used to overwrite a deep link the
visitor had just opened; the first pointer press ends the hold, so a real click
is never swallowed. `mhome` normalises to `#/prayers`.

### 4. UI/UX + accessibility pass

Derived from the Claude Skills for UI/UX engineers article
(snyk.io/articles/top-claude-skills-ui-ux-engineers) — the Vercel Web Interface
Guidelines / Anthropic frontend-design ideas it describes. Those skills are
Claude-Code plugins and cannot be installed into this environment, so their rules
were applied directly to these surfaces:

- **Hierarchy.** One filled primary action per list (the APK); everything else is
  a secondary button. The sidebar's Download row is the only filled nav item, so
  it reads as an action rather than another destination.
- **Focus.** `#downloads` moves focus to the page heading (`tabindex="-1"`,
  `preventScroll`) — a page switch alone leaves focus on `<body>`, so keyboard and
  screen-reader users got no signal that the view changed. The rail gets a white
  focus ring, since `--primary` can sit too close to the sidebar's own colour.
- **Press feedback on touch.** `:active` compression on nav rows and tinted
  `-webkit-tap-highlight-color` on the new tappable rows; hover lift limited to
  `@media (hover:hover)` so it never sticks on a phone.
- **Consistency.** Settings-step rhythm (72 px rows, 14 px radius, ≥44 px
  targets), theme tokens for every colour, so all eight themes stay AA.
- **Bidi.** Arabic says "أندرويد 7.0 أو أحدث" instead of "7.0+", which drops its
  `+` at the far left of the run; the version line no longer forces `dir="ltr"`.
- **i18n fix found on the way:** the mobile More sheet kept English labels in
  Arabic because `applyLang()` only repainted `.t` (sidebar) and never `.mst`
  (sheet tile).
- **Keyboard shortcuts** now follow the visible sidebar order — `Ctrl/⌘+7` is
  Stats (it opened Settings before), and `+8` opens Download.

### 5. Sitemap

The sitemap is a single URL, because there is a single URL: the app's "pages" are
hash fragments, which crawlers do not treat as separate addresses. The previous
list also carried `data/`, `fonts/*.txt`, `robots.txt` and the manifest — assets
that add no discovery value and spend crawl budget. `scripts/build-web.js` still
generates it on every build, so a redeploy cannot shrink it back.

### Translations

Every new string exists in both dictionaries (`js/data.js`): `dl.*` and `radio.*`
in `en` and `ar`, applied by `applyExtrasLang()` from `applyLang()`.

### Files

- `prayer-times.html` — Download page + sidebar row + More-sheet tile, radio bar,
  radio `<audio>`, `js/extras.js`, CSP `media-src` (+ `https://stream.radiojar.com`).
- `styles/app.css` — download page/rows/help cards, `.nav-dl` CTA, radio styles,
  responsive steps (list stays a list, stacks under 560 px; help cards 2 → 1
  column; stations stack under 760 px), focus + press states.
- `js/extras.js` — radio player with the URL ladder, downloads i18n, hash router.
- `js/data.js` — `download` icon, `dl`/`radio` strings, `nav.downloads`.
- `js/app.js` — `nav.downloads` in the i18n map (+ `.mst` repaint), shortcut order.
- `scripts/build-web.js` — sitemap content.

### Verification

- `npm test` — 74/74 scheduler + 284/284 contract checks green.
- `npm run web` — clean build; `sitemap.xml` / `robots.txt` written.
- Chromium against the built site: both stations play on the HTTPS relay
  (`paused: false`, `readyState: 3–4`, status "Now playing: …"), switching keeps
  one station at a time, the blocked-autoplay path keeps the right source;
  `#/downloads` survives a reload; legacy `#downloads` still opens the page;
  nav clicks write `#/quran` etc.; English/Arabic and 1400/390 px layouts with
  zero horizontal overflow; keyboard focus lands on the heading.

### 6. Last text-glyph sweep (final audit pass)

The icon audit that closed this release still left six text glyphs behind, in
places the first sweep did not reach. They are now the same inline stroke SVGs
as the rest of the chrome (`play`, `pause`, `plus`, `info`, `starFill` added to
`ICONS` in `js/data.js`):

- Quran player: `▶`/`⏸` on the big play button and `▶ Listen` in the mushaf
  reader (both swap live with playback state).
- Quran Radio: custom-station `<option>` keeps a text `★` by design — native
  `<option>` cannot render SVG.
- Dhikr: `＋`/`★`/`☆` on the count and favourite buttons.
- Stats: `ⓘ` on the streak tooltips.
- Settings: `▶` on Test Adhan, `＋` on Save current as location.

Sizing rules added for svg inside `.icon-btn`, `.btn` and `.msh-play`; the
dynamic swaps repaint via `paintIcons` on every state change.

### Manual step when releasing

Bump `PT_RELEASE` (`version`, `apk`, `mb`) in `js/extras.js` and the static
fallback text in `prayer-times.html`, then rebuild. Nothing fetches a release at
runtime, so nothing breaks offline — and nothing can silently point at a file
that was never uploaded.
