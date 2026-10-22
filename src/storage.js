'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Tiny JSON file store. Writes go to a temp file first and are then renamed
 * over the real one, so a crash mid-write can't leave a half-written file.
 */
function createFileStorage(file) {
  return {
    load() {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        return null; // missing or corrupt: caller starts fresh
      }
    },
    save(data) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createFileStorage };
