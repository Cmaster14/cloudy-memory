'use strict';

// Draws the placeholder orb (a glass sphere that fills with swirling smoke) and
// writes assets/frames/orb-L<level>-<size>.png plus assets/icon.png.
// Run with `npm run frames` after editing src/frames.config.js.
//
// To use your own art instead, skip this script: drop PNGs with the same file
// names and sizes into assets/frames/.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { levels, sizes, blobCount, seed, colors } = require('../src/frames.config');

const OUT_DIR = path.join(__dirname, '..', 'assets', 'frames');
const ICON_FILE = path.join(__dirname, '..', 'assets', 'icon.png');

// Small seeded PRNG so every run draws the same smoke.
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ease = (x) => x * x * (3 - 2 * x);

// Each blob of smoke is fixed across levels; only its growth and swirl change,
// so consecutive frames read as one continuous animation.
const rand = mulberry32(seed);
const blobs = Array.from({ length: blobCount }, () => ({
  angle: rand() * Math.PI * 2,
  dist: Math.sqrt(rand()) * 0.62,
  size: 0.28 + rand() * 0.26,
  start: rand() * 0.55,
  dark: rand() > 0.5,
  spin: 0.6 + rand() * 0.8,
}));

function buildSvg(t, size) {
  const small = size <= 24;
  const R = small ? 46 : 44;
  const rimW = size <= 16 ? 7 : small ? 5.5 : 4;
  const blur = small ? 2.6 : 3.4;
  const c = colors;

  const smoke = blobs
    .map((b) => {
      const k = ease(clamp((t - b.start) / 0.4, 0, 1));
      if (k <= 0) return '';
      const a = b.angle + t * b.spin * 1.6;
      const d = b.dist * R * (0.6 + 0.4 * k);
      const x = 50 + Math.cos(a) * d;
      const y = 50 + Math.sin(a) * d * 0.9;
      const r = b.size * R * (0.5 + 0.9 * k);
      const fill = b.dark ? 'url(#smokeDark)' : 'url(#smokeLight)';
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fill}" opacity="${(0.85 * k).toFixed(3)}"/>`;
    })
    .join('');

  const haze = (ease(clamp((t - 0.25) / 0.75, 0, 1)) * 0.8).toFixed(3);
  const smokeLayer = smoke ? `<g filter="url(#soft)">${smoke}</g>` : '';
  const hazeLayer = t > 0.25 ? `<circle cx="50" cy="50" r="${R}" fill="${c.smokeLight}" opacity="${haze}"/>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
  <defs>
    <clipPath id="orb"><circle cx="50" cy="50" r="${R}"/></clipPath>
    <radialGradient id="glass" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="${c.glass}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${c.glass}" stop-opacity="0.18"/>
    </radialGradient>
    <radialGradient id="smokeLight">
      <stop offset="0" stop-color="${c.smokeLight}" stop-opacity="1"/>
      <stop offset="1" stop-color="${c.smokeLight}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="smokeDark">
      <stop offset="0" stop-color="${c.smokeDark}" stop-opacity="1"/>
      <stop offset="1" stop-color="${c.smokeDark}" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
  </defs>
  <circle cx="50" cy="50" r="${R}" fill="url(#glass)"/>
  <g clip-path="url(#orb)">${hazeLayer}${smokeLayer}</g>
  <circle cx="50" cy="50" r="${R}" fill="none" stroke="${c.rim}" stroke-opacity="0.75" stroke-width="${rimW}"/>
  <circle cx="50" cy="50" r="${(R - rimW / 2 - 1).toFixed(2)}" fill="none" stroke="${c.shine}" stroke-opacity="0.8" stroke-width="${small ? 1.8 : 1.4}"/>
  <ellipse cx="35" cy="30" rx="${small ? 9 : 11}" ry="${small ? 5 : 6}" transform="rotate(-35 35 30)" fill="${c.shine}" opacity="0.75"/>
</svg>`;
}

async function render(t, size, file) {
  await sharp(Buffer.from(buildSvg(t, size)))
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(file);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (let level = 0; level < levels; level++) {
    const t = level / (levels - 1);
    for (const size of sizes) {
      await render(t, size, path.join(OUT_DIR, `orb-L${level}-${size}.png`));
    }
  }
  await render(0, 512, ICON_FILE);
  console.log(`Wrote ${levels * sizes.length} frames to ${OUT_DIR} and ${ICON_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
