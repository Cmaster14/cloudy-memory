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
  colors: {
    glass: '#cfe8ff',
    smokeLight: '#d8d0ee',
    smokeDark: '#5a4a86',
    rim: '#10131f',
    shine: '#ffffff',
  },
};
