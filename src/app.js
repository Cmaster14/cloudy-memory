'use strict';

const { createOrb } = require('./state');
const { createAnimator } = require('./animator');

// The wake-up timer never sleeps longer than this, so a PC that was suspended
// mid-wait notices within a minute even if no resume event is delivered.
const TICK_MAX_MS = 60 * 1000;

/**
 * Wires the orb logic to the tray. Everything Electron-specific arrives through
 * `electron`, and time/storage/randomness are injectable, so the whole flow
 * (cloud over, click, restart, sleep) can be tested without a display.
 */
function createTrayApp({
  electron,
  config,
  storage,
  frames,
  now = Date.now,
  random = Math.random,
  timers = globalThis,
  debug = false,
}) {
  const { app, Tray, Menu, Notification, powerMonitor } = electron;

  const orb = createOrb({
    storage,
    now,
    random,
    minMs: config.timer.minMs,
    maxMs: config.timer.maxMs,
  });

  const lastFrame = frames.length - 1;
  let tray = null;
  let animator = null;
  let wakeTimer = null;

  const tooltip = () =>
    orb.getPhase() === 'cloudy' ? config.text.cloudyTooltip : config.text.clearTooltip;

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
    const ms = orb.msUntilCloudy();
    if (!Number.isFinite(ms)) return; // already cloudy: nothing to wait for
    wakeTimer = timers.setTimeout(tick, Math.min(ms, TICK_MAX_MS));
  }

  function showCloudy() {
    animator.to(lastFrame);
    tray.setToolTip(tooltip());
    notify();
  }

  function tick() {
    if (orb.check()) showCloudy();
    schedule();
  }

  function onClick() {
    if (orb.clear()) {
      animator.to(0);
      tray.setToolTip(tooltip());
      schedule();
    } else {
      animator.nudge();
    }
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
        label: 'Custom Reminders',
        enabled: true,
        click: () => {
          // Open a small window allowing you to view and create custom reminders for a certain amount of time with a note
          // When the time has elapsed, fill the smoke orb (maybe with a different color to denote specific timer, possibly mixing colors if normal smoke should show)
          // On hover over the orb, display the note (and the normal display message if that is supposed to show as well)
        }
      },
      { type: 'separator' },
    ];

    if (debug) {
      template.push(
        {
          label: 'Debug: cloud over now',
          click: () => {
            if (orb.forceCloudy()) {
              showCloudy();
              schedule();
            }
          },
        },
        {
          label: 'Debug: cloud over in 10 s',
          click: () => {
            const wasCloudy = orb.getPhase() === 'cloudy';
            orb.setNextIn(10 * 1000);
            if (wasCloudy) animator.to(0);
            tray.setToolTip(tooltip());
            schedule();
          },
        },
        { type: 'separator' },
      );
    }

    template.push({ label: 'Quit', role: 'quit' });
    return Menu.buildFromTemplate(template);
  }

  function start() {
    const status = orb.load();
    // Cloudy at launch (deadline passed while we were closed): show it
    // straight away, without the animation or a toast.
    const initial = status.phase === 'cloudy' ? lastFrame : 0;

    tray = new Tray(frames[initial]);
    animator = createAnimator({
      frameCount: frames.length,
      frameMs: config.animation.frameMs,
      initial,
      timers,
      render: (i) => tray.setImage(frames[i]),
    });

    tray.setToolTip(tooltip());
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

  return { start, stop, orb };
}

module.exports = { createTrayApp };
