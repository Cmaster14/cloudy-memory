'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createReminders, MAX_NOTE_LENGTH } = require('../src/reminders');

const MIN = 60 * 1000;

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

function setup(initial) {
  let t = 1_000_000;
  let n = 0;
  const storage = memoryStorage(initial);
  const make = () => createReminders({ storage, now: () => t, makeId: () => `id${++n}` });
  return { storage, make, advance: (ms) => (t += ms), clock: () => t };
}

test('add stores a pending reminder with an absolute due time', () => {
  const { make, clock } = setup();
  const r = make();
  const added = r.add(30 * MIN, '  call the dentist  ');
  assert.equal(added.note, 'call the dentist');
  assert.equal(added.dueAt, clock() + 30 * MIN);
  assert.equal(added.fired, false);
  assert.equal(r.pending().length, 1);
  assert.equal(r.fired().length, 0);
});

test('rejects non-positive and non-finite delays', () => {
  const r = setup().make();
  for (const bad of [0, -5, NaN, Infinity, '30', null, undefined]) assert.equal(r.add(bad, 'x'), null);
  assert.equal(r.all().length, 0);
});

test('there is no cap: very long delays are accepted', () => {
  const r = setup().make();
  const tenYears = 10 * 365 * 24 * 60 * MIN;
  assert.ok(r.add(tenYears, 'far away'));
  assert.equal(r.add(1e300, 'absurd'), null); // beyond what a Date can hold
});

test('long notes are trimmed to the maximum length; empty notes are allowed', () => {
  const r = setup().make();
  assert.equal(r.add(MIN, 'x'.repeat(500)).note.length, MAX_NOTE_LENGTH);
  assert.equal(r.add(2 * MIN, '   ').note, '');
  assert.equal(r.add(3 * MIN, 42).note, '');
});

test('reminders are kept sorted by due time and several can be pending', () => {
  const r = setup().make();
  r.add(90 * MIN, 'later');
  r.add(10 * MIN, 'soon');
  r.add(45 * MIN, 'middle');
  assert.deepEqual(r.pending().map((x) => x.note), ['soon', 'middle', 'later']);
});

test('check fires only reminders that are due, once each', () => {
  const { make, advance } = setup();
  const r = make();
  r.add(10 * MIN, 'a');
  r.add(20 * MIN, 'b');
  assert.deepEqual(r.check(), []);
  advance(10 * MIN);
  assert.deepEqual(r.check().map((x) => x.note), ['a']);
  assert.deepEqual(r.check(), [], 'already fired reminders are not reported again');
  advance(15 * MIN);
  assert.deepEqual(r.check().map((x) => x.note), ['b']);
  assert.equal(r.fired().length, 2);
  assert.equal(r.pending().length, 0);
});

test('several reminders due at once are fired together', () => {
  const { make, advance } = setup();
  const r = make();
  r.add(5 * MIN, 'a');
  r.add(6 * MIN, 'b');
  advance(60 * MIN);
  assert.equal(r.check().length, 2);
});

test('msUntilNext tracks the earliest pending reminder', () => {
  const { make, advance } = setup();
  const r = make();
  assert.equal(r.msUntilNext(), Infinity);
  r.add(30 * MIN, 'a');
  r.add(10 * MIN, 'b');
  assert.equal(r.msUntilNext(), 10 * MIN);
  advance(4 * MIN);
  assert.equal(r.msUntilNext(), 6 * MIN);
  advance(10 * MIN);
  assert.equal(r.msUntilNext(), 0, 'overdue but not yet checked');
  r.check();
  assert.equal(r.msUntilNext(), 16 * MIN, 'fired reminders no longer count');
});

test('cancel removes a pending or fired reminder', () => {
  const { make, advance } = setup();
  const r = make();
  const a = r.add(5 * MIN, 'a');
  const b = r.add(10 * MIN, 'b');
  assert.equal(r.cancel(a.id), true);
  assert.equal(r.cancel('nope'), false);
  advance(10 * MIN);
  r.check();
  assert.equal(r.cancel(b.id), true);
  assert.equal(r.all().length, 0);
});

test('dismissFired clears fired reminders and leaves pending ones alone', () => {
  const { make, advance } = setup();
  const r = make();
  r.add(5 * MIN, 'due');
  r.add(120 * MIN, 'not yet');
  advance(6 * MIN);
  r.check();
  assert.equal(r.dismissFired(), 1);
  assert.equal(r.dismissFired(), 0);
  assert.deepEqual(r.all().map((x) => x.note), ['not yet']);
});

test('reminders survive a restart', () => {
  const { make, storage } = setup();
  const first = make();
  first.add(30 * MIN, 'persisted');
  const second = make();
  const status = second.load();
  assert.deepEqual(status.becameDueWhileAway, []);
  assert.deepEqual(second.pending().map((x) => x.note), ['persisted']);
  assert.equal(storage.peek().version, 1);
});

test('reminders that came due while the app was closed are fired on load', () => {
  const { make, advance } = setup();
  const first = make();
  first.add(10 * MIN, 'missed');
  first.add(500 * MIN, 'future');
  advance(60 * MIN);
  const second = make();
  const status = second.load();
  assert.deepEqual(status.becameDueWhileAway.map((x) => x.note), ['missed']);
  assert.deepEqual(second.fired().map((x) => x.note), ['missed']);
  assert.deepEqual(second.pending().map((x) => x.note), ['future']);
});

test('a fired reminder stays fired across restarts until it is dismissed', () => {
  const { make, advance } = setup();
  const first = make();
  first.add(MIN, 'x');
  advance(2 * MIN);
  first.check();
  const second = make();
  second.load();
  assert.equal(second.fired().length, 1);
});

test('corrupt or hand-edited storage starts empty or drops only the bad entries', () => {
  for (const junk of [null, 'nonsense', 42, {}, { reminders: 'x' }, { reminders: [null, 5, {}] }]) {
    const r = setup(junk).make();
    assert.doesNotThrow(() => r.load());
    assert.equal(r.all().length, 0);
  }
  const good = { id: 'ok', note: 'keep me', createdAt: 1, dueAt: 9_000_000, fired: false };
  const r = setup({
    reminders: [
      good,
      { ...good }, // duplicate id
      { id: 'badtime', note: 'x', dueAt: 'soon' },
      { id: 'nan', note: 'x', dueAt: NaN },
    ],
  }).make();
  r.load();
  assert.deepEqual(r.all().map((x) => x.id), ['ok']);
});

test('a storage that throws never breaks the reminders', () => {
  const storage = {
    load: () => {
      throw new Error('disk gone');
    },
    save: () => {
      throw new Error('disk full');
    },
  };
  const r = createReminders({ storage, now: () => 1000 });
  assert.doesNotThrow(() => r.load());
  assert.ok(r.add(MIN, 'still works'));
});

test('returned reminders are copies, not live references', () => {
  const r = setup().make();
  r.add(MIN, 'a');
  r.pending()[0].note = 'tampered';
  assert.equal(r.pending()[0].note, 'a');
});
