'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOrb, HARD_CAP_MS } = require('../src/state');
const { createFileStorage } = require('../src/storage');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

function memoryStorage(initial = null) {
  let data = initial;
  return {
    load: () => data,
    save: (d) => {
      data = JSON.parse(JSON.stringify(d));
    },
    peek: () => data,
  };
}

function setup({ stored = null, rand = 0.5, minMs = 30 * MIN, maxMs = 48 * HOUR } = {}) {
  const clock = { t: 1_000_000_000 };
  const storage = memoryStorage(stored);
  let r = rand;
  const orb = createOrb({
    storage,
    now: () => clock.t,
    random: () => r,
    minMs,
    maxMs,
  });
  return { orb, clock, storage, setRandom: (v) => (r = v) };
}

test('fresh start: clear, with a saved deadline inside the allowed range', () => {
  const { orb, clock, storage } = setup({ rand: 0.5 });
  const status = orb.load();
  assert.equal(status.phase, 'clear');
  assert.equal(status.becameCloudyWhileAway, false);
  const wait = status.cloudyAt - clock.t;
  assert.ok(wait >= 30 * MIN && wait <= 48 * HOUR);
  assert.deepEqual(storage.peek(), { version: 1, phase: 'clear', cloudyAt: status.cloudyAt });
});

test('the wait is never longer than 48 hours, even if the config asks for more', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 0.999999999]) {
    const { orb, clock } = setup({ rand: r, maxMs: 500 * HOUR });
    const { cloudyAt } = orb.load();
    assert.ok(cloudyAt - clock.t <= HARD_CAP_MS, `random=${r}`);
  }
  assert.equal(HARD_CAP_MS, 48 * HOUR);
});

test('the shortest and longest picks hit the configured bounds', () => {
  const lowest = setup({ rand: 0 });
  assert.equal(lowest.orb.load().cloudyAt - lowest.clock.t, 30 * MIN);
  const highest = setup({ rand: 0.999999999 });
  assert.equal(highest.orb.load().cloudyAt - highest.clock.t, 48 * HOUR);
});

test('check() turns the orb cloudy once, exactly when the deadline passes', () => {
  const { orb, clock } = setup({ rand: 0 });
  const { cloudyAt } = orb.load();
  clock.t = cloudyAt - 1;
  assert.equal(orb.check(), false);
  assert.equal(orb.getPhase(), 'clear');
  clock.t = cloudyAt;
  assert.equal(orb.check(), true);
  assert.equal(orb.getPhase(), 'cloudy');
  assert.equal(orb.check(), false, 'only reports the transition once');
  assert.equal(orb.msUntilCloudy(), Infinity);
});

test('clicking a cloudy orb clears it and starts a new random wait', () => {
  const { orb, clock, storage, setRandom } = setup({ rand: 0 });
  const first = orb.load().cloudyAt;
  clock.t = first + 5 * HOUR;
  orb.check();
  setRandom(0.5);
  assert.equal(orb.clear(), true);
  const { phase, cloudyAt } = orb.snapshot();
  assert.equal(phase, 'clear');
  const wait = cloudyAt - clock.t;
  assert.ok(wait >= 30 * MIN && wait <= 48 * HOUR);
  assert.notEqual(cloudyAt, first);
  assert.equal(storage.peek().cloudyAt, cloudyAt);
});

test('clicking an orb that is already clear changes nothing', () => {
  const { orb, storage } = setup();
  const before = orb.load();
  const saved = JSON.stringify(storage.peek());
  assert.equal(orb.clear(), false);
  assert.deepEqual(orb.snapshot(), { phase: before.phase, cloudyAt: before.cloudyAt });
  assert.equal(JSON.stringify(storage.peek()), saved);
});

test('a restart keeps the same deadline', () => {
  const a = setup({ rand: 0.5 });
  const { cloudyAt } = a.orb.load();
  const b = setup({ stored: a.storage.peek() });
  b.clock.t = a.clock.t + HOUR;
  const status = b.orb.load();
  assert.equal(status.phase, 'clear');
  assert.equal(status.cloudyAt, cloudyAt);
});

test('a deadline that passed while the app was closed loads as cloudy', () => {
  const a = setup({ rand: 0 });
  const { cloudyAt } = a.orb.load();
  const b = setup({ stored: a.storage.peek() });
  b.clock.t = cloudyAt + 3 * HOUR;
  const status = b.orb.load();
  assert.equal(status.phase, 'cloudy');
  assert.equal(status.becameCloudyWhileAway, true);
});

test('a cloudy orb stays cloudy across restarts until clicked', () => {
  const b = setup({ stored: { version: 1, phase: 'cloudy', cloudyAt: null } });
  const status = b.orb.load();
  assert.equal(status.phase, 'cloudy');
  assert.equal(status.becameCloudyWhileAway, false);
});

test('a saved deadline more than 48 h away is pulled in to 48 h', () => {
  const t0 = 1_000_000_000;
  const { orb } = setup({ stored: { version: 1, phase: 'clear', cloudyAt: t0 + 100 * HOUR } });
  assert.equal(orb.load().cloudyAt, t0 + 48 * HOUR);
});

test('if the clock moves backwards, the wait is still capped at 48 h', () => {
  const { orb, clock } = setup({ rand: 0.999999999 });
  orb.load();
  clock.t -= 200 * HOUR;
  assert.equal(orb.check(), false);
  assert.ok(orb.msUntilCloudy() <= 48 * HOUR);
});

test('missing, corrupt or junk saved state starts a fresh timer', () => {
  for (const stored of [null, 'nonsense', { phase: 'banana' }, { phase: 'clear', cloudyAt: 'soon' }]) {
    const { orb, clock } = setup({ stored, rand: 0.5 });
    const status = orb.load();
    assert.equal(status.phase, 'clear');
    assert.ok(Number.isFinite(status.cloudyAt) && status.cloudyAt > clock.t);
  }
});

test('a storage failure does not crash the orb', () => {
  const orb = createOrb({
    storage: {
      load: () => {
        throw new Error('disk gone');
      },
      save: () => {
        throw new Error('disk gone');
      },
    },
    now: () => 1_000_000_000,
    random: () => 0,
  });
  const origError = console.error;
  console.error = () => {};
  try {
    assert.equal(orb.load().phase, 'clear');
  } finally {
    console.error = origError;
  }
});

test('debug helpers respect the 48 h cap', () => {
  const { orb, clock } = setup();
  orb.load();
  orb.setNextIn(1000 * HOUR);
  assert.equal(orb.snapshot().cloudyAt - clock.t, 48 * HOUR);
  assert.equal(orb.forceCloudy(), true);
  assert.equal(orb.getPhase(), 'cloudy');
  assert.equal(orb.forceCloudy(), false);
});

test('file storage round-trips and tolerates a missing or corrupt file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudy-memory-'));
  try {
    const file = path.join(dir, 'nested', 'state.json');
    const storage = createFileStorage(file);
    assert.equal(storage.load(), null);
    storage.save({ version: 1, phase: 'clear', cloudyAt: 123 });
    assert.deepEqual(storage.load(), { version: 1, phase: 'clear', cloudyAt: 123 });
    storage.save({ version: 1, phase: 'cloudy', cloudyAt: null });
    assert.equal(storage.load().phase, 'cloudy');
    assert.equal(fs.existsSync(`${file}.tmp`), false);
    fs.writeFileSync(file, '{ not json');
    assert.equal(storage.load(), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
