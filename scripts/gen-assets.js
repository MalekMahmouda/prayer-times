'use strict';

/**
 * Generates assets/icon-{16,32,48,64,128,256}.png from the largest PNG
 * entry inside icon.ico (256x256), using pngjs for resizing.
 * Run: node scripts/gen-assets.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
const SIZES = [16, 32, 48, 64, 128, 256];

function icoLargestPng(icoPath) {
  const buf = fs.readFileSync(icoPath);
  const count = buf.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = buf[off] || 256;
    const size = buf.readUInt32LE(off + 8);
    const start = buf.readUInt32LE(off + 12);
    const sig = buf.slice(start, start + 4).toString('hex');
    if (sig === '89504e47' && (!best || w > best.w)) best = { w, size, start };
  }
  if (!best) throw new Error('No PNG entry found in icon.ico');
  return buf.slice(best.start, best.start + best.size);
}

function bilinear(src, sw, sh, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * sh / dh - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * sw / dw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const p00 = src.data[(y0 * sw + x0) * 4 + c];
        const p10 = src.data[(y0 * sw + x1) * 4 + c];
        const p01 = src.data[(y1 * sw + x0) * 4 + c];
        const p11 = src.data[(y1 * sw + x1) * 4 + c];
        out.data[(y * dw + x) * 4 + c] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) +
          p01 * (1 - fx) * fy + p11 * fx * fy;
      }
    }
  }
  return out;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'icon.ico'), path.join(OUT, 'icon.ico'));

  const pngBuf = icoLargestPng(path.join(ROOT, 'icon.ico'));
  const src = PNG.sync.read(pngBuf);
  console.log(`source: ${src.width}x${src.height}`);

  for (const size of SIZES) {
    const img = src.width === size ? src : bilinear(src, src.width, src.height, size, size);
    fs.writeFileSync(path.join(OUT, `icon-${size}.png`), PNG.sync.write(img));
    console.log(`assets/icon-${size}.png ✓`);
  }
  console.log('done');
}

main();
