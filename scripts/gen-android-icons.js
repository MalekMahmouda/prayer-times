'use strict';

/**
 * Generates the Android launcher icon set directly (no sharp dependency):
 *   android/app/src/main/res/mipmap-<dpi>/ic_launcher.png + ic_launcher_round.png
 *   plus adaptive-icon foreground layers (108dp grid → 432px at xxxhdpi).
 *
 * Everything renders from assets/icon-256.png via pngjs nearest-neighbor
 * scaling onto a solid dark background (Islamic theme #0d1616).
 * Run: npm run assets:android
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const SRC = path.join(ROOT, 'assets', 'icon-256.png');
const BG = { r: 13, g: 22, b: 22 }; // Islamic theme background #0d1616

const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

const src = PNG.sync.read(fs.readFileSync(SRC));

function renderCanvas(size, mode) {
  const png = new PNG({ width: size, height: size });
  // Paint background
  for (let i = 0; i < size * size; i++) {
    const idx = i << 2;
    png.data[idx] = BG.r; png.data[idx + 1] = BG.g; png.data[idx + 2] = BG.b; png.data[idx + 3] = 255;
  }
  // Icon footprint: 84% of canvas for plain icons, 66% inside the adaptive
  // 108dp grid (safe zone is the central 66dp of 108dp).
  const fill = mode === 'adaptive' ? 0.66 : 0.84;
  const iconSize = Math.round(size * fill);
  const ox = Math.round((size - iconSize) / 2);
  const oy = ox;
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const sx = Math.floor((x / iconSize) * src.width);
      const sy = Math.floor((y / iconSize) * src.height);
      const sidx = (src.width * sy + sx) << 2;
      const a = src.data[sidx + 3];
      if (a === 0) continue;
      const didx = (size * (y + oy) + (x + ox)) << 2;
      png.data[didx] = src.data[sidx];
      png.data[didx + 1] = src.data[sidx + 1];
      png.data[didx + 2] = src.data[sidx + 2];
      png.data[didx + 3] = a === 255 ? 255 : a;
    }
  }
  // Round mask for ic_launcher_round
  if (mode === 'round') {
    const cx = size / 2, cy = size / 2, r = size / 2;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (Math.sqrt(dx * dx + dy * dy) > r) png.data[(size * y + x) << 2 + 3] = 0;
      }
    }
  }
  return PNG.sync.write(png);
}

for (const [dpi, size] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${dpi}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), renderCanvas(size, 'square'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), renderCanvas(size, 'round'));
}
for (const [dpi, size] of Object.entries(ADAPTIVE)) {
  const dir = path.join(RES, `mipmap-${dpi}`);
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), renderCanvas(size, 'adaptive'));
}
console.log('launcher icons generated for:', Object.keys(DENSITIES).join(', '));
