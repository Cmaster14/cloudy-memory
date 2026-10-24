'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDelay, registerReminderIpc } = require('../src/ipc');

const MIN = 60 * 1000;

test('parseDelay converts amount and unit to milliseconds', () => {
  assert.equal(parseDelay({ amount: 30, unit: 'minutes' }).delayMs, 30 * MIN);
  assert.equal(parseDelay({ amount: '2', unit: 'hours' }).delayMs, 120 * MIN);
  assert.equal(parseDelay({ amount: 1.5, unit: 'days' }).delayMs, 36 * 60 * MIN);
});

test('parseDelay rejects bad amounts and units', () => {
  for (const amount of [0, -1, NaN, Infinity, '', '  ', 'abc', null, undefined, {}]) {
    assert.ok(parseDelay({ amount, unit: 'minutes' }).error, `amount ${String(amount)}`);
  }
  for (const unit of ['weeks', '', undefined, 'constructor', '__proto__']) {
    assert.ok(parseDelay({ amount: 5, unit }).error, `unit ${String(unit)}`);
  }
  assert.ok(parseDelay().error);
});

function fakeIpc() {
  const handlers = {};
  return { handle: (name, fn) => (handlers[name] = fn), call: (name, ...args) => handlers[name]({}, ...args) };
}

test('the IPC handlers validate again in the main process and pass through to the app', () => {
  const ipcMain = fakeIpc();
  const added = [];
  const trayApp = {
    listReminders: () => ({ pending: [], fired: [] }),
    addReminder: (ms, note) => (ms > 1e15 ? null : (added.push([ms, note]), { id: 'x' })),
    cancelReminder: (id) => id === 'x',
  };
  registerReminderIpc({ ipcMain, trayApp });

  assert.deepEqual(ipcMain.call('reminders:list'), { pending: [], fired: [] });
  assert.deepEqual(ipcMain.call('reminders:add', { amount: 5, unit: 'minutes', note: 'hi' }), { ok: true });
  assert.deepEqual(added, [[5 * MIN, 'hi']]);
  assert.equal(ipcMain.call('reminders:add', { amount: -5, unit: 'minutes' }).ok, false);
  assert.equal(ipcMain.call('reminders:add', null).ok, false);
  assert.equal(ipcMain.call('reminders:add', { amount: 1e300, unit: 'days' }).ok, false);
  assert.deepEqual(ipcMain.call('reminders:add', { amount: 1, unit: 'hours', note: 42 }), { ok: true });
  assert.equal(added.at(-1)[1], '', 'a non-string note is ignored');
  assert.deepEqual(ipcMain.call('reminders:cancel', 'x'), { ok: true });
  assert.deepEqual(ipcMain.call('reminders:cancel', 'nope'), { ok: false });
  assert.deepEqual(ipcMain.call('reminders:cancel', 7), { ok: false });
});
