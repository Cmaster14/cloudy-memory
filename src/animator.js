'use strict';

/**
 * Steps the tray icon through frame indices on a fixed beat.
 * `render(i)` draws frame i. Timers are injectable so tests can drive time.
 */
function createAnimator({ frameCount, frameMs, render, initial = 0, timers = globalThis }) {
  const lastFrame = frameCount - 1;
  let current = initial;
  let handle = null;

  function stop() {
    if (handle !== null) {
      timers.clearInterval(handle);
      handle = null;
    }
  }

  function play(sequence) {
    stop();
    const queue = sequence.slice();
    if (queue.length === 0) return;
    handle = timers.setInterval(() => {
      current = queue.shift();
      render(current);
      if (queue.length === 0) stop();
    }, frameMs);
  }

  /** Walks one frame per beat from wherever we are now to `target`. */
  function to(target) {
    const goal = Math.min(Math.max(target, 0), lastFrame);
    const step = goal >= current ? 1 : -1;
    const sequence = [];
    for (let i = current; i !== goal; i += step) sequence.push(i + step);
    play(sequence);
  }

  /** A small flicker for a click on an orb that is already clear and idle. */
  function nudge() {
    if (current !== 0 || handle !== null) return;
    const peak = Math.min(2, lastFrame);
    const sequence = [];
    for (let i = 1; i <= peak; i++) sequence.push(i);
    for (let i = peak - 1; i >= 0; i--) sequence.push(i);
    play(sequence);
  }

  return { to, nudge, stop, getCurrent: () => current };
}

module.exports = { createAnimator };
