'use strict';

// Windows truncates tray tooltips at 127 characters.
const TOOLTIP_MAX = 127;
const NOTE_MIN_BUDGET = 20;

const ellipsize = (text, max) => (text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`);

/**
 * Decides what the tray shows, from the two sources of cloudiness. Pure, so
 * every combination can be unit-tested.
 *
 *   set 'purple' - only the random orb is cloudy
 *   set 'green'  - only custom reminders are showing
 *   set 'mixed'  - both
 *   set null     - nothing is cloudy
 *
 * `reminderNotes` are the notes of the reminders that have come due, oldest first.
 */
function computeDisplay({ orbPhase, firedReminders = [], text }) {
  const orbCloudy = orbPhase === 'cloudy';
  const hasReminders = firedReminders.length > 0;

  if (!orbCloudy && !hasReminders) return { set: null, tooltip: text.clearTooltip };
  if (orbCloudy && !hasReminders) return { set: 'purple', tooltip: text.cloudyTooltip };

  const fallback = text.reminderFallback || 'Reminder';
  const notes = firedReminders.map((r) => r.note || fallback);
  const more = notes.length > 1 ? ` (+${notes.length - 1} more)` : '';
  // Keep the orb's own phrase intact; the note gets whatever room is left.
  const reserved = orbCloudy ? text.cloudyTooltip.length + 1 : 0;
  const budget = Math.max(NOTE_MIN_BUDGET, TOOLTIP_MAX - reserved - more.length);
  const noteLine = `${ellipsize(notes[0], budget)}${more}`;

  return {
    set: orbCloudy ? 'mixed' : 'green',
    tooltip: orbCloudy ? `${noteLine}\n${text.cloudyTooltip}` : ellipsize(noteLine, TOOLTIP_MAX),
  };
}

/** Toast body for custom reminders that have just come due. */
function reminderToastBody(newlyFired, notification) {
  if (newlyFired.length === 1) return newlyFired[0].note || notification.customFallbackBody;
  return `${newlyFired.length} custom reminders are due.`;
}

module.exports = { computeDisplay, reminderToastBody, TOOLTIP_MAX };
