'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeDisplay, reminderToastBody, TOOLTIP_MAX } = require('../src/display');

const text = { clearTooltip: 'Cloudy Memory', cloudyTooltip: 'You have forgotten something...' };
const rem = (note) => ({ note });

test('nothing cloudy: no set and the idle tooltip', () => {
  assert.deepEqual(computeDisplay({ orbPhase: 'clear', firedReminders: [], text }), {
    set: null,
    tooltip: 'Cloudy Memory',
  });
});

test('only the orb cloudy: purple with the original phrase', () => {
  assert.deepEqual(computeDisplay({ orbPhase: 'cloudy', firedReminders: [], text }), {
    set: 'purple',
    tooltip: 'You have forgotten something...',
  });
});

test('only a reminder: green with its note', () => {
  assert.deepEqual(computeDisplay({ orbPhase: 'clear', firedReminders: [rem('buy milk')], text }), {
    set: 'green',
    tooltip: 'buy milk',
  });
});

test('both: mixed, note first and the orb phrase on its own line', () => {
  assert.deepEqual(computeDisplay({ orbPhase: 'cloudy', firedReminders: [rem('buy milk')], text }), {
    set: 'mixed',
    tooltip: 'buy milk\nYou have forgotten something...',
  });
});

test('several reminders are summarised', () => {
  const d = computeDisplay({ orbPhase: 'clear', firedReminders: [rem('a'), rem('b'), rem('c')], text });
  assert.equal(d.tooltip, 'a (+2 more)');
});

test('an empty note falls back to a generic label', () => {
  assert.equal(computeDisplay({ orbPhase: 'clear', firedReminders: [rem('')], text }).tooltip, 'Reminder');
});

test('tooltips never exceed the Windows limit, and the orb phrase survives intact', () => {
  const long = 'z'.repeat(200);
  for (const orbPhase of ['clear', 'cloudy']) {
    const d = computeDisplay({ orbPhase, firedReminders: [rem(long), rem(long)], text });
    assert.ok(d.tooltip.length <= TOOLTIP_MAX, `${orbPhase}: ${d.tooltip.length}`);
    assert.ok(d.tooltip.includes('(+1 more)'));
    if (orbPhase === 'cloudy') assert.ok(d.tooltip.endsWith(text.cloudyTooltip));
  }
});

test('toast: the note for one reminder, a count for several', () => {
  const n = { customFallbackBody: 'A custom reminder is due.' };
  assert.equal(reminderToastBody([rem('call mom')], n), 'call mom');
  assert.equal(reminderToastBody([rem('')], n), 'A custom reminder is due.');
  assert.equal(reminderToastBody([rem('a'), rem('b')], n), '2 custom reminders are due.');
});
