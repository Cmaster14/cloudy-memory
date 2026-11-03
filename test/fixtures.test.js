'use strict';

// Runs the language-neutral golden fixtures in shared/fixtures against the JS
// implementation. The Swift package (macos/) runs the very same files, so the
// two ports cannot drift apart without a test failing. See
// shared/fixtures/README.md for the format.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { createOrb } = require('../src/state');
const { createReminders } = require('../src/reminders');
const { createAnimator } = require('../src/animator');
const { computeDisplay, reminderToastBody } = require('../src/display');
const { parseDelay } = require('../src/ipc');
const { createTrayApp } = require('../src/app');
const config = require('../src/config');

const load = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'fixtures', `${name}.json`), 'utf8'));
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/** Note specs may be a string, a number (wrong type), {repeat,count} or {concat:[...]}. */
function noteValue(spec) {
  if (spec && typeof spec === 'object') {
    if ('repeat' in spec) return spec.repeat.repeat(spec.count);
    if ('concat' in spec) return spec.concat.map(noteValue).join('');
  }
  return spec;
}

function numberToken(v) {
  if (v === 'NaN') return NaN;
  if (v === 'Infinity') return Infinity;
  if (v === '-Infinity') return -Infinity;
  return v;
}

function memoryStorage(initial) {
  let data = clone(initial === undefined ? null : initial);
  return {
    load: () => clone(data),
    save: (d) => {
      data = clone(d);
    },
    peek: () => clone(data),
  };
}

const orNull = (n) => (Number.isFinite(n) ? n : null);

// ------------------------------------------------------------------ orb

const orbFixture = load('orb');
for (const sc of orbFixture.scenarios) {
  test(`orb: ${sc.name}`, () => {
    const clock = { t: orbFixture.startMs };
    let random = sc.random === undefined ? 0.5 : sc.random;
    let storage = memoryStorage(sc.stored);
    const cfg = { minMs: 1800000, maxMs: 172800000, ...(sc.config || {}) };
    const make = () => createOrb({ storage, now: () => clock.t, random: () => random, ...cfg });
    let orb = make();
    let last = null;

    const verify = (expect, result) => {
      if (!expect) return;
      const snap = orb.snapshot();
      if ('result' in expect) assert.equal(result, expect.result, 'result');
      if ('phase' in expect) assert.equal(snap.phase, expect.phase, 'phase');
      if ('becameCloudyWhileAway' in expect) assert.equal(last.becameCloudyWhileAway, expect.becameCloudyWhileAway);
      if ('waitMs' in expect) assert.equal(snap.cloudyAt - clock.t, expect.waitMs, 'waitMs');
      if ('waitMsAtMost' in expect) assert.ok(snap.cloudyAt - clock.t <= expect.waitMsAtMost, 'waitMsAtMost');
      if ('msUntilCloudy' in expect) assert.equal(orNull(orb.msUntilCloudy()), expect.msUntilCloudy, 'msUntilCloudy');
      if ('msUntilCloudyAtMost' in expect) assert.ok(orb.msUntilCloudy() <= expect.msUntilCloudyAtMost, 'msUntilCloudyAtMost');
      if ('saved' in expect) assert.deepEqual(storage.peek(), expect.saved, 'saved');
    };

    for (const step of sc.steps) {
      let result;
      switch (step.op) {
        case 'load':
          last = orb.load();
          break;
        case 'check':
          result = orb.check();
          break;
        case 'clear':
          result = orb.clear();
          break;
        case 'forceCloudy':
          result = orb.forceCloudy();
          break;
        case 'setNextIn':
          orb.setNextIn(step.ms);
          break;
        case 'advance':
          clock.t += step.ms;
          break;
        case 'setRandom':
          random = step.value;
          break;
        case 'restart':
          orb = make();
          break;
        case 'reset':
          storage = memoryStorage(null);
          orb = make();
          break;
        case 'expect':
          break;
        default:
          throw new Error(`unknown orb op ${step.op}`);
      }
      verify(step.expect, result);
    }
  });
}

// ------------------------------------------------------------------ reminders

const remindersFixture = load('reminders');
for (const sc of remindersFixture.scenarios) {
  test(`reminders: ${sc.name}`, () => {
    const clock = { t: remindersFixture.startMs };
    let n = 0;
    const storage = memoryStorage(sc.stored);
    const make = () => createReminders({ storage, now: () => clock.t, makeId: () => `id${++n}` });
    let r = make();
    const refs = {};
    let lastLoad = null;
    const notes = (list) => list.map((x) => x.note);

    for (const step of sc.steps) {
      const e = step.expect;
      switch (step.op) {
        case 'add': {
          const added = r.add(numberToken(step.delayMs), noteValue(step.note));
          if (step.as && added) refs[step.as] = added.id;
          if (e) {
            if ('isNull' in e) assert.equal(added === null, e.isNull, 'isNull');
            if ('note' in e) assert.equal(added.note, e.note);
            if ('noteLength' in e) assert.equal(added.note.length, e.noteLength);
            if ('dueInMs' in e) assert.equal(added.dueAt - clock.t, e.dueInMs);
            if ('fired' in e) assert.equal(added.fired, e.fired);
          }
          break;
        }
        case 'advance':
          clock.t += step.ms;
          break;
        case 'check': {
          const fired = r.check();
          if (e && 'notes' in e) assert.deepEqual(notes(fired), e.notes);
          break;
        }
        case 'cancel': {
          const result = r.cancel(step.ref ? refs[step.ref] : step.id);
          if (e && 'result' in e) assert.equal(result, e.result);
          break;
        }
        case 'dismissFired': {
          const result = r.dismissFired();
          if (e && 'result' in e) assert.equal(result, e.result);
          break;
        }
        case 'restart':
          r = make();
          break;
        case 'load':
          lastLoad = r.load();
          if (e && 'becameDueNotes' in e) assert.deepEqual(notes(lastLoad.becameDueWhileAway), e.becameDueNotes);
          break;
        case 'expect':
        case 'state':
          break;
        default:
          throw new Error(`unknown reminders op ${step.op}`);
      }
      if (step.op === 'expect' || step.op === 'state') {
        if ('msUntilNext' in e) assert.equal(orNull(r.msUntilNext()), e.msUntilNext, 'msUntilNext');
        if ('pendingNotes' in e) assert.deepEqual(notes(r.pending()), e.pendingNotes, 'pendingNotes');
        if ('firedNotes' in e) assert.deepEqual(notes(r.fired()), e.firedNotes, 'firedNotes');
        if ('allNotes' in e) assert.deepEqual(notes(r.all()), e.allNotes, 'allNotes');
        if ('allIds' in e) assert.deepEqual(r.all().map((x) => x.id), e.allIds, 'allIds');
        if ('all' in e) assert.deepEqual(r.all(), e.all, 'all');
        if ('pendingCount' in e) assert.equal(r.pending().length, e.pendingCount);
        if ('firedCount' in e) assert.equal(r.fired().length, e.firedCount);
        if ('savedVersion' in e) assert.equal(storage.peek().version, e.savedVersion);
      }
    }
  });
}

// ------------------------------------------------------------------ display

const displayFixture = load('display');
for (const c of displayFixture.cases) {
  test(`display: ${c.name}`, () => {
    const firedReminders = c.notes.map((n) => ({ note: noteValue(n) }));
    const d = computeDisplay({ orbPhase: c.orbPhase, firedReminders, text: displayFixture.text });
    const e = c.expect;
    assert.equal(d.set, e.set, 'set');
    if ('tooltip' in e) assert.equal(d.tooltip, e.tooltip, 'tooltip');
    if ('tooltipLength' in e) assert.equal(d.tooltip.length, e.tooltipLength, 'tooltipLength');
    if ('tooltipStartsWith' in e) assert.ok(d.tooltip.startsWith(e.tooltipStartsWith), 'startsWith');
    if ('tooltipEndsWith' in e) assert.ok(d.tooltip.endsWith(e.tooltipEndsWith), 'endsWith');
    for (const s of e.tooltipContains || []) assert.ok(d.tooltip.includes(s), `contains ${JSON.stringify(s)}`);
    for (const s of e.tooltipNotContains || []) assert.ok(!d.tooltip.includes(s), `not contains ${JSON.stringify(s)}`);
  });
}
for (const c of displayFixture.toastCases) {
  test(`display toast: ${c.name}`, () => {
    const body = reminderToastBody(c.notes.map((n) => ({ note: noteValue(n) })), displayFixture.toastNotification);
    assert.equal(body, c.expect);
  });
}

// ------------------------------------------------------------------ delay parsing

for (const c of load('delay').cases) {
  test(`delay: ${c.name}`, () => {
    const result = parseDelay({ amount: c.amount, unit: c.unit });
    if ('delayMs' in c.expect) assert.equal(result.delayMs, c.expect.delayMs);
    else assert.equal(result.error, c.expect.error);
  });
}

// ------------------------------------------------------------------ animator

const animatorFixture = load('animator');
for (const sc of animatorFixture.scenarios) {
  test(`animator: ${sc.name}`, () => {
    let handle = null;
    let job = null;
    const timers = {
      setInterval: (fn) => {
        job = fn;
        handle = 1;
        return handle;
      },
      clearInterval: () => {
        job = null;
        handle = null;
      },
    };
    const shown = [];
    let done = 0;
    const animator = createAnimator({
      frameCount: animatorFixture.frameCount,
      frameMs: 220,
      initial: sc.initial,
      timers,
      render: (i) => shown.push(i),
    });
    for (const step of sc.steps) {
      switch (step.op) {
        case 'to':
          animator.to(step.target, step.withDone ? () => (done += 1) : undefined);
          break;
        case 'nudge':
          animator.nudge();
          break;
        case 'stop':
          animator.stop();
          break;
        case 'tick':
          for (let i = 0; i < step.count; i++) if (job) job();
          break;
        case 'expectShown':
          assert.deepEqual(shown.splice(0), step.frames, 'shown');
          break;
        case 'expectDone':
          assert.equal(done, step.count, 'done count');
          done = 0;
          break;
        case 'expectCurrent':
          assert.equal(animator.getCurrent(), step.frame, 'current');
          break;
        default:
          throw new Error(`unknown animator op ${step.op}`);
      }
    }
  });
}

// ------------------------------------------------------------------ controller (tray flow)

const controllerFixture = load('controller');

function expandFrames(list) {
  const out = [];
  for (const item of list) {
    const m = /^(\w+):(\d+)(?:-(\d+))?$/.exec(item);
    if (!m) throw new Error(`bad frame spec ${item}`);
    const from = Number(m[2]);
    const to = m[3] === undefined ? from : Number(m[3]);
    const step = from <= to ? 1 : -1;
    for (let i = from; i !== to + step; i += step) out.push(`${m[1]}:${i}`);
  }
  return out;
}

function makeController(sc) {
  const LEVELS = 9;
  let t = controllerFixture.startMs;
  let nextId = 0;
  const jobs = new Map();
  const add = (fn, ms, repeat) => {
    const id = ++nextId;
    jobs.set(id, { fn, at: t + ms, ms, repeat });
    return id;
  };
  const clock = {
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
        for (const [id, job] of jobs) if (job.at <= end && (!next || job.at < next.job.at)) next = { id, job };
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

  const makeFrames = (set) => Array.from({ length: LEVELS }, (_, i) => ({ id: `${set}:${i}` }));
  const frames = { purple: makeFrames('purple'), green: makeFrames('green'), mixed: makeFrames('mixed') };
  const log = { shown: [], tooltips: [], toasts: [], changed: 0 };
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
      log.toasts.push({ title: this.options.title, body: this.options.body });
    }
  }

  const trayApp = createTrayApp({
    electron: {
      app: { isPackaged: false, getLoginItemSettings: () => ({ openAtLogin: false }), setLoginItemSettings() {} },
      Tray: FakeTray,
      Menu: { buildFromTemplate: (template) => template },
      Notification: FakeNotification,
      powerMonitor,
    },
    config,
    storage: memoryStorage(sc.stored),
    remindersStorage: memoryStorage(sc.remindersStored),
    frames,
    openRemindersWindow: () => {},
    onRemindersChanged: () => (log.changed += 1),
    now: clock.now,
    random: () => (sc.random === undefined ? 0 : sc.random),
    timers: clock.timers,
    debug: true,
  });
  trayApp.start();
  return { clock, log, powerMonitor, trayApp, click: () => tray.emit('click'), menu: () => tray.menu, LEVELS };
}

for (const sc of controllerFixture.scenarios) {
  test(`controller: ${sc.name}`, () => {
    const h = makeController(sc);
    const refs = {};
    let changedMark = 0;
    const debugLabels = { cloudNow: 'Debug: cloud over now', cloudIn10s: 'Debug: cloud over in 10 s', reminderIn10s: 'Debug: custom reminder in 10 s' };

    for (const step of sc.steps) {
      switch (step.op) {
        case 'advance':
          h.clock.advance(step.ms);
          break;
        case 'jump':
          h.clock.jump(step.ms);
          break;
        case 'resume':
          h.powerMonitor.emit('resume');
          break;
        case 'click':
          h.click();
          break;
        case 'animate':
          h.clock.advance(config.animation.frameMs * (h.LEVELS - 1));
          break;
        case 'resetShown':
          h.log.shown.length = 0;
          break;
        case 'markChanged':
          changedMark = h.log.changed;
          break;
        case 'add': {
          const added = h.trayApp.addReminder(numberToken(step.delayMs), noteValue(step.note));
          if (step.as && added) refs[step.as] = added.id;
          if (step.expect && 'isNull' in step.expect) assert.equal(added === null, step.expect.isNull);
          break;
        }
        case 'cancel': {
          const result = h.trayApp.cancelReminder(step.ref ? refs[step.ref] : step.id);
          assert.equal(result, step.expect.result);
          break;
        }
        case 'debug':
          h.menu().find((i) => i.label === debugLabels[step.name]).click();
          break;
        case 'expect': {
          const e = step.expect;
          if ('shown' in e) assert.deepEqual(h.log.shown, expandFrames(e.shown), 'shown');
          if ('lastShown' in e) assert.equal(h.log.shown.at(-1), e.lastShown, 'lastShown');
          if ('tooltip' in e) assert.equal(h.log.tooltips.at(-1), e.tooltip, 'tooltip');
          if ('toastCount' in e) assert.equal(h.log.toasts.length, e.toastCount, 'toastCount');
          if ('toasts' in e) assert.deepEqual(h.log.toasts, e.toasts, 'toasts');
          if ('orbPhase' in e) assert.equal(h.trayApp.orb.getPhase(), e.orbPhase, 'orbPhase');
          if ('firedCount' in e) assert.equal(h.trayApp.listReminders().fired.length, e.firedCount, 'firedCount');
          if ('pendingNotes' in e) assert.deepEqual(h.trayApp.listReminders().pending.map((r) => r.note), e.pendingNotes, 'pendingNotes');
          if ('changedSinceMark' in e) assert.equal(h.log.changed - changedMark, e.changedSinceMark, 'changedSinceMark');
          break;
        }
        default:
          throw new Error(`unknown controller op ${step.op}`);
      }
    }
  });
}
