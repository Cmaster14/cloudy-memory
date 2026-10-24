'use strict';

// Shared by scripts/generate-frames.js (which draws the placeholder art) and
// src/icons.js (which loads it). If you bring your own art, keep the file
// names and sizes below and nothing else needs to change.
module.exports = {
  // Frame 0 is fully clear, the last frame is fully clouded.
  levels: 9,

  // Pixel sizes written per frame, and the display scale each one serves.
  sizes: [16, 24, 32, 48],
  scales: { 16: 1, 24: 1.5, 32: 2, 48: 3 },

  // Placeholder art only.
  seed: 7,
  blobCount: 16,

  // Glass, rim and highlight are shared by every variant.
  colors: {
    glass: '#cfe8ff',
    rim: '#10131f',
    shine: '#ffffff',
  },

  // Smoke palettes. `light` is the haze and pale wisps, `dark` the dense blobs.
  smoke: {
    purple: { light: '#d8d0ee', dark: '#5a4a86' },
    green: { light: '#cdeed2', dark: '#2f7d4b' },
  },

  // Icon sets. `smoke` lists the palettes used: one entry fills the whole orb,
  // two entries split the orb into two hard-edged regions (no blending).
  // `prefix` is added to the file name; the default set keeps the original
  // names (orb-L0-16.png) so existing code and tests are unaffected.
  variants: {
    purple: { prefix: '', smoke: ['purple'] }, // the default (regular reminder)
    green: { prefix: 'green-', smoke: ['green'] }, // custom reminder
    mixed: { prefix: 'mixed-', smoke: ['purple', 'green'] }, // both at once
  },
};
