'use strict';

const REMINDERS_VERSION = 1;
const MAX_NOTE_LENGTH = 200;
// Largest timestamp a JS Date can represent. There is deliberately no other
// cap on how far ahead a custom reminder may be set.
const MAX_TIMESTAMP = 8.64e15;

/**
 * Custom reminders: pure logic with no Electron, timers or disk of its own,
 * in the same spirit as state.js. Each reminder has an absolute `dueAt`
 * timestamp, so reminders survive restarts and PC sleep: anything that came
 * due while nothing was running is simply fired the next time check() looks.
 *
 *   { id, note, createdAt, dueAt, fired }
 *
 * Any number of reminders can be pending at once.
 */
function createReminders({
  storage,
  now = Date.now,
  makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
}) {
  let items = [];

  const byDueAt = (a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt;
  const cleanNote = (note) => (typeof note === 'string' ? note.trim().slice(0, MAX_NOTE_LENGTH) : '');
  const validTimestamp = (n) => Number.isSafeInteger(n) && n >= 0 && n <= MAX_TIMESTAMP;

  function persist() {
    try {
      storage.save({ version: REMINDERS_VERSION, reminders: items });
    } catch (err) {
      // Best effort: a failed save must never take the tray icon down.
      console.error('[reminders] could not save:', err && err.message);
    }
  }

  function readSaved() {
    try {
      return storage.load();
    } catch {
      return null;
    }
  }

  /** Drops anything malformed (hand-edited or corrupt file) and keeps the rest. */
  function sanitize(raw) {
    if (!raw || !Array.isArray(raw.reminders)) return [];
    const seen = new Set();
    const out = [];
    for (const r of raw.reminders) {
      if (!r || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
      if (!validTimestamp(r.dueAt)) continue;
      seen.add(r.id);
      out.push({
        id: r.id,
        note: cleanNote(r.note),
        createdAt: validTimestamp(r.createdAt) ? r.createdAt : r.dueAt,
        dueAt: r.dueAt,
        fired: r.fired === true,
      });
    }
    return out.sort(byDueAt);
  }

  /**
   * Restores saved reminders. Anything already due is marked fired and
   * returned in `becameDueWhileAway`, so the caller can show it straight away
   * without a toast.
   */
  function load() {
    items = sanitize(readSaved());
    const becameDueWhileAway = check();
    persist();
    return { becameDueWhileAway, pending: pending(), fired: fired() };
  }

  /**
   * Adds a reminder due `delayMs` from now. Returns the reminder, or null if
   * the delay is not a positive finite number.
   */
  function add(delayMs, note) {
    if (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs <= 0) return null;
    const createdAt = now();
    const dueAt = Math.round(createdAt + delayMs);
    if (!validTimestamp(dueAt)) return null;
    const reminder = { id: makeId(), note: cleanNote(note), createdAt, dueAt, fired: false };
    items.push(reminder);
    items.sort(byDueAt);
    persist();
    return reminder;
  }

  /** Removes a reminder (pending or fired). Returns true if it existed. */
  function cancel(id) {
    const before = items.length;
    items = items.filter((r) => r.id !== id);
    if (items.length === before) return false;
    persist();
    return true;
  }

  /** Marks everything now due as fired. Returns only the newly fired ones. */
  function check() {
    const t = now();
    const newly = items.filter((r) => !r.fired && r.dueAt <= t);
    if (newly.length === 0) return [];
    for (const r of newly) r.fired = true;
    persist();
    return newly.map((r) => ({ ...r }));
  }

  /** A click: removes every fired reminder. Returns how many were cleared. */
  function dismissFired() {
    const before = items.length;
    items = items.filter((r) => !r.fired);
    const cleared = before - items.length;
    if (cleared > 0) persist();
    return cleared;
  }

  function msUntilNext() {
    const next = items.find((r) => !r.fired); // sorted by dueAt
    return next ? Math.max(0, next.dueAt - now()) : Infinity;
  }

  const pending = () => items.filter((r) => !r.fired).map((r) => ({ ...r }));
  const fired = () => items.filter((r) => r.fired).map((r) => ({ ...r }));

  return { load, add, cancel, check, dismissFired, msUntilNext, pending, fired, all: () => items.map((r) => ({ ...r })) };
}

module.exports = { createReminders, MAX_NOTE_LENGTH, REMINDERS_VERSION };
