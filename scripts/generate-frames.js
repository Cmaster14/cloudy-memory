'use strict';

// Draws the placeholder orb (a glass sphere that fills with swirling smoke) and
// writes assets/frames/orb-[<variant>-]L<level>-<size>.png plus assets/icon.png.
// Variants (purple, green, mixed) are defined in src/frames.config.js.
// Run with `npm run frames` after editing src/frames.config.js.
//
// To use your own art instead, skip this script: drop PNGs with the same file
// names and sizes into assets/frames/.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { levels, sizes, blobCount, seed, colors, smoke, variants } = require('../src/frames.config');

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
// so consecutive frames read as one continuous animation. Every variant shares
// the same blobs, so purple, green and mixed animate identically.
const rand = mulberry32(seed);
const blobs = Array.from({ length: blobCount }, () => ({
  angle: rand() * Math.PI * 2,
  dist: Math.sqrt(rand()) * 0.62,
  size: 0.28 + rand() * 0.26,
  start: rand() * 0.55,
  dark: rand() > 0.5,
  spin: 0.6 + rand() * 0.8,
}));

// One layer of haze + blobs in a single palette. Gradient ids are suffixed with
// the palette name so two palettes can live in the same SVG.
function smokeLayer(t, R, blur, paletteName) {
  const p = smoke[paletteName];
  const body = blobs
    .map((b) => {
      const k = ease(clamp((t - b.start) / 0.4, 0, 1));
      if (k <= 0) return '';
      const a = b.angle + t * b.spin * 1.6;
      const d = b.dist * R * (0.6 + 0.4 * k);
      const x = 50 + Math.cos(a) * d;
      const y = 50 + Math.sin(a) * d * 0.9;
      const r = b.size * R * (0.5 + 0.9 * k);
      const fill = b.dark ? `url(#smokeDark-${paletteName})` : `url(#smokeLight-${paletteName})`;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fill}" opacity="${(0.85 * k).toFixed(3)}"/>`;
    })
    .join('');

  const haze = (ease(clamp((t - 0.25) / 0.75, 0, 1)) * 0.8).toFixed(3);
  const hazeLayer = t > 0.25 ? `<circle cx="50" cy="50" r="${R}" fill="${p.light}" opacity="${haze}"/>` : '';
  const blobLayer = body ? `<g filter="url(#soft)">${body}</g>` : '';
  return `${hazeLayer}${blobLayer}`;
}

function smokeGradients(paletteName) {
  const p = smoke[paletteName];
  return `
    <radialGradient id="smokeLight-${paletteName}">
      <stop offset="0" stop-color="${p.light}" stop-opacity="1"/>
      <stop offset="1" stop-color="${p.light}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="smokeDark-${paletteName}">
      <stop offset="0" stop-color="${p.dark}" stop-opacity="1"/>
      <stop offset="1" stop-color="${p.dark}" stop-opacity="0"/>
    </radialGradient>`;
}

// Two complementary regions split by an S-curve (like a yin-yang divider). The
// two paths share the same curve, so the regions meet edge to edge with no gap
// and no overlap, and each palette stays pure inside its own region. The
// divider turns slowly as the orb fills, so the split feels like part of the swirl.
function splitClips(t) {
  const angle = (-30 + t * 50).toFixed(2);
  const curve = 'C 80 75, 20 25, 50 0';
  return `
    <clipPath id="regionA"><path transform="rotate(${angle} 50 50)" d="M50 -20 L-30 -20 L-30 120 L50 120 L50 100 ${curve} Z"/></clipPath>
    <clipPath id="regionB"><path transform="rotate(${angle} 50 50)" d="M50 -20 L130 -20 L130 120 L50 120 L50 100 ${curve} Z"/></clipPath>`;
}

function buildSvg(t, size, variant) {
  const small = size <= 24;
  const R = small ? 46 : 44;
  const rimW = size <= 16 ? 7 : small ? 5.5 : 4;
  const blur = small ? 2.6 : 3.4;
  const c = colors;
  const palettes = variant.smoke;
  const split = palettes.length === 2;

  let smokeSvg;
  if (split) {
    smokeSvg = `<g clip-path="url(#regionA)">${smokeLayer(t, R, blur, palettes[0])}</g>
    <g clip-path="url(#regionB)">${smokeLayer(t, R, blur, palettes[1])}</g>`;
  } else {
    smokeSvg = smokeLayer(t, R, blur, palettes[0]);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 100 100">
  <defs>
    <clipPath id="orb"><circle cx="50" cy="50" r="${R}"/></clipPath>${split ? splitClips(t) : ''}
    <radialGradient id="glass" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="${c.glass}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${c.glass}" stop-opacity="0.18"/>
    </radialGradient>${palettes.map(smokeGradients).join('')}
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="${blur}"/>
    </filter>
  </defs>
  <circle cx="50" cy="50" r="${R}" fill="url(#glass)"/>
  <g clip-path="url(#orb)">${smokeSvg}</g>
  <circle cx="50" cy="50" r="${R}" fill="none" stroke="${c.rim}" stroke-opacity="0.75" stroke-width="${rimW}"/>
  <circle cx="50" cy="50" r="${(R - rimW / 2 - 1).toFixed(2)}" fill="none" stroke="${c.shine}" stroke-opacity="0.8" stroke-width="${small ? 1.8 : 1.4}"/>
  <ellipse cx="35" cy="30" rx="${small ? 9 : 11}" ry="${small ? 5 : 6}" transform="rotate(-35 35 30)" fill="${c.shine}" opacity="0.75"/>
</svg>`;
}

async function render(t, size, variant, file) {
  await sharp(Buffer.from(buildSvg(t, size, variant)))
    .resize(size, size, { kernel: 'lanczos3' })
    .png()
    .toFile(file);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let count = 0;
  for (const [name, variant] of Object.entries(variants)) {
    for (let level = 0; level < levels; level++) {
      const t = level / (levels - 1);
      for (const size of sizes) {
        await render(t, size, variant, path.join(OUT_DIR, `orb-${variant.prefix}L${level}-${size}.png`));
        count++;
      }
    }
    console.log(`  ${name}: done`);
  }
  // The installer icon is the clear orb, which looks the same in every variant.
  await render(0, 512, variants.purple, ICON_FILE);
  console.log(`Wrote ${count} frames to ${OUT_DIR} and ${ICON_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
