# SalahNest 1.6.5 — Release Readiness (Review Candidate)

## Status

This local candidate is based on public `main` commit `e8d649563f2dfa5cee859ae923aa944c5ea81987` plus the unreleased source-review commits. The visible brand is **SalahNest**; app version is `1.6.5`, Android version code is `13`, and the package ID remains `com.malek.prayertimes`. This note records the review state before any public push, tag, upload, Play submission, or Pages deployment.

The signed APK and signed Play App Bundle were built locally. **The Android build is not release-ready:** the required behavior—playing the adhan while the app is closed or the phone screen is locked—has not been tested on a real phone. Do not claim that behavior is proven or publish the Android build until the device checks below pass. A phone that is fully powered off cannot play audio; after reboot, the app must restore alarms once Android starts it.

## Verified candidate artifacts

- Automated tests passed: **447 total** — 74 scheduler, 299 contract, 7 motion, 46 alert, 8 UI-accessibility, 3 location-date, and 10 branding/download-card checks. The web/PWA and Android web-shell builds completed.
- `npm audit --omit=dev` reported **zero production dependency vulnerabilities**. A full lockfile audit reported 14 development/install-tree findings (4 moderate, 9 high, 1 critical); review/update the development toolchain before distributing the Windows/Electron build. No dependency changes were made during this review.
- `SalahNest-1.6.5.apk` is signed and passed the earlier `apksigner` check. Its package is `com.malek.prayertimes`, version `1.6.5`, code `13`, minimum SDK 24 and target SDK 36. SHA-256: `d3b9a54a1114f30a74116bbff5678a64821a3f25634ac07710f6c7ad4e6c9789` (52,339,937 bytes).
- `SalahNest-1.6.5.aab` is signed and its signature was verified during the build. Official standalone BundleTool 1.18.1 `validate` passed; its base manifest reports package `com.malek.prayertimes`, version `1.6.5`, code `13`. SHA-256: `a03679d78a10fd4719d7d5e553df43de8bacfa515d22222c198e827221c5c5f3` (51,364,947 bytes). Play Console processing and review remain separate.
- `SalahNest-Setup-1.6.5-unsigned.exe` is **not Authenticode-signed** and has not had an install/upgrade test. SHA-256: `7e82d583ec5e1d0ca6dcd03a09581fb8d6717b5d25fb7c52a8070ca5c7c90832` (121,852,257 bytes). Hold it from public distribution until signed with a trusted certificate and tested.
- The existing source archive is not tied to an exact final Git commit. Regenerate the public source archive from the reviewed final commit; do not publish the existing `SalahNest-Source-Candidate-1.6.5-Android-Built.zip` as though it were commit-provenanced.

## Remaining gates

1. **Real Android device:** test the adhan with the app not in the foreground, with the screen locked, and in Doze/battery saver; grant and revoke notification and exact-alarm access; test timezone changes, reboot restoration, and at least one target OEM's battery-management behavior. Android can defer or suppress delivery if users deny notifications/exact alarms or restrict background activity.
2. **Google Play:** complete the privacy-policy URL and in-app link, Data safety, location/permission, ads, target-audience, content-rating and app-access declarations; prepare and review the English/Arabic listing assets; complete applicable account verification, testing, review and rollout steps.
3. **Windows:** if a Windows installer is in scope, obtain a trusted code-signing certificate, sign the installer, then test clean install, upgrade, uninstall/data retention, notifications, tray/startup behavior and SmartScreen.
4. **Website:** update the download filename, version and size only after a public APK release link exists. Preserve the existing Pages URL, `.nojekyll` file and Google verification file.

Nothing in this preparation has been pushed, tagged, uploaded, submitted to Play, or deployed. Public action requires the owner's review and approval of the exact payload.
