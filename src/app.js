'use strict';

const { createOrb } = require('./state');
const { createReminders } = require('./reminders');
const { createAnimator } = require('./animator');
const { computeDisplay, reminderToastBody } = require('./display');

// The wake-up timer never sleeps longer than this, so a PC that was suspended
// mid-wait notices within a minute even if no resume event is delivered.
const TICK_MAX_MS = 60 * 1000;

/**
 * Wires the orb and the custom reminders to the tray. Everything
 * Electron-specific arrives through `electron`, and time/storage/randomness
 * are injectable, so the whole flow (cloud over, click, restart, sleep) can be
 * tested without a display.
 *
 * `frames` is either one array of frames (used for every colour) or
 * `{ purple, green, mixed }`. `remindersStorage` is optional; without it
 * custom reminders live in memory only.
 */
function createTrayApp({
  electron,
  config,
  storage,
  remindersStorage = null,
  frames,
  openRemindersWindow = () => {},
  onRemindersChanged = () => {},
  now = Date.now,
  random = Math.random,
  timers = globalThis,
  debug = false,
}) {
  const { app, Tray, Menu, Notification, powerMonitor } = electron;

  const frameSets = Array.isArray(frames) ? { purple: frames, green: frames, mixed: frames } : frames;
  const frameCount = frameSets.purple.length;
  const lastFrame = frameCount - 1;

  const orb = createOrb({
    storage,
    now,
    random,
    minMs: config.timer.minMs,
    maxMs: config.timer.maxMs,
  });

  const reminders = createReminders({
    storage: remindersStorage || { load: () => null, save: () => {} },
    now,
  });

  let tray = null;
  let animator = null;
  let wakeTimer = null;
  // Which colour's frames the animator is currently drawing.
  let renderSet = 'purple';

  const display = () =>
    computeDisplay({
      orbPhase: orb.getPhase(),
      firedReminders: reminders.fired(),
      text: config.text,
    });

  function notify(customNote) {
    if (!config.notification.enabled || !Notification.isSupported()) return;
    let custom = customNote !== undefined;
    let notificationTitle = custom ? config.notification.customTitle : config.notification.title;
    let notificationBody = custom ? customNote : config.notification.body;
    new Notification({
      title: notificationTitle,
      body: notificationBody,
      silent: true,
    }).show();
  }

  function schedule() {
    timers.clearTimeout(wakeTimer);
    wakeTimer = null;
    const ms = Math.min(orb.msUntilCloudy(), reminders.msUntilNext());
    if (!Number.isFinite(ms)) return; // nothing left to wait for
    wakeTimer = timers.setTimeout(tick, Math.min(ms, TICK_MAX_MS));
  }

  /**
   * Brings the tray in line with the orb and reminder state: tooltip first,
   * then the animation.
   *
   *  - Nothing to show: the smoke drains away.
   *  - The colour on screen already matches: the smoke fills.
   *  - A different colour is on screen (purple while a reminder arrives, say):
   *    that cloud is cleared first, then the new one fills in. At frame 0 the
   *    orb is empty, so switching colour there is invisible.
   *
   * Every call re-decides from the current frame, so a change that lands
   * mid-animation simply redirects it.
   */
  function applyDisplay() {
    const want = display();
    tray.setToolTip(want.tooltip);

    if (want.set === null) {
      animator.to(0);
    } else if (renderSet === want.set || animator.getCurrent() === 0) {
      renderSet = want.set;
      animator.to(lastFrame);
    } else {
      animator.to(0, () => {
        renderSet = want.set;
        animator.to(lastFrame);
      });
    }
  }

  function tick() {
    const orbBecameCloudy = orb.check();
    const newlyDue = reminders.check();
    if (orbBecameCloudy || newlyDue.length > 0) {
      applyDisplay();
      if (orbBecameCloudy) notify();
      if (newlyDue.length > 0) {
        notify(reminderToastBody(newlyDue, config.notification));
        onRemindersChanged();
      }
    }
    schedule();
  }

  /** A click clears everything that is showing: the orb and all due reminders. */
  function onClick() {
    const orbCleared = orb.clear();
    const dismissed = reminders.dismissFired();
    if (orbCleared || dismissed > 0) {
      applyDisplay();
      schedule();
      if (dismissed > 0) onRemindersChanged();
    } else {
      animator.nudge();
    }
  }

  // ----- API used by the Custom Reminders window (through IPC in main.js) -----

  function addReminder(delayMs, note) {
    const added = reminders.add(delayMs, note);
    if (!added) return null;
    schedule();
    onRemindersChanged();
    return added;
  }

  function cancelReminder(id) {
    const removed = reminders.cancel(id);
    if (removed) {
      applyDisplay(); // cancelling a due reminder may drain or recolour the smoke
      schedule();
      onRemindersChanged();
    }
    return removed;
  }

  function listReminders() {
    return { now: now(), pending: reminders.pending(), fired: reminders.fired() };
  }

  function buildMenu() {
    const template = [
      {
        label: 'Launch at login',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        // Unpackaged runs would register electron.exe itself, which is wrong.
        enabled: app.isPackaged,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      {
        // View, add and cancel custom reminders. When one comes due the orb
        // fills with green smoke (mixed with purple if the normal smoke is
        // showing too), and hovering shows the note.
        label: 'Custom Reminders',
        enabled: true,
        click: () => openRemindersWindow(),
      },
      { type: 'separator' },
    ];

    if (debug) {
      template.push(
        {
          label: 'Debug: cloud over now',
          click: () => {
            if (orb.forceCloudy()) {
              applyDisplay();
              notify();
              schedule();
            }
          },
        },
        {
          label: 'Debug: cloud over in 10 s',
          click: () => {
            orb.setNextIn(10 * 1000);
            applyDisplay();
            schedule();
          },
        },
        {
          label: 'Debug: custom reminder in 10 s',
          click: () => {
            addReminder(10 * 1000, 'Debug reminder');
          },
        },
        { type: 'separator' },
      );
    }

    template.push({ label: 'Quit', role: 'quit' });
    return Menu.buildFromTemplate(template);
  }

  function start() {
    orb.load();
    reminders.load();
    // Anything already showing at launch (a deadline passed while we were
    // closed): show it straight away, without the animation or a toast.
    const initial = display();
    const startFrame = initial.set ? lastFrame : 0;
    if (initial.set) renderSet = initial.set;

    tray = new Tray(frameSets[renderSet][startFrame]);
    animator = createAnimator({
      frameCount,
      frameMs: config.animation.frameMs,
      initial: startFrame,
      timers,
      render: (i) => tray.setImage(frameSets[renderSet][i]),
    });

    tray.setToolTip(initial.tooltip);
    tray.setContextMenu(buildMenu());
    tray.on('click', onClick);

    // Timers can drift or stall while Windows sleeps; look again on wake.
    powerMonitor.on('resume', tick);
    powerMonitor.on('unlock-screen', tick);

    schedule();
  }

  function stop() {
    timers.clearTimeout(wakeTimer);
    if (animator) animator.stop();
    if (tray) tray.destroy();
  }

  return { start, stop, orb, reminders, addReminder, cancelReminder, listReminders };
}

module.exports = { createTrayApp };
