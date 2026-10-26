# SalahNest branding and URL change — review notes

## The staged mark

The quiet-prayer mark uses a pointed prayer-arch, crescent and dawn over a calm teal/ivory palette. Its approved display name is still rendered as text, not baked into the symbol. The reviewed artwork was generated as a transparent image and cleaned only by removing faint exterior alpha fragments; no horizontal artifact remains in the final master.

- Master PNG: [`assets/salahnest-logo-master.png`](../assets/salahnest-logo-master.png)
- Shared transparent symbol used by app surfaces: [`assets/salahnest-mark.png`](../assets/salahnest-mark.png)
- Logo preview (mark, tile and wordmark): [`assets/salahnest-logo-preview.png`](../assets/salahnest-logo-preview.png)
- 1200 × 630 social/Open Graph preview: [`assets/social-preview.png`](../assets/social-preview.png)
- Editable review-card layout: [`docs/branding-review.html`](branding-review.html)

## Where it is integrated

The shared icon generator, `scripts/gen-assets.js`, now derives the 16/32/48/64/128/192/256/512 px app icons and multi-size `assets/icon.ico`/root `icon.ico` from the master. `scripts/gen-android-icons.js` and `scripts/gen-android-splash.js` use the same mark for Android mipmap, adaptive-icon, orientation/density splash, `android-assets/logo.png`, `android-assets/splash.png`, and the native drawable splash sources. This is image/source generation only; it does not run Android tooling.

The PWA manifest, favicon and service-worker shell use the regenerated app icons. The website and Android web shell display `assets/salahnest-mark.png`; `assets/social-preview.png` is included in website metadata and build output. The English/Arabic READMEs and current GitHub download/source links use the new name/slug. The visible name remains **SalahNest** in desktop/app surfaces, while the Android package ID, URL scheme, local-data location and npm package identity remain unchanged.

## URL mapping and old-link impact

| Purpose | Existing public URL | Staged new URL |
| --- | --- | --- |
| Repository | `https://github.com/MalekMahmouda/prayer-times` | `https://github.com/MalekMahmouda/salahnest` |
| GitHub Pages project site | `https://malekmahmouda.github.io/prayer-times/` | `https://malekmahmouda.github.io/salahnest/` |

The source candidate updates its current repository/site references, canonical URL, sitemap, robots file, and PWA scope/base path to the new destinations. A source scan found no remaining direct references to the old repository slug or old Pages path in current files; historical Android package/application and user-data identifiers intentionally stay as-is.

**Important:** GitHub documents the old Pages project URL as an exception to repository-rename redirects. A repository rename does not automatically forward the old project-site URL. The old URL and any external bookmarks/download references can therefore break if the live repository is renamed without a separately maintained legacy page/site or another approved migration route. This candidate does not implement or publish a redirect. Leave the current live site untouched until the owner approves the transition plan.

## Exact protected Pages files

The Pages build candidate is based on `d88ddd34cde6dcf9739ef987bc16c13ba370e620`. The staged source and generated Pages output preserve `.nojekyll` as a zero-byte file and preserve `google4d2e2a5dfbddfa49.html` byte-for-byte from that Pages revision. Automated checks compare the build output with the source bytes.

## Changed source surfaces

The source diff updates `CHANGES.md`, `README.md`, `README.ar.md`, `prayer-times.html`, `js/extras.js`, `styles/app.css`, `styles/companion.css`, `scripts/build-web.js`, `scripts/build-www.js`, `scripts/gen-assets.js`, `scripts/gen-android-icons.js`, `scripts/gen-android-splash.js`, `scripts/test-branding.js`, `scripts/test-built-branding.js`, and `docs/RELEASE-CHECKLIST.md`; it also preserves the existing Google verification HTML and adds `.nojekyll`.

The brand artwork/outputs are `assets/salahnest-logo-master.png`, `assets/salahnest-mark.png`, `assets/salahnest-logo-preview.png`, `assets/social-preview.png`, regenerated `assets/icon-{16,32,48,64,128,192,256,512}.png`, `assets/icon.ico`, root `icon.ico`, `android-assets/logo.png`, `android-assets/splash.png`, Android `drawable/splash.png`, all `drawable-port-*`/`drawable-land-*` splash images, and all `mipmap-*` launcher/foreground/round icons. The review layout is `docs/branding-review.html`.

The Pages-only candidate contains the generated static site from `dist-web/`, including the new `/salahnest/` metadata and PWA files, with the two protected files verified unchanged. The exact local candidate commit IDs and file-level diff summary accompany this review in the owner-facing handoff.

## Verification and limits

The existing Node suite passed 448 checks. The built-web branding tests passed 3/3, available runtime asset validation passed, and a local Chromium PWA smoke test returned HTTP 200 at `/salahnest/` with no browser-console errors or failed requests. The checker's asar-list section was skipped because `tmp/asar-list.txt` was not generated; its synced Android-public section was skipped because `cap sync` was not run. The Android icon/splash sources were generated, but no Android SDK, Gradle, APK or AAB build was run. Windows app-directory packaging completed; NSIS could not finish because the environment lacks Wine, so there is no verified new installer. No candidate was pushed, published, signed, installed, or deployed.

Source: [GitHub — Renaming a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)
