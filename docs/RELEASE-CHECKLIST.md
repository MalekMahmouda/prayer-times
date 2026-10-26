# SalahNest 1.6.5 — Branding and URL Migration Review

## Current status

This is a local, unpublished review candidate based on source commit `bfd3aea9bf51436374628582c2ca09f3aefd4f88`; the separate Pages build candidate starts from `d88ddd34cde6dcf9739ef987bc16c13ba370e620`. The visible name is **SalahNest**, the proposed repository is `MalekMahmouda/salahnest`, and the proposed Pages URL is `https://malekmahmouda.github.io/salahnest/`. Public `main` (`e8d649563f2dfa5cee859ae923aa944c5ea81987`), public `gh-pages` (`c45f29d00ee139f952fa05867e138c72eba509c8`) and release `v1.6.4` have not been changed.

The Android package/application ID remains `com.malek.prayertimes`; the Windows user-data folder remains `%APPDATA%\\Prayer Times`; and no signing key was copied or changed. The prior 1.6.5 APK/AAB and the owner's earlier successful closed-app/locked-screen Adhan phone test predate this logo integration. They do not validate a newly branded APK/AAB.

## Verified in this candidate

- `npm test` passed all 448 checks: 74 scheduler, 299 contract, 7 motion, 46 alert, 8 UI-accessibility, 3 location-date, and 11 product-brand checks.
- `npm run web` completed. Three generated-branding checks passed. `scripts/check-dist.js` passed for the available runtime assets; its asar-list section was skipped because `tmp/asar-list.txt` was not generated, and its synced Android-public section was skipped because `cap sync` was not run.
- A Chromium smoke test served the built PWA locally under `/salahnest/`: HTTP 200, the mark loaded (1024 px source), the canonical URL and manifest link were correct, and there were no console errors or failed requests.
- `.nojekyll` is still empty and `google4d2e2a5dfbddfa49.html` is byte-identical to the existing Pages candidate. Their SHA-256 values are respectively `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` and `47eb6e50441605a4dc27dffbb9a38dfddcabaa3ba9ad687a2d688fe5b5edf030`.
- Android launcher, adaptive, splash, website, and PWA source assets were regenerated from the shared transparent mark. **No Android SDK, Gradle, `apksigner`, APK, or AAB build was run.** The icon changes are not yet present in a new Android package.
- Electron packaging produced the `dist/win-unpacked` app directory, but the NSIS installer step stopped because Wine is unavailable (`spawn wine ENOENT`). The incomplete installer stub was discarded. The existing Windows installer remains unsigned and not install-tested; this candidate has no verified installer.
- The prior dependency audit recorded zero production vulnerabilities and 14 development/install-tree findings (4 moderate, 9 high, 1 critical); no dependencies were added or changed here.

## Before any release

1. Review and approve the exact logo preview, changed-file list, and final source/Pages payload. Do not push, rename the live repository, tag, upload, release, or deploy before that approval.
2. A fresh explicit approval is required before any Android SDK or Gradle use for this logo build. Do not accept the 2019 SDK license again or accept any additional legal terms. If authorized later, build with the existing signing key, then test the changed APK on a real device—especially Adhan while the app is backgrounded and the phone is locked—before distribution.
3. Rebuild the Windows installer in a suitable environment. Keep it unsigned unless a trusted signing certificate is supplied; install/upgrade/uninstall testing and Windows notification/tray checks remain outstanding.
4. Plan the old Pages address separately. A GitHub repository rename changes the project-site URL; the old Pages URL does not automatically redirect. Keep a legacy site/repository or prepare a separately reviewed redirect before changing the live repository name.
5. After approval and publication, verify the new Pages URL, `.nojekyll`, Google ownership file, release links, and PWA installation/update behavior from the public site.

The work remains local and unpublished. No public repository, release, package, or Pages site was changed.
