'use strict';

/**
 * Cross-platform Gradle wrapper launcher for the APK scripts.
 *
 * `npm run apk` used to call `gradlew.bat` directly, so it only worked on
 * Windows. This picks the right wrapper per platform and forwards args.
 *
 * Usage: node scripts/apk-gradle.js assembleRelease [extra args…]
 */

const { spawnSync } = require('child_process');
const path = require('path');

const task = process.argv[2] || 'assembleRelease';
const extra = process.argv.slice(3);

const androidDir = path.join(__dirname, '..', 'android');
const wrapper = process.platform === 'win32'
  ? path.join(androidDir, 'gradlew.bat')
  : path.join(androidDir, 'gradlew');

const env = { ...process.env };
if (!env.JAVA_HOME) {
  // Local dev convenience: the toolchain used by this repo (see docs/ANDROID.md).
  const fallback = process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, '.pt-android', 'jdk-21')
    : null;
  if (fallback && require('fs').existsSync(fallback)) env.JAVA_HOME = fallback;
}

// Build the command line manually: the project path contains spaces, and
// spawnSync(shell:true) does not quote args on Windows — the .bat path must
// arrive pre-quoted.
const quote = (s) => (s.startsWith('"') && s.endsWith('"')) ? s : `"${s}"`;
const cmdLine = [quote(wrapper), task, '--no-daemon', ...extra.map(quote)].join(' ');
const res = spawnSync(cmdLine, {
  cwd: androidDir,
  stdio: 'inherit',
  env,
  shell: true, // gradlew.bat needs a shell on Windows; sh runs ./gradlew elsewhere
});

if (res.error) {
  console.error('apk-gradle: failed to launch gradle wrapper:', res.error.message);
  process.exit(1);
}
process.exit(res.status == null ? 1 : res.status);
