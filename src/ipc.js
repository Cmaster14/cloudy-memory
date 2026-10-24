'use strict';

const UNIT_MS = {
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
};

/**
 * Turns the window's request into a delay in ms, or returns an error message.
 * The page validates too, but this is the check that counts.
 */
function parseDelay({ amount, unit } = {}) {
  const n = typeof amount === 'string' ? Number(amount.trim() === '' ? NaN : amount) : amount;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return { error: 'Enter an amount greater than zero.' };
  if (!Object.hasOwn(UNIT_MS, unit)) return { error: 'Choose minutes, hours or days.' };
  return { delayMs: Math.round(n * UNIT_MS[unit]) };
}

/** Registers the reminder handlers. `ipcMain` and `trayApp` are injected. */
function registerReminderIpc({ ipcMain, trayApp }) {
  ipcMain.handle('reminders:list', () => trayApp.listReminders());

  ipcMain.handle('reminders:add', (_event, request) => {
    const parsed = parseDelay(request || {});
    if (parsed.error) return { ok: false, error: parsed.error };
    const note = request && typeof request.note === 'string' ? request.note : '';
    const added = trayApp.addReminder(parsed.delayMs, note);
    return added ? { ok: true } : { ok: false, error: 'That time is too far away to schedule.' };
  });

  ipcMain.handle('reminders:cancel', (_event, id) => ({ ok: typeof id === 'string' && trayApp.cancelReminder(id) }));
}

module.exports = { parseDelay, registerReminderIpc, UNIT_MS };
