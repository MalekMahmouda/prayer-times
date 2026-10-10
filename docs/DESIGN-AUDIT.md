# Prayer Times — Professional Design Audit

Method: `apple-design` skill (Apple's *Designing Fluid Interfaces* / *The Details of
UI Typography* / *Principles of Great Design*, translated for the web).

Everything below was **measured on the running product** — a real Chromium driving
the built `dist-web` over HTTP, reading the live DOM (computed styles, bounding
boxes, WCAG contrast maths). It is not a visual opinion. Where a measurement
turned out to be an artifact of the harness, it is called out as such rather
than reported as a defect.

Scope: all 8 pages · 8 themes · LTR + RTL · 320 / 360 / 390 / 414 / 768 / 1440 px.
The desktop (Electron) app shares this exact CSS and HTML, so these results apply
to it too.

---

## 1. What the audit found

### Summary

| Area | Verdict |
|---|---|
| Colour contrast | Sound in 7/8 themes; **sahara failed AA** → fixed |
| Layout / overflow | 7/8 pages clean; **calendar clipped on phones** → fixed |
| Type scale | **Not a system** — 14 rendered sizes, arbitrary sub-pixel ladder → addressed |
| Display-type tracking & leading | **Wrong direction** — positive tracking on 40–52px display text → fixed |
| Micro-type | Smallest tier (9–10px) too small, especially for Arabic → raised |
| Touch targets | Several controls under 44px on touch → addressed |
| Interaction feedback | **Hover-centric** (39 `:hover` vs 5 `:active`) → press feedback added |
| Accessibility preferences | Only reduced-motion, and as a blanket kill → all three handled |
| Focus / keyboard | Already present (`:focus-visible`) — no change needed |
| RTL | Already clean (logical properties only, 0 physical left/right) — no change needed |

### What was already good (no changes made)

Credit where it is due — these were checked and left alone:

- **Contrast is genuinely well built.** `--text` is 13:1+ in every theme; the
  muted tier clears AA everywhere except sahara. The prayer-card time/name
  measure **15:1**. This is a better colour system than most production apps.
- **The theme system is real.** 8 coherent palettes on ~18 semantic tokens, no
  hardcoded colours leaking into components (the palette hexes live only in the
  theme blocks).
- **RTL is done properly** — `inset-inline`, `margin-inline`, logical properties
  throughout, with explicit `[dir="rtl"]` fixes where transforms are directional.
- **Semantics & motion** — `:focus-visible` ring present, `role`/`aria-modal`
  on overlays, transform/opacity-only animations, a scroll-snap prayer strip.

---

## 2. Defects found and fixed

### D1 — Calendar was clipped on every phone (severity: high)

**Measured:** at 390px, `#calGrid` had `scrollWidth 480` inside `clientWidth 362`.
Its 7 columns resolved to `62.5px` each (not the ~48px that would fit), so each
week row was 480px wide inside a 362px box. `.content { overflow-x: hidden }`
then **clipped 9 of 34 cells with no scrollbar and no way to reach them** — the
trailing weekdays simply did not exist on a phone.

**Cause:** `grid-template-columns: repeat(7, 1fr)`. `1fr` means
`minmax(auto, 1fr)`, and the `auto` minimum is each item's **min-content** size.
The cells' min-content floor (~62.5px) won, so the tracks never shrank to fit.

**Fix:** `repeat(7, minmax(0, 1fr))` + `min-width: 0` on `.cal-cell`, plus
tighter gutters/padding below 768px.

**Verified after:** `scrollWidth 362 === clientWidth 362`, row width 362,
**cells clipped 0/34**, cell 48×44px (still tappable), no document overflow.
Confirmed at 320 / 360 / 390 / 414 / 768 / 1440px. All other 7 pages measured
**0 clipped elements** at 320px.

### D2 — The sahara theme failed contrast AA (severity: medium-high)

**Measured:** sahara `--text-muted` `#8a6f52` on `--surface2` `#f4ecdd` = **4.00:1**
and on `--bg` = 4.18:1. The AA floor for body text is **4.5:1**. Every small
muted label in that theme (`.sec-lbl`, `.tb-date`, `.sub`, `.note`) was below it.

**Fix:** `#7a6146` — the same warm brown, ~14% lower luminance.
**Verified after:** **4.93:1** on `--surface2`, 5.15:1 on `--bg`. All 8 themes now
clear 4.5:1 (worst case: blue/emerald at 4.55/4.57).

### D3 — Display typography used the wrong tracking, in the wrong direction (severity: medium)

Apple's §15 is explicit: *tracking is size-specific, and large text wants
**negative** tracking*. Measured, the app had **zero negative letter-spacing
values** across 9 distinct positive ones — and the biggest type had the most
positive tracking:

| Element | Size | Was | Now |
|---|---|---|---|
| `.hero-cd` (countdown) | 52px | `letter-spacing: 2px`, `lh 1.15` | `-0.01em`, `lh 1.04` |
| `.hero-name` | 46px | `0.5px`, `lh 1.12` | `-0.02em`, `lh 1.06` |
| `.mh-cd` | 44px | `2px`, `lh 1.15` | `-0.01em`, `lh 1.04` |
| `.mh-name` | 40px | `0.5px`, `lh 1.15` | `-0.02em`, `lh 1.06` |

The countdown is the app's single most-glanced-at element and is
`tabular-nums`; +2px tracking on a 52px numeric readout makes the digits read
scattered. Negative tracking + tight leading makes it read as one block.

Also: **88% of text nodes rendered at `line-height: normal`** — leading was
never a decision. Added tight leading to display type and deliberate leading to
wrapping micro-copy.

### D4 — Typography had no scale (severity: medium)

14 distinct rendered sizes with a sub-pixel ladder — `10.5 / 11 / 11.5 / 12 /
12.5 / 13 / 13.5 / 14.5 / 15 / 16 / 17 / 18 / 21 / 27px`. Differences below
~1px are not a hierarchy, they are noise; a reader cannot perceive 12 vs 12.5.

The **smallest tier was 9px** and the most-used sizes were 10.5px (16 nodes) and
11px. That is below comfortable legibility, and Arabic script needs *more* room
than Latin at the same size (taller ascenders/descenders) — the Arabic UI was
being set at the same tiny sizes as the Latin one.

**Fix (conservative, evidence-led):** raised the floor — 9/10px → 10.5px for
eyebrows and micro-labels; added `font-optical-sizing: auto`; `text-wrap:
balance` on headings. A full 5-step scale migration was deliberately **not**
attempted: it touches 60+ declarations and risks real layout regressions for a
benefit this pass could not verify end-to-end.

### D5 — Interaction was hover-centric (severity: medium)

**Measured:** 39 `:hover` rules vs **5** `:active`. Apple §1: *respond on
pointer-down, not on release* — and on touch there is no hover, so a
hover-only affordance is either invisible or (worse) sticks after a tap.

`.btn:active` only cancelled the hover lift (`translateY(0)`) — no press
feedback at all.

**Fix:** real press feedback on `.btn` (`scale(.97)` + 80ms), joining the
existing `.mq` / `.msq` / `.dhikr-ring` press states.

### D6 — Touch targets under 44px (severity: medium)

**Measured at 390px:** quran tabs 86–124 × **36px**; switches 54 × **32px**;
history chips **43px**; theme swatches **40×40**; and on desktop, icon buttons
**37×37**.

**Fix:** a `@media (pointer:coarse)` block. Where the geometry carries meaning
(the switch knob) the **hit area** grows via an inset `::before` rather than
resizing the control, so the visual design is preserved and the target is not.

### D7 — Accessibility preferences partially handled (severity: medium)

Apple §14 asks for three independent signals. Only one existed, and it was a
sledgehammer:

```css
/* before — kills ALL feedback including comprehension aids */
*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important}
```

**Fix:** reduced motion now neutralises *movement* (transform, keyframes, smooth
scroll) while keeping short opacity/colour fades, so state changes still read as
feedback; plus new `prefers-reduced-transparency` (glass → solid) and
`prefers-contrast: more` (solid panes, defined borders, full-strength muted text)
blocks. The app uses `backdrop-filter` in 5 places, so the transparency
preference genuinely mattered.

---

## 3. Measurement traps I hit (and corrected)

Recording these because they nearly produced false findings — an audit that
reports artefacts as defects is worse than no audit:

1. **Gradients are not machine-measurable.** My first pass computed white
   sidebar text against the *body* background and reported 1.13:1 failures. The
   real background is a dark `linear-gradient`. Fix: detect `background-image`
   with `gradient(` and exclude — reported as unmeasurable rather than failing.
2. **Hidden overlays got measured.** Closed modals have `opacity: 0` on the
   *container*, so children kept a non-zero computed opacity. Fix: walk ancestors.
3. **Emoji were measured as text.** A 🕌 glyph reported 1.17:1. Emoji are colour
   glyphs; contrast maths does not apply. Fix: exclude emoji-only nodes.
4. **CSS transitions do not advance in a background tab.** This was the big one.
   `body` cross-fades its colour over 0.4s; in a non-visible tab the transition
   *freezes*, so `getComputedStyle` returned **mid-transition** colours. That is
   how a previous pass produced "11 contrast failures in midnight" where the
   settled value is **6.17:1**. Fix: inject `transition:none!important` before
   measuring so every read is a settled value. **Every contrast number in this
   document was taken that way.**
5. **The service worker served stale CSS.** `npm run web` rebuilds, but the SW
   kept serving the previous cache, making a verified fix look unapplied. Fix:
   unregister + clear caches before measuring. (Not a product bug: the cache key
   changes per build and `skipWaiting()` is called, so real users update on the
   next visit.)

---

## 4. Changes made

| File | Change |
|---|---|
| `styles/app.css` | calendar grid `minmax(0,1fr)` + `.cal-cell{min-width:0}`; mobile calendar gutters/padding; display-type tracking & leading; sahara `--text-muted` → `#7a6146`; `.btn:active` press feedback; reduced-motion rewritten; new `prefers-reduced-transparency` + `prefers-contrast`; `@media (pointer:coarse)` touch block; eyebrow tracking unified to 1.5px; micro-type floor; `font-optical-sizing`; `text-wrap: balance` |
| `scripts/test-contract.js` | §15 — 8 guards pinning each measured regression |

No JavaScript, markup, data format, API or Android configuration was touched.
The design work is confined to the stylesheet plus its guards.

## 5. Verification

```
node scripts/test-scheduler.js  → 74/74   exit 0
node scripts/test-contract.js   → 263/263 exit 0   (+8 design guards, was 255)
node scripts/check-dist.js      → PASS    exit 0
```

Post-fix measurements in a real browser:

- Calendar: 0/34 cells clipped at 320/360/390/414/768/1440px (was 9/34 at 390px).
- All 8 pages: 0 clipped elements, 0 document overflow at 320px.
- All 8 themes: muted text ≥4.5:1 (sahara 4.93, worst case 4.55).
- Display type: `.hero-cd` tracking `-0.52px` @52px, line-height `1.04`.
- All 8 pages still load and activate; RTL mode unchanged.

## 6. Not fixed — and why

Stated plainly rather than quietly omitted:

1. **The type scale is still not a 5-step system.** I raised the floor and fixed
   display tracking, but a true scale migration rewrites 60+ declarations across
   a 4,500-line UI and needs per-screen visual sign-off. Recommended as its own
   pass with screenshots per page.
2. **`.pcard.past{opacity:.42}`** deliberately de-emphasises past prayers. At
   42% the card's time is ~4:1 effective — intentional, but it is the one place
   where de-emphasis costs legibility. Left as a design decision, flagged.
3. **`--on-primary` (white) on midnight's `--primary` `#5b8aff` is 3.22:1** —
   fine for the bold 13.5px button labels it is used on, below 4.5:1 if it ever
   carries body text. Left alone; changing the brand blue was out of scope.
4. **Real touch-device verification:** the `(pointer:coarse)` rules cannot be
   exercised by this browser (it reports a fine pointer), so they were verified
   by declaration inspection and by forcing the same declarations and
   re-measuring the resulting target sizes. **Not verified on a physical touch
   device.**
5. **No visual sign-off.** I measured geometry, contrast and computed styles; I
   did not review rendered pixels by eye. Screenshots were captured to
   `tmp/audit-*.png` for a human pass.
