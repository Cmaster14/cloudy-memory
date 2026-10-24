'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { levels, sizes, variants } = require('../src/frames.config');
const { frameFile } = require('../src/icons');

const dir = path.join(__dirname, '..', 'assets', 'frames');

test('every smoke level exists at every size, for every variant, as a PNG of the right dimensions', () => {
  for (const variant of Object.keys(variants)) {
    for (let level = 0; level < levels; level++) {
      for (const size of sizes) {
        const buf = fs.readFileSync(frameFile(dir, level, size, variant));
        const id = `${variant} L${level}-${size}`;
        assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', `${id} is a PNG`);
        assert.equal(buf.readUInt32BE(16), size, `${id} width`);
        assert.equal(buf.readUInt32BE(20), size, `${id} height`);
      }
    }
  }
});

test('the app icon is at least 256 px for the Windows installer', () => {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.png'));
  assert.ok(buf.readUInt32BE(16) >= 256 && buf.readUInt32BE(20) >= 256);
});
