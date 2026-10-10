# Prayer Times — Expert Visual Design Review & Final Polish

Method: the `apple-design` skill (Apple's *Designing Fluid Interfaces*, *The
Details of UI Typography*, *Principles of Great Design*, translated for the web),
plus a rendered-screenshot review of the running product.

This pass is a **continuation** of [DESIGN-AUDIT.md](DESIGN-AUDIT.md), which
measured geometry, contrast and computed styles. That audit explicitly could not
sign off visually — "I did not review rendered pixels by eye". This pass does
exactly that, and the difference mattered: the most serious defect found here is
one that *every measurement in the previous pass was structurally unable to see*.

Evidence: [design-review/README.md](design-review/README.md) (method, coverage,
traps) and the `before/` + `after/` galleries.

---

## 1. Overall assessment

**8 / 10** for a release candidate — up from roughly **6.5** at the start of
this pass. The gains: the countdown is readable in all eight themes, a phone's
first paint is no longer blank, the mobile home's hero and prayer strip now
render immediately rather than after up to 30 seconds, and the whole app chrome
— sidebar, bottom nav, sheets, topbar — speaks one icon language.

| Area | Score | Evidence |
|---|---|---|
| Visual design & craft | **8.5 / 10** | Real 18-token theming on 8 coherent palettes; one coherent stroke-icon language across the dashboard **and all navigation chrome**; loses points for emoji left in the content headers (settings cards, Quran tabs), 159×127 px near-empty calendar cells and large dead space on Qibla |
| Usability | **8 / 10** | Next prayer + countdown dominate correctly and the dashboard is scannable in one pass — on desktop and now on a phone at first paint; loses for triple-stated location/date, and empty-state charts that read as broken |
| Typography | **8 / 10** | Display tracking/leading corrected in the prior pass; countdown is `tabular-nums` and visually stable; still a 14-step ad-hoc size ladder, not a scale |
| Responsive behaviour | **8.5 / 10** | 0 document overflow across 320/390/1440 and the calendar clip fix holds at 320; both phone-only failures — the blank first paint and the 30-second empty hero — are fixed |
| Accessibility | **7.5 / 10** | Palette clears AA, `:focus-visible` present, azan is a real `aria-modal` dialog, three preference media features handled; **the document's only heading is "Set Location" inside the location modal — all nine content pages have none**, and touch targets remain unverified on hardware |
| Arabic & RTL | **9 / 10** | Genuinely mirrored rather than patched — logical properties throughout, bilingual type, correct bidi ordering. The Arabic display name in the 99 Names hero is the best-executed element in the app |
| Cross-platform consistency | **7 / 10** | Web, Android and desktop share one HTML/CSS/JS surface, so this review covers all three; the desktop Electron azan window is a separate document and was not exercised here |

The score is a judgement, but a bounded one: it is anchored to the items in
§3 and §6, not to an impression. I would not call this release-ready until F6
(content-page headings) and F7 (empty states) are addressed.

---

## 2. What was already good — and left alone

Worth stating before the criticism, because this is a better-built interface
than most production apps:

- **The colour system is real.** 8 coherent palettes over ~18 semantic tokens,
  with the palette hexes confined to the theme blocks. Measured across all 8
  themes at the end of this pass: every `--text` and `--text-muted` usage on a
  real surface clears AA.
- **RTL is done properly.** Logical properties throughout, zero physical
  `left`/`right`, with explicit `[dir="rtl"]` fixes only where a transform is
  directional. The mirrored dashboard is correct in reading order, card order,
  icon placement and navigation.
- **The dashboard's information architecture is right.** Next prayer, its time
  and a live countdown occupy the focal position; the five prayers read left to
  right with the current one promoted by a border, tint and ribbon. I changed
  nothing about the order.
- **Arabic display typography is excellent.** `المقسط` at ~56 px in the 99 Names
  hero, and the mushaf readers, are the strongest visual moments in the product.
- **Motion is restrained and correct**: transform/opacity only, one criticism
  from the prior pass already repaid.

---

## 3. Findings

Severity: **P0** essential content hidden / interface visibly broken · **P1**
major hierarchy or consistency problem · **P2** inconsistent spacing, proportion
or typography · **P3** minor refinement.

### F1 — The countdown was unreadable in all five light themes (P0) — FIXED

**Screenshot:** `before/60` vs `after/60`, `before/13` vs `after/13`.

`.hero` sets `color: #fff`; `.hero-cd` set no colour, so the countdown inherited
white. It sits on `.hero-glass`, whose background is `--glass` — which is
**near-white in every light theme**:

| Theme | `--glass` | `.hero-cd` colour | Result |
|---|---|---|---|
| islamic | `rgba(255,253,247,.8)` | `rgb(255,255,255)` | invisible |
| sahara | `rgba(255,250,240,.8)` | `rgb(255,255,255)` | invisible |
| blue / emerald / ocean | `rgba(255,255,255,.78)` | `rgb(255,255,255)` | invisible |
| midnight / royal / oled | `rgba(14,21,38,.72)` etc. | `rgb(255,255,255)` | correct |

Composited over the hero gradient the digits measured roughly **1.4:1**. The
single most important number in the application — the thing a user opens the app
for — was not legible in 5 of 8 themes. In the `before/60` crop the digits are
literal white blocks on pale sage; in `after/60` they are dark green.

**Why the previous audit missed it:** its contrast scan excluded any element
with a gradient ancestor as "unmeasurable". `.hero` *is* a gradient, so
`.hero-cd` was excluded — the exclusion rule that prevented false positives also
hid a real one. That guard has now been scoped: gradients still can't be
measured, but the token polarity behind them can.

**Fix:** `color: var(--text)` on `.hero-cd`. `--text` tracks the glass polarity
in every theme, so light themes become dark-ink (≈10:1) and dark themes stay
light-ink (≈14:1). Verified: `.hero-cd` now computes `rgb(27,45,32)` in islamic;
`after/60`–`after/62` show the before/after and confirm **no dark-theme
regression**.

### F2 — A phone's first paint was an empty screen (P0) — FIXED

**Screenshot:** `before/39` (142 KB, blank) vs `after/39` (540 KB, full).

At 390 px the content area rendered **completely empty** — topbar and bottom nav
only, nothing between them. The stylesheet hides the desktop dashboard at
≤768 px:

```css
@media(max-width:768px){ body:not(.m-mode) #page-prayers{display:none!important} }
```

…and the mobile home is only reached through `applyMMode()`, which was called
from **a `resize` listener and nowhere else**. A phone loads at its own width, so
no resize fires, the mode is never derived, and the desktop dashboard stays
hidden while the mobile home is never shown. Because the page is then empty there
is nothing to scroll — so the URL-bar-collapse resize that would normally bail
the app out may never fire either. The user can still tap a nav item, but the
landing surface was blank.

**Fix:** derive the mode at boot (`applyMMode(window.innerWidth <= 768)` in
`init()`), matching what real resizes already did. Verified: shot `39` changed
from `mMode=false page=page-prayers` (blank) to `mMode=true page=page-mhome`, and
`after/39` shows the full mobile home.

### F3 — `--gold` failed AA as text on a light surface (P2) — FIXED

**Screenshot:** `after/04`, `after/05`.

`--gold` was serving two incompatible jobs: a bright accent on brand gradients
(the hero time, the 99-names hero name) and small text on light cards. In the
`islamic` theme `--gold` is `#b8860b`, which measures **3.20:1** on
`--surface` — below the 4.5:1 AA floor. Measured failures:

- the daily-ayah caption `AYAH · 29:69` (11 px, bold) — 3.20:1;
- `.ncard .ntr`, the Latin name under **every one of the 99 name cards** (11 px)
  — 3.20:1 in islamic.

Only `islamic` failed; blue/emerald/ocean/sahara pass at 4.9–5.3:1.

**Fix:** a separate token. `--gold` now means *bright accent for on-gradient /
on-brand surfaces only*; the new `--gold-ink` is the legible variant for text on
a light surface, and every surface usage moved to it. `islamic --gold-ink` is
`#8f6208` (≈5.25:1 on `--surface`); the other seven themes already passed, so
their `--gold-ink` equals their `--gold`. The hero and brand-gradient usages keep
`--gold`, so nothing got duller where it was already correct.

### F4 — The dashboard icon row was six unrelated pictures (P1) — FIXED

**Screenshot:** `before/63` vs `after/63`, `before/64` vs `after/64`,
`before/65` vs `after/65`.

The sun & night row mixed **photographic** emoji (🌅 sunrise over water, 🌇 a city
skyline, 🕌 a mosque photo), a **cartoon** sun with a smiling face (🌞), and a
**flat** crescent (🌙) — six different illustration styles in one row, none of
them derived from the app's palette. Two were not legible *as icons at all* at the
rendered 21 px: 🌌 (first third) rendered as an indistinct dark-blue square and
☄️ (last third) as a red dot with a pale smudge. The glance row (🕌 ⏳ 🧭) had the
same problem at 21 px, and the prayer cards carried the same mixed set at 27 px.

This was the largest single drag on perceived quality: everything around these
icons is restrained, flat and monochrome, so the icons read as pasted-in.

**Fix:** one inline-SVG stroke set (`ICON_SVG`/`ICONS` in `js/data.js`) — a 24 px
grid, 1.75 stroke, round caps, `currentColor`, no fill — replacing the emoji on
the three dashboard surfaces (prayer cards, sun & night, today at a glance; the
mobile home inherits them). The glyphs size from the host element's existing
`font-size`, so no layout value changed. The night thirds became a legible
family: a night dial cut at the middle, with the early or late portion filled.
Icons take `--primary`, which is contrast-safe in all 8 themes.

Two self-inflicted regressions were caught by re-capturing and fixed:
the SVGs are block elements and so sat **left-aligned** in centred cards (the
emoji had been inline text) — fixed with `margin: 0 auto`; and the mosque glyph
first read as a bell until minarets were added.

**Extended in the same pass:** once the dashboard was SVG, the chrome beside it
became the inconsistency — a photo-emoji sidebar next to an SVG dashboard. The
**navigation chrome is therefore migrated too**: sidebar, bottom nav, More sheet,
topbar and both location pills (28 markup sites) now take their glyphs from the
same `ICONS` set via `data-icon` placeholders painted once at boot. What is
**deliberately left** is the content-level emoji: the settings card headers
(🌐 General, 🧮 Prayer Calculation, 🕌 Adhan …), the Quran tab strip, the in-button
glyphs (⬇ ⬆ ▶ 🔔 🔍) and the toast prefixes. Those live in text and button
contexts rather than in a row the eye compares side by side, and each needs its
own glyph decision.

### F5 — Past prayers were dimmed past readability (P2) — FIXED

**Screenshot:** `before/01` vs `after/01`, `before/12` vs `after/12`.

`.pcard.past { opacity: .42 }` applies to the whole card, time included. In the
light themes the faded times are a strain; on OLED (pure black) they were close
to invisible. The prior audit flagged this as an intentional trade-off with a
legibility cost; at the rendered size the cost was too high.

**Fix:** `.58` (hover `.9`). The de-emphasis still reads immediately — the
current prayer is promoted by weight, tint and a ribbon — but the times stay
legible, which is the reason the card exists.

### F6 — No content page carries heading structure (P2, accessibility)

Measured across the whole document: exactly **one** heading exists —
`<h3 id="locTitle">Set Location</h3>` inside the location modal, i.e. hidden in
normal use. All **nine** page containers (`page-mhome` … `page-settings`) contain
**zero `h1`–`h6`** and zero heading-role elements. There is also no page title
anywhere except Calendar, whose `.cal-title` ("October 2026") is a styled `div`.
Visually the app has strong section labels ("Today's Prayers", "Sun & Night",
"Prayer Calculation"); for a screen reader the content has no structure at all to
navigate by.

*Correction: an earlier draft of this finding claimed there was no heading
anywhere in the document. A grep for `<h` found the modal's `h3`, and the
traversal above was re-run to state it exactly. The finding stands; its absolute
form did not.*

**Status:** not fixed. It is a content/semantics change across nine page regions
and I did not want to touch markup in a pass whose verification is visual. It is
the highest-value remaining item. *Not verified by a screen reader* — the finding
is from DOM inspection.

### F7 — Empty states render as broken charts (P2)

**Screenshot:** `after/07`.

The Stats page with no history draws an empty 30-day strip (invisible bars on
white, faint grid only), empty by-prayer progress bars, and `0 / 0 / 0`
everywhere — with no "no data yet" message anywhere. A first-time user sees what
looks like a rendering failure rather than an empty state. The brief asks
specifically about empty states; this is the one the app has none for.
**Status:** not fixed (needs product copy and an illustration decision, not a CSS
tweak).

### F8 — Composition and dead space (P2)

- **Qibla** (`after/03`): the compass card spans ~800 px while its content
  occupies the left third, and the lower two-thirds of the page is empty. The
  compass dial also carries a decorative gradient ring but **no cardinal ticks
  other than "N"**, while the "How to use" card instructs the user to align to
  "the top of the dial" — the instruction refers to a marker that isn't drawn.
- **Calendar** (`after/02`): cells are **159×127 px on desktop** containing two
  small numbers pinned top-left; the month reads as an empty table. Zero overflow
  — but zero overflow is not the same as balanced.
- **z-order note:** the intro toast overlaps the topbar rather than displacing it.

### F9 — Redundant information in the focal card (P3)

The location appears **three times** on one screen (topbar chip, hero header
pill, hero pill again) and the Hijri date twice (hero header, glance card), while
the next prayer appears three ways (hero name, its prayer card, glance cell). The
brief asks directly whether information is repeated without reason. Both copies
are functional entry points (`tbLoc` and `heroLoc` both open the location modal),
so this is a hierarchy decision rather than a bug — I did not remove a shortcut.

### F10 — Minor inconsistencies (P3)

- The volume control is an unstyled native `<input type=range>` sitting beside
  fully custom switches, steppers and selects (`after/08`).
- The "Asr school" select is visibly wider than its siblings in the same card.
- The Quran surah number badges use a dashed circle — a weaker treatment than
  the rest of the component language.
- On the azan screen the Arabic name nearly touches the Latin name below it
  (`after/30`).
- Dhikr cards set Arabic right-aligned and English left-aligned in one LTR card,
  creating a diagonal reading path (`after/06`).

---

### F11 — The mobile home's hero and prayer strip were painted only every 30th second (P1) — FIXED

**Screenshot:** `before/40` vs `after/40`, and `after/70` at device scale.

`renderMHome()` — the function that writes the mobile home's next-prayer name,
its time, the Hijri date and the five-cell prayer strip — was reachable from
exactly **one** place: inside `tick()`, behind `if (++tickN % 30 === 0)`. The
countdown itself is written every second by that same tick, so a phone showed a
**live countdown under an unnamed, timeless prayer**: `#mName` and `#mTime` sat
on their `—` placeholders and `#mStrip` was empty, while `#mCd` counted down. On a
fresh load that lasted until the 30th successful tick — up to half a minute, and
longer if the tab was backgrounded (browsers throttle timers), because the
counter only advanced on the ticks that actually ran.

`renderAll()` (which runs when data arrives) and `gotoPage('mhome')` both
repainted the *cards* and the *sun rows* but never the hero, which is why the
grid below was fully populated in the broken state — only the hero and strip were
blank. This is the same failure mode as F2: the mobile home is a second DOM tree,
and one of its two paint paths was missing.

**Fix:** `renderAll()` now repaints the mobile home when m-mode is on, and
navigating to it repaints it. Verified: `after/40` and `after/70` show
"Fajr", "04:58 AM · Tomorrow" and a populated strip at first paint.

---

## 4. A correction to the previous audit's theme list

The review brief asked for nine themes including **"Violet"** and **"Light"**,
and asked me to confirm the list rather than assume it. The repository defines
**eight** (`js/data.js` → `THEMES`): `midnight`, `royal`, `oled` (dark) and
`blue`, `emerald`, `islamic`, `ocean`, `sahara` (light). There is no `violet` and
no `light` theme — both appear only as **migration aliases** in `THEME_MIGRATE`
(`violet → royal`, `light → sahara`), i.e. names saved by older builds. Any
review of "nine themes" would have been reviewing two themes that do not exist.

---

## 5. Changes made

| File | Change | Why |
|---|---|---|
| `styles/app.css` | `.hero-cd { color: var(--text) }` | F1 — countdown invisible in 5 themes |
| `styles/app.css` | `--gold-ink` added to all 8 theme blocks; `.surah-item .num`, `.bm-item .bm-note`, `.ncard .ntr`, `.ncard.today::after` moved to it | F3 — AA failure on light surfaces |
| `styles/app.css` | `.pcard.past` opacity `.42 → .58`, hover `.75 → .9` | F5 |
| `styles/app.css` | `.hero::before/::after` `blur(2px) → blur(34px)/blur(40px)` | F4-adjacent: the 320 px discs read as hard-edged smudges; now a soft bloom |
| `styles/app.css` | new rule: dashboard icon svgs are `1em` and `margin: 0 auto` | F4 — sizes from the existing scale, centres the block svgs |
| `js/data.js` | `ICON_SVG` + `ICONS` (23 glyphs — 13 dashboard/night + 10 chrome); `ICON_PRAYER` → `ICONS.*` | F4 — replaces the mixed emoji |
| `js/app.js` | sun & night row and glance row use `ICONS.*` | F4 |
| `prayer-times.html` | 28 chrome emoji → `<span data-icon="…">` (sidebar, logo, bottom nav, More sheet, topbar, both location pills, reader translate) | F4 — one icon language for the whole frame |
| `js/app.js` | `paintIcons()` fills every `[data-icon]` from `ICONS` at boot | F4 — one source of truth for the glyph geometry |
| `styles/app.css` | `[data-icon]` sized `1em` from the host font-size, inline-flex centred | F4 — no layout value changed when the emoji were swapped |
| `js/app.js` | `applyMMode(window.innerWidth <= 768)` in `init()` | F2 — blank first paint on phones |
| `js/app.js` | `renderAll()` + `gotoPage('mhome')` repaint the mobile home | F11 — hero/strip were 30 s behind |
| `js/pages3.js` | daily-ayah caption `var(--gold)` → `var(--gold-ink)` | F3 |
| `scripts/test-contract.js` | §16 — 20 guards | pins every item above so it cannot silently return |

No page composition, navigation, data format, API or Android configuration was
touched. The visual work is confined to the stylesheet, one icon set and one boot
line.

---

## 6. Verification

```
npm run web                     → dist-web/ built            exit 0
node scripts/test-scheduler.js   → 74/74   ALL GREEN          exit 0
node scripts/test-contract.js    → 284/284 ALL GREEN          exit 0   (+21, was 263)
node scripts/check-dist.js       → runtime asset validation passed   exit 0
```

The **guards were themselves tested** — a guard that cannot fail is worthless.
Removing the countdown fix, reverting the gold token, or deleting the boot-time
mode derivation each makes the suite **exit 1** with the specific check failing;
restoring the file returns the suite to 284/284 (removing the countdown fix fails exactly 1 check).

Rendered verification — all 42 shots of the final build, recorded in
`after/_capture-report.json`:

- document horizontal overflow **0/42** at 320 / 390 / 1440 px (320×844@3, 390×844@3, 1440×900@1);
- theme and language as requested **42/42**; RTL **10** shots, LTR **32**;
- all **14** narrow shots in mobile mode (shot `39` included — it was the blank one);
- the azan surface opened in all **3** azan shots (in-app full-screen azan);
- every shot's `result.problems` array empty (no capture-harness errors);
- countdown ink verified by computed style per theme, and visually in
  `after/60`–`after/62`;
- gold token verified per theme by computed style, and visually in `after/04`,
  `after/05`;
- calendar clipping still **0** at 320 px (`after/50`).

## 7. Before / after

| Pair | Change |
|---|---|
| `before/60` → `after/60` | White digits on a pale sage chip → dark ink, readable (islamic) |
| `before/13` → `after/13` | Same fix in sahara (the theme with the worst contrast before) |
| `before/62` → `after/62` | midnight unchanged — proof the fix is scoped to where it was broken |
| `before/63` → `after/63` | 6 mismatched emoji → one stroke set; the two illegible glyphs are gone |
| `before/65` → `after/65` | Prayer cards: emoji → centred monochrome icons, past cards legible |
| `before/01` → `after/01` | Dashboard: icons, past-card opacity, softened hero decoration |
| `before/39` → `after/39` | **Empty screen → the full mobile home** |
| `before/40` → `after/40`, `after/70` | **"—" under a live countdown → "Fajr", "04:58 AM · Tomorrow" and a filled prayer strip** |
| `before/66` → `after/66` | Sidebar of eight unrelated colour emoji → one stroke set |
| `after/67`, `after/68`, `after/69` | Bottom nav, More sheet and topbar in the same set (`after/` only — new shots) |
| `before/04` → `after/04`, `before/05` → `after/05` | Gold on light surfaces darkened to clear AA |

## 8. Remaining limitations — stated, not glossed

1. **No physical-device verification.** Everything here is headless Chrome with
   emulated viewports, DPR and touch events. The `(pointer:coarse)` touch-target
   rules still cannot be exercised (this browser reports a fine pointer), so
   target sizes remain **declaration-verified only**; real touch feel, iOS Safari
   behaviour and Android WebView rendering are unverified.
2. **The desktop Electron azan window is not covered.** The shots capture the
   in-app azan surface. `adhan.html` is a separate window, verified in the
   earlier desktop pass, not re-verified here.
3. **F6 (no content-page headings) and F7 (empty states) are open**, along with F8–F10.
4. **Content-level emoji remain**: settings card headers, the Quran tab strip,
   in-button glyphs and toast prefixes (see F4). The navigation chrome no longer
   uses any. The chrome glyphs were judged from device-scale crops
   (`after/66`–`after/69`) rather than from full-page shots.
5. **Two of eight themes have no screenshot** (`blue`, `emerald`) — measured
   programmatically, not rendered. They are structural near-duplicates.
6. **Fine text must be judged from the crops, not the gallery** (§4 of the
   gallery index). Two findings in this pass were misread from downscaled
   attachments before being disproven by device-scale crops and DOM reads — I am
   reporting the corrected versions, but the reader should apply the same rule.
7. **The clock differs between captures.** These are live prayer times: the
   countdown and the "next prayer" change between runs, so a before/after pair
   may show a different prayer. That is the app working, not a regression.
8. **Not verified by an assistive technology.** The accessibility findings come
   from DOM inspection and computed styles; no screen reader was driven.

## 9. Deliberately not changed

Recording these as decisions so they are not mistaken for oversights:

- **The five-step type-scale migration.** Still deferred, as in the prior pass:
  it rewrites 60+ declarations and needs per-page visual sign-off.
- **The midnight `--on-primary` at 3.22:1.** Adequate for the bold button labels
  it is used on; changing it means changing the brand blue.
- **`.pcard.next` promotion and the dashboard information order.** Already right;
  amplified only by fixing what surrounded it.
- **The Islamic visual identity.** The restrained green/gold system, the gradient
  hero and the geometric Arabic display type are the product's character. The
  changes above remove noise from around them rather than replacing them.
