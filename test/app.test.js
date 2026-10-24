'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createTrayApp } = require('../src/app');
const config = require('../src/config');

const MIN = 60 * 1000;
const FRAME_MS = config.animation.frameMs;
const LEVELS = 9;

// A hand-cranked clock: advance() runs due timers in order, jump() moves time
// without running anything (what a suspended PC does to timers).
function makeClock(start = 1_000_000_000) {
  let t = start;
  let nextId = 0;
  const jobs = new Map();
  const add = (fn, ms, repeat) => {
    const id = ++nextId;
    jobs.set(id, { fn, at: t + ms, ms, repeat });
    return id;
  };
  return {
    now: () => t,
    timers: {
      setTimeout: (fn, ms) => add(fn, ms, false),
      clearTimeout: (id) => jobs.delete(id),
      setInterval: (fn, ms) => add(fn, ms, true),
      clearInterval: (id) => jobs.delete(id),
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, job] of jobs) {
          if (job.at <= end && (!next || job.at < next.job.at)) next = { id, job };
        }
        if (!next) break;
        t = Math.max(t, next.job.at);
        if (next.job.repeat) next.job.at += next.job.ms;
        else jobs.delete(next.id);
        next.job.fn();
      }
      t = end;
    },
    jump(ms) {
      t += ms;
    },
  };
}

// With `colors: true` every colour gets its own frame ids, so tests can tell
// which cloud is on screen: purple 0-8, green 100-108, mixed 200-208.
function makeHarness({ stored = null, rand = 0, colors = false, remindersStored = null } = {}) {
  const clock = makeClock();
  const makeFrames = (base) => Array.from({ length: LEVELS }, (_, i) => ({ id: base + i }));
  const frames = colors
    ? { purple: makeFrames(0), green: makeFrames(100), mixed: makeFrames(200) }
    : makeFrames(0);
  const log = { shown: [], tooltips: [], toasts: 0, toastList: [], changed: 0 };
  const powerMonitor = new EventEmitter();
  let tray = null;

  class FakeTray extends EventEmitter {
    constructor(image) {
      super();
      tray = this;
      log.shown.push(image.id);
    }
    setImage(image) {
      log.shown.push(image.id);
    }
    setToolTip(text) {
      log.tooltips.push(text);
    }
    setContextMenu(menu) {
      this.menu = menu;
    }
    destroy() {}
  }
  class FakeNotification {
    static isSupported() {
      return true;
    }
    constructor(options) {
      this.options = options;
    }
    show() {
      log.toasts += 1;
      log.toastList.push(this.options);
    }
  }

  let data = stored;
  const storage = {
    load: () => data,
    save: (d) => {
      data = JSON.parse(JSON.stringify(d));
    },
  };

  let remindersData = remindersStored;
  const remindersStorage = {
    load: () => remindersData,
    save: (d) => {
      remindersData = JSON.parse(JSON.stringify(d));
    },
  };
  let windowOpens = 0;

  const trayApp = createTrayApp({
    electron: {
      app: {
        isPackaged: false,
        getLoginItemSettings: () => ({ openAtLogin: false }),
        setLoginItemSettings() {},
      },
      Tray: FakeTray,
      Menu: { buildFromTemplate: (template) => template },
      Notification: FakeNotification,
      powerMonitor,
    },
    config,
    storage,
    remindersStorage,
    frames,
    openRemindersWindow: () => (windowOpens += 1),
    onRemindersChanged: () => (log.changed += 1),
    now: clock.now,
    random: () => rand,
    timers: clock.timers,
    debug: true,
  });
  trayApp.start();

  return {
    clock,
    log,
    powerMonitor,
    trayApp,
    storage,
    windowOpens: () => windowOpens,
    click: () => tray.emit('click'),
    menu: () => tray.menu,
    lastTooltip: () => log.tooltips[log.tooltips.length - 1],
    animate: () => clock.advance(FRAME_MS * (LEVELS - 1)),
  };
}

test('starts on the clear frame', () => {
  const h = makeHarness();
  assert.deepEqual(h.log.shown, [0]);
  assert.equal(h.lastTooltip(), config.text.clearTooltip);
});

test('clouds over on schedule: animates every frame in order, one toast, cloudy tooltip', () => {
  const h = makeHarness({ rand: 0 }); // shortest wait: 30 min
  h.clock.advance(30 * MIN - 1);
  assert.deepEqual(h.log.shown, [0], 'nothing before the deadline');
  h.clock.advance(1);
  h.animate();
  assert.deepEqual(h.log.shown, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(h.log.toasts, 1);
  assert.equal(h.lastTooltip(), config.text.cloudyTooltip);
});

test('a click clears the smoke and a fresh wait begins before it clouds again', () => {
  const h = makeHarness({ rand: 0 });
  h.clock.advance(30 * MIN);
  h.animate();
  h.log.shown.length = 0;

  h.click();
  h.animate();
  assert.deepEqual(h.log.shown, [7, 6, 5, 4, 3, 2, 1, 0]);
  assert.equal(h.lastTooltip(), config.text.clearTooltip);

  h.log.shown.length = 0;
  h.clock.advance(30 * MIN - FRAME_MS * (LEVELS - 1) - 1);
  assert.deepEqual(h.log.shown, [], 'still clear before the new deadline');
  h.clock.advance(FRAME_MS * (LEVELS - 1) + 1);
  h.animate();
  assert.deepEqual(h.log.shown, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(h.log.toasts, 2);
});

test('a click while clear just nudges the orb and changes no state', () => {
  const h = makeHarness({ rand: 0 });
  const before = JSON.stringify(h.storage.load());
  h.click();
  h.clock.advance(FRAME_MS * 4);
  assert.deepEqual(h.log.shown, [0, 1, 2, 1, 0]);
  assert.equal(JSON.stringify(h.storage.load()), before);
});

test('a click mid-animation reverses from the current frame', () => {
  const h = makeHarness({ rand: 0 });
  h.clock.advance(30 * MIN);
  h.clock.advance(FRAME_MS * 3);
  assert.deepEqual(h.log.shown, [0, 1, 2, 3]);
  h.click();
  h.clock.advance(FRAME_MS * 3);
  assert.deepEqual(h.log.shown, [0, 1, 2, 3, 2, 1, 0]);
});

test('waking from sleep past the deadline clouds over without waiting for a timer', () => {
  const h = makeHarness({ rand: 0 });
  h.clock.jump(2 * 60 * MIN); // timers did not run while "asleep"
  assert.deepEqual(h.log.shown, [0]);
  h.powerMonitor.emit('resume');
  h.animate();
  assert.deepEqual(h.log.shown, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(h.log.toasts, 1);
});

test('launching with a saved cloudy state shows it at once, silently', () => {
  const h = makeHarness({ stored: { version: 1, phase: 'cloudy', cloudyAt: null } });
  assert.deepEqual(h.log.shown, [8]);
  assert.equal(h.lastTooltip(), config.text.cloudyTooltip);
  h.clock.advance(60 * MIN);
  assert.deepEqual(h.log.shown, [8]);
  assert.equal(h.log.toasts, 0);
});

test('a deadline that passed while the app was closed launches already cloudy, no toast', () => {
  const past = 1_000_000_000 - MIN;
  const h = makeHarness({ stored: { version: 1, phase: 'clear', cloudyAt: past } });
  assert.deepEqual(h.log.shown, [8]);
  assert.equal(h.log.toasts, 0);
});

test('debug menu items cloud the orb on demand and clear any wait', () => {
  const h = makeHarness({ rand: 0.999999999 }); // long wait
  const labels = h.menu().map((item) => item.label);
  assert.ok(labels.includes('Debug: cloud over now'));
  h.menu().find((i) => i.label === 'Debug: cloud over now').click();
  h.animate();
  assert.deepEqual(h.log.shown, [0, 1, 2, 3, 4, 5, 6, 7, 8]);

  h.log.shown.length = 0;
  h.menu().find((i) => i.label === 'Debug: cloud over in 10 s').click();
  h.animate();
  assert.deepEqual(h.log.shown, [7, 6, 5, 4, 3, 2, 1, 0]);
  h.log.shown.length = 0;
  h.clock.advance(10 * 1000);
  h.animate();
  assert.deepEqual(h.log.shown, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('login item is disabled for unpackaged runs; quit is always present', () => {
  const h = makeHarness();
  const login = h.menu().find((i) => i.label === 'Launch at login');
  assert.equal(login.enabled, false);
  assert.ok(h.menu().some((i) => i.role === 'quit'));
});

// ---------------------------------------------------------------- custom reminders

const PURPLE = (i) => i;
const GREEN = (i) => 100 + i;
const MIXED = (i) => 200 + i;
const range = (f, from, to) => {
  const out = [];
  const step = from <= to ? 1 : -1;
  for (let i = from; i !== to + step; i += step) out.push(f(i));
  return out;
};

test('the Custom Reminders menu item is always enabled and opens the window', () => {
  const h = makeHarness();
  const item = h.menu().find((i) => i.label === 'Custom Reminders');
  assert.equal(item.enabled, true);
  item.click();
  assert.equal(h.windowOpens(), 1);
  assert.ok(!h.menu().some((i) => /reminder/i.test(i.label) && i.label !== 'Custom Reminders' && !i.label.startsWith('Debug')),
    'no reminder list lives in the tray menu');
});

test('a due custom reminder fills the orb with green smoke, shows its note and sends a toast', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  h.trayApp.addReminder(30 * MIN, 'water the plants');
  h.clock.advance(30 * MIN - 1);
  assert.deepEqual(h.log.shown, [PURPLE(0)]);
  h.clock.advance(1);
  h.animate();
  assert.deepEqual(h.log.shown, [PURPLE(0), ...range(GREEN, 1, 8)]);
  assert.equal(h.lastTooltip(), 'water the plants');
  assert.equal(h.log.toasts, 1);
  assert.equal(h.log.toastList[0].title, config.notification.customTitle);
  assert.equal(h.log.toastList[0].body, 'water the plants');
});

test('a click clears the green smoke and leaves still-pending reminders alone', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  h.trayApp.addReminder(10 * MIN, 'soon');
  h.trayApp.addReminder(120 * MIN, 'later');
  h.clock.advance(10 * MIN);
  h.animate();
  h.log.shown.length = 0;
  h.click();
  h.animate();
  assert.deepEqual(h.log.shown, range(GREEN, 7, 0));
  assert.equal(h.lastTooltip(), config.text.clearTooltip);
  assert.deepEqual(h.trayApp.listReminders().pending.map((r) => r.note), ['later']);
  assert.equal(h.trayApp.listReminders().fired.length, 0);
});

test('a reminder arriving while the purple cloud shows: purple drains first, then mixed fills', () => {
  const h = makeHarness({ colors: true, rand: 0 });
  h.trayApp.addReminder(40 * MIN, 'call mom');
  h.clock.advance(30 * MIN); // orb clouds
  h.animate();
  assert.equal(h.log.shown.at(-1), PURPLE(8));
  h.log.shown.length = 0;
  h.clock.advance(10 * MIN); // reminder due
  h.animate();
  h.animate();
  assert.deepEqual(h.log.shown, [...range(PURPLE, 7, 0), ...range(MIXED, 1, 8)]);
  assert.equal(h.lastTooltip(), `call mom\n${config.text.cloudyTooltip}`);
});

test('the orb clouding while a reminder shows: green drains first, then mixed fills', () => {
  const h = makeHarness({ colors: true, rand: 0 });
  h.trayApp.addReminder(10 * MIN, 'stretch');
  h.clock.advance(10 * MIN);
  h.animate();
  assert.equal(h.log.shown.at(-1), GREEN(8));
  h.log.shown.length = 0;
  h.clock.advance(20 * MIN); // orb deadline
  h.animate();
  h.animate();
  assert.deepEqual(h.log.shown, [...range(GREEN, 7, 0), ...range(MIXED, 1, 8)]);
});

test('clicking the mixed cloud clears both and the orb starts a new wait', () => {
  const h = makeHarness({ colors: true, rand: 0 });
  h.trayApp.addReminder(1 * MIN, 'both');
  h.clock.advance(30 * MIN);
  h.animate();
  h.animate();
  assert.equal(h.log.shown.at(-1), MIXED(8));
  h.log.shown.length = 0;
  h.click();
  h.animate();
  assert.deepEqual(h.log.shown, range(MIXED, 7, 0));
  assert.equal(h.trayApp.orb.getPhase(), 'clear');
  assert.equal(h.trayApp.listReminders().fired.length, 0);
});

test('a reminder that lands mid-purple-fill redirects the animation from the current frame', () => {
  const h = makeHarness({ colors: true, rand: 0 });
  h.trayApp.addReminder(30 * MIN + FRAME_MS * 3, 'mid');
  h.clock.advance(30 * MIN);
  h.clock.advance(FRAME_MS * 3);
  assert.deepEqual(h.log.shown, [PURPLE(0), PURPLE(1), PURPLE(2), PURPLE(3)]);
  h.log.shown.length = 0;
  h.clock.advance(60 * 1000);
  assert.deepEqual(h.log.shown, [...range(PURPLE, 2, 0), ...range(MIXED, 1, 8)]);
});

test('cancelling a due reminder drains its smoke; cancelling a pending one touches nothing', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  const pending = h.trayApp.addReminder(500 * MIN, 'pending');
  const due = h.trayApp.addReminder(5 * MIN, 'due');
  h.clock.advance(5 * MIN);
  h.animate();
  h.log.shown.length = 0;
  assert.equal(h.trayApp.cancelReminder(pending.id), true);
  h.animate();
  assert.deepEqual(h.log.shown, [], 'still green');
  assert.equal(h.trayApp.cancelReminder(due.id), true);
  h.animate();
  assert.deepEqual(h.log.shown, range(GREEN, 7, 0));
  assert.equal(h.lastTooltip(), config.text.clearTooltip);
  assert.equal(h.trayApp.cancelReminder('missing'), false);
});

test('several reminders due together share one toast and one summarised tooltip', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  h.trayApp.addReminder(5 * MIN, 'a');
  h.trayApp.addReminder(6 * MIN, 'b');
  h.clock.jump(6 * MIN); // both come due while nothing is running
  h.powerMonitor.emit('resume');
  h.animate();
  assert.equal(h.log.toasts, 1);
  assert.equal(h.log.toastList[0].body, '2 custom reminders are due.');
  assert.equal(h.lastTooltip(), 'a (+1 more)');
});

test('a reminder added while another is pending is picked up by the wake-up timer', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  h.trayApp.addReminder(60 * MIN, 'far');
  h.trayApp.addReminder(2 * MIN, 'near'); // earlier than the one already waiting
  h.clock.advance(2 * MIN);
  h.animate();
  assert.equal(h.log.shown.at(-1), GREEN(8));
  assert.equal(h.lastTooltip(), 'near');
});

test('sleeping past a reminder: it shows on wake with a toast', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  h.trayApp.addReminder(10 * MIN, 'slept through');
  h.clock.jump(60 * MIN);
  h.powerMonitor.emit('resume');
  h.animate();
  assert.equal(h.log.shown.at(-1), GREEN(8));
  assert.equal(h.log.toasts, 1);
});

test('launching with a reminder that came due while closed shows green at once, silently', () => {
  const due = 1_000_000_000 - MIN;
  const h = makeHarness({
    colors: true,
    rand: 0.999999999,
    remindersStored: { version: 1, reminders: [{ id: 'r1', note: 'missed', createdAt: due - MIN, dueAt: due, fired: false }] },
  });
  assert.deepEqual(h.log.shown, [GREEN(8)]);
  assert.equal(h.lastTooltip(), 'missed');
  assert.equal(h.log.toasts, 0);
});

test('launching with the orb cloudy and a reminder due shows mixed at once', () => {
  const due = 1_000_000_000 - MIN;
  const h = makeHarness({
    colors: true,
    stored: { version: 1, phase: 'cloudy', cloudyAt: null },
    remindersStored: { version: 1, reminders: [{ id: 'r1', note: 'x', createdAt: 1, dueAt: due, fired: false }] },
  });
  assert.deepEqual(h.log.shown, [MIXED(8)]);
  assert.equal(h.log.toasts, 0);
});

test('adding and cancelling tell the window to refresh; invalid delays are refused', () => {
  const h = makeHarness({ rand: 0.999999999 });
  const before = h.log.changed;
  assert.equal(h.trayApp.addReminder(0, 'nope'), null);
  assert.equal(h.log.changed, before);
  const r = h.trayApp.addReminder(MIN, 'ok');
  assert.equal(h.log.changed, before + 1);
  h.trayApp.cancelReminder(r.id);
  assert.equal(h.log.changed, before + 2);
});

test('the debug menu can create a reminder due in 10 s', () => {
  const h = makeHarness({ colors: true, rand: 0.999999999 });
  h.menu().find((i) => i.label === 'Debug: custom reminder in 10 s').click();
  h.clock.advance(10 * 1000);
  h.animate();
  assert.equal(h.log.shown.at(-1), GREEN(8));
  assert.equal(h.lastTooltip(), 'Debug reminder');
});
