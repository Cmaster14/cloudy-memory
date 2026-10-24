'use strict';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

module.exports = {
  // Needed for Windows toast notifications. Change it if you rename the app.
  appUserModelId: 'com.example.cloudymemory',

  timer: {
    // The wait before the orb clouds over is picked uniformly between these.
    // maxMs is clamped to 48 hours in src/state.js whatever is written here.
    minMs: 30 * MINUTE,
    maxMs: 48 * HOUR,
  },

  animation: {
    // Time per frame. There are 9 frames, so 8 steps * 220 ms is about 1.8 s.
    frameMs: 220,
  },

  text: {
    clearTooltip: 'Cloudy Memory',
    cloudyTooltip: 'You have forgotten something...',
    // Shown for a custom reminder that was created without a note.
    reminderFallback: 'Reminder',
  },

  notification: {
    enabled: true,
    title: 'Cloudy Memory',
    customTitle: 'Cloudy Memory - Custom Reminder',
    customFallbackBody: 'A custom reminder is due.',
    body: 'You have seemingly forgotten something. Click the orb in the tray to clear it.',
  },
};
