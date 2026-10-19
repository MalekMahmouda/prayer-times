# Typography — bundled fonts

The application ships **all** of its fonts locally in `fonts/*.woff2`; no
remote font server is consulted at runtime (two legacy CDN *fallback* URLs for
the Amiri faces remain second-choice after the local files).

| Family | Role | Weights bundled | Files |
|---|---|---|---|
| **Cairo** | Entire UI — navigation, menus, headings, prayer names & times, countdown, buttons, forms, all English text | 400 / 500 / 600 / 700 (latin + arabic subsets) | `fonts/cairo-latin-*.woff2`, `fonts/cairo-arabic-*.woff2` |
| **Noto Naskh Arabic** | Quran reader + mushaf Arabic only | 400 / 700 (arabic + latin subsets) | `fonts/notonaskharabic-*.woff2` |
| Amiri Quran | Mushaf fallback (kept from ≤1.5.0) | 400 | `fonts/amiri-quran-regular.woff2` |
| Amiri | Mushaf fallback | 700 | `fonts/amiri-bold.woff2` |

System fallbacks: **Tahoma, Arial, sans-serif** (`--font-ar` / `--font`in
`styles/app.css`). The family tokens:

- `--font` — UI (Cairo, then Segoe UI / system)
- `--font-ar` — Arabic UI text (Cairo, then Segoe UI / Tahoma / Arial)
- `--font-quran` — `Noto Naskh Arabic`, `Amiri Quran`, `Amiri`, then `--font-ar`

## Sources

- Cairo — Google Fonts (OFL): https://fonts.google.com/specimen/Cairo
  WOFF2 per subset/weight from the Fontsource packaging of the Google release
  (`cdn.jsdelivr.net/fontsource/fonts/cairo@latest/<subset>-<weight>-normal.woff2`).
- Noto Naskh Arabic — Google Fonts (OFL):
  https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic
  Same Fontsource packaging (`noto-naskh-arabic@latest`).
- Amiri — https://github.com/aliftype/amiri (OFL 1.1), already bundled.

## Licences

Both new families are distributed under the **SIL Open Font License 1.1**:

- `fonts/OFL-Cairo.txt`
- `fonts/OFL-NotoNaskhArabic.txt`
- Amiri's OFL statement appears in its upstream repository; bundled files
  downloaded from the same OFL distribution.

## Where the files are wired in

- **Desktop (Electron):** `prayer-times.html`, `adhan.html` and `widget.html`
  all load `styles/fonts.css`; `electron-builder` packs `fonts/**/*` into the
  asar (see the `files:` list in `package.json`).
- **Android:** `scripts/build-www.js` copies every `fonts/*.woff2` into
  `www/fonts/`; `cap sync android` then copies `www/` into the APK assets.
- **Web/PWA:** `scripts/build-web.js` enumerates `fonts/*.woff2` into the
  service-worker precache shell, so every face is available offline.

## Fonts not bundled on purpose

- No italic (the app never italicises text).
- No Cairo 200/300/800/900 and no Noto Naskh 500/600 — no rule requests them;
  `app.css` caps display weights at 700 (`--fw-bold`) to keep files out.

## Verification hooks

- `node scripts/check-dist.js` asserts every `fonts/…woff2` referenced from
  `styles/fonts.css` exists on disk **and** is present in the packaged asar.
- Guarded rendering checks (fonts actually applied) live in the design-review
  capture process; see `docs/design-review/README.md`.
