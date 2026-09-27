'use strict';

/**
 * Generates the Android splash screens ( Capacitor reads drawable-/drawable-port-/
 * drawable-land-* splash.png ) from assets/icon-256.png:
 *   dark Islamic background + centered icon at 30% of the min edge.
 * Run: npm run assets:android
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const SRC = path.join(ROOT, 'assets', 'icon-256.png');
const BG = { r: 13, g: 22, b: 22 };

const src = PNG.sync.read(fs.readFileSync(SRC));

// Capacitor splash densities (portrait + landscape)
const PORTRAIT = { mdpi: [480, 800], hdpi: [720, 1280], xhdpi: [960, 1600], xxhdpi: [1440, 2560], xxxhdpi: [1920, 3200] };

function compose(w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const idx = i << 2;
    png.data[idx] = BG.r; png.data[idx + 1] = BG.g; png.data[idx + 2] = BG.b; png.data[idx + 3] = 255;
  }
  const iconSize = Math.round(Math.min(w, h) * 0.3);
  const ox = Math.round((w - iconSize) / 2);
  const oy = Math.round((h - iconSize) / 2);
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const sx = Math.floor((x / iconSize) * src.width);
      const sy = Math.floor((y / iconSize) * src.height);
      const sidx = (src.width * sy + sx) << 2;
      if (src.data[sidx + 3] === 0) continue;
      const didx = (w * (y + oy) + (x + ox)) << 2;
      png.data[didx] = src.data[sidx];
      png.data[didx + 1] = src.data[sidx + 1];
      png.data[didx + 2] = src.data[sidx + 2];
      png.data[didx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

for (const [dpi, [pw, ph]] of Object.entries(PORTRAIT)) {
  const pdir = path.join(RES, `drawable-port-${dpi}`);
  const ldir = path.join(RES, `drawable-land-${dpi}`);
  fs.mkdirSync(pdir, { recursive: true });
  fs.mkdirSync(ldir, { recursive: true });
  fs.writeFileSync(path.join(pdir, 'splash.png'), compose(pw, ph));
  // landscape: swap dimensions
  fs.writeFileSync(path.join(ldir, 'splash.png'), compose(ph, pw));
}
console.log('splash screens generated (portrait + landscape, 5 densities)');
