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

function makeHarness({ stored = null, rand = 0 } = {}) {
  const clock = makeClock();
  const frames = Array.from({ length: LEVELS }, (_, id) => ({ id }));
  const log = { shown: [], tooltips: [], toasts: 0 };
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
    show() {
      log.toasts += 1;
    }
  }

  let data = stored;
  const storage = {
    load: () => data,
    save: (d) => {
      data = JSON.parse(JSON.stringify(d));
    },
  };

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
    frames,
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
