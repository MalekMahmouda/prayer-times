'use strict';

/**
 * Generate SalahNest desktop, Windows, favicon, and PWA icons from the approved
 * transparent logo master. Android launcher/splash density files are generated
 * separately by the source-only scripts/gen-android-icons.js and
 * scripts/gen-android-splash.js scripts; this does not invoke the Android SDK.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const MASTER = path.join(ASSETS, 'salahnest-logo-master.png');
const SIZES = [16, 32, 48, 64, 128, 192, 256, 512];
const ICO_SIZES = [16, 32, 48, 256];
const BACKGROUND = { r: 13, g: 22, b: 22 };

function resizeBilinear(src, dw, dh) {
  const out = new PNG({ width: dw, height: dh });
  const sw = src.width;
  const sh = src.height;
  for (let y = 0; y < dh; y++) {
    const sy = Math.max(0, Math.min(sh - 1, (y + 0.5) * sh / dh - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = Math.max(0, Math.min(sw - 1, (x + 0.5) * sw / dw - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const dst = (y * dw + x) * 4;
      const p00 = (y0 * sw + x0) * 4;
      const p10 = (y0 * sw + x1) * 4;
      const p01 = (y1 * sw + x0) * 4;
      const p11 = (y1 * sw + x1) * 4;
      const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const points = [p00, p10, p01, p11];
      let alpha = 0;
      const premultiplied = [0, 0, 0];
      for (let i = 0; i < 4; i++) {
        const a = src.data[points[i] + 3] / 255;
        const w = weights[i];
        alpha += a * w;
        for (let c = 0; c < 3; c++) premultiplied[c] += src.data[points[i] + c] * a * w;
      }
      out.data[dst + 3] = Math.round(alpha * 255);
      for (let c = 0; c < 3; c++) out.data[dst + c] = alpha ? Math.round(premultiplied[c] / alpha) : 0;
    }
  }
  return out;
}

function renderAppIcon(mark, size) {
  const logo = resizeBilinear(mark, size, size);
  const out = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) {
    const p = i * 4;
    const a = logo.data[p + 3] / 255;
    out.data[p] = Math.round(logo.data[p] * a + BACKGROUND.r * (1 - a));
    out.data[p + 1] = Math.round(logo.data[p + 1] * a + BACKGROUND.g * (1 - a));
    out.data[p + 2] = Math.round(logo.data[p + 2] * a + BACKGROUND.b * (1 - a));
    out.data[p + 3] = 255;
  }
  return out;
}

function buildIco(frames) {
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  const payloads = [];
  frames.forEach(({ size, png }, i) => {
    const p = 6 + i * 16;
    header[p] = size === 256 ? 0 : size;
    header[p + 1] = size === 256 ? 0 : size;
    header[p + 2] = 0;
    header[p + 3] = 0;
    header.writeUInt16LE(1, p + 4);
    header.writeUInt16LE(32, p + 6);
    header.writeUInt32LE(png.length, p + 8);
    header.writeUInt32LE(offset, p + 12);
    offset += png.length;
    payloads.push(png);
  });
  return Buffer.concat([header, ...payloads]);
}

function main() {
  if (!fs.existsSync(MASTER)) throw new Error(`Missing logo master: ${MASTER}`);
  fs.mkdirSync(ASSETS, { recursive: true });
  const mark = PNG.sync.read(fs.readFileSync(MASTER));
  if (mark.width !== mark.height) throw new Error('Logo master must be square');
  fs.writeFileSync(path.join(ASSETS, 'salahnest-mark.png'), fs.readFileSync(MASTER));
  fs.mkdirSync(path.join(ROOT, 'android-assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'android-assets', 'logo.png'), fs.readFileSync(MASTER));

  const pngs = new Map();
  for (const size of SIZES) {
    const png = PNG.sync.write(renderAppIcon(mark, size));
    pngs.set(size, png);
    fs.writeFileSync(path.join(ASSETS, `icon-${size}.png`), png);
    console.log(`assets/icon-${size}.png`);
  }
  const ico = buildIco(ICO_SIZES.map((size) => ({ size, png: pngs.get(size) })));
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);
  fs.writeFileSync(path.join(ROOT, 'icon.ico'), ico);
  console.log('assets/icon.ico and icon.ico (16, 32, 48, 256 px)');
  console.log('assets/salahnest-mark.png and android-assets/logo.png');
}

main();
