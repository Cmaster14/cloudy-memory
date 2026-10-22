'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { levels, sizes, scales } = require('./frames.config');

/** assets/frames/orb-L<level>-<size>.png */
function frameFile(dir, level, size) {
  return path.join(dir, `orb-L${level}-${size}.png`);
}

/**
 * Builds one multi-resolution nativeImage per smoke level so Windows can pick
 * the sharpest size for the current display scaling (100%, 150%, 200%...).
 */
function loadFrames(dir, nativeImage) {
  return Array.from({ length: levels }, (_, level) => {
    const image = nativeImage.createEmpty();
    for (const size of sizes) {
      image.addRepresentation({
        scaleFactor: scales[size],
        buffer: fs.readFileSync(frameFile(dir, level, size)),
      });
    }
    return image;
  });
}

module.exports = { loadFrames, frameFile };
