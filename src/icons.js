'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { levels, sizes, scales, variants } = require('./frames.config');

/** assets/frames/orb-[<variant prefix>]L<level>-<size>.png ('purple' has no prefix) */
function frameFile(dir, level, size, variant = 'purple') {
  const { prefix } = variants[variant];
  return path.join(dir, `orb-${prefix}L${level}-${size}.png`);
}

/** Builds the multi-resolution frames for one variant. */
function loadVariant(dir, nativeImage, variant) {
  return Array.from({ length: levels }, (_, level) => {
    const image = nativeImage.createEmpty();
    for (const size of sizes) {
      image.addRepresentation({
        scaleFactor: scales[size],
        buffer: fs.readFileSync(frameFile(dir, level, size, variant)),
      });
    }
    return image;
  });
}

/**
 * Builds one multi-resolution nativeImage per smoke level so Windows can pick
 * the sharpest size for the current display scaling (100%, 150%, 200%...).
 * With no variant it returns the default purple frames as an array (the
 * original behaviour); with `{ all: true }` it returns { purple, green, mixed }.
 */
function loadFrames(dir, nativeImage, { all = false, variant = 'purple' } = {}) {
  if (!all) return loadVariant(dir, nativeImage, variant);
  return Object.fromEntries(Object.keys(variants).map((v) => [v, loadVariant(dir, nativeImage, v)]));
}

module.exports = { loadFrames, frameFile };
