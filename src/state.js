'use strict';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Absolute ceiling for any wait before the orb clouds over. It is applied when
 * a delay is picked, when saved state is loaded, and on every check, so no
 * config value, hand-edited file or clock change can push the wait past it.
 */
const HARD_CAP_MS = 48 * HOUR_MS;

const STATE_VERSION = 1;

/**
 * The orb's brain: pure logic with no Electron, timers or disk of its own.
 *
 *   phase 'clear'  -> waiting for `cloudyAt` (an absolute epoch-ms timestamp)
 *   phase 'cloudy' -> stays cloudy until clear() is called (a click)
 *
 * Because the deadline is an absolute timestamp that gets saved, it survives
 * app restarts and PC sleep: if the deadline passes while nothing is running,
 * the orb is simply cloudy the next time check() or load() looks.
 */
function createOrb({
  storage,
  now = Date.now,
  random = Math.random,
  minMs = 30 * 60 * 1000,
  maxMs = HARD_CAP_MS,
}) {
  const hi = Math.max(1, Math.min(maxMs, HARD_CAP_MS));
  const lo = Math.max(0, Math.min(minMs, hi));

  let phase = 'clear';
  let cloudyAt = null;

  const pickDelay = () => Math.round(lo + random() * (hi - lo));

  function persist() {
    try {
      storage.save({ version: STATE_VERSION, phase, cloudyAt });
    } catch (err) {
      // Best effort: a failed save must never take the tray icon down.
      console.error('[orb] could not save state:', err && err.message);
    }
  }

  function startFreshTimer() {
    phase = 'clear';
    cloudyAt = now() + pickDelay();
  }

  function readSaved() {
    try {
      return storage.load();
    } catch {
      return null;
    }
  }

  function snapshot() {
    return { phase, cloudyAt };
  }

  /**
   * Turns a clear orb cloudy once its deadline has passed, and pulls in a
   * deadline that is somehow more than 48 h away (clock moved backwards,
   * edited file). Returns true only on the call that makes it cloudy.
   */
  function check() {
    if (phase !== 'clear') return false;
    const t = now();
    if (cloudyAt - t > HARD_CAP_MS) {
      cloudyAt = t + HARD_CAP_MS;
      persist();
    }
    if (cloudyAt <= t) {
      phase = 'cloudy';
      cloudyAt = null;
      persist();
      return true;
    }
    return false;
  }

  /** Restores saved state (or starts fresh). */
  function load() {
    const saved = readSaved();
    if (saved && saved.phase === 'cloudy') {
      phase = 'cloudy';
      cloudyAt = null;
    } else if (saved && saved.phase === 'clear' && Number.isFinite(saved.cloudyAt)) {
      phase = 'clear';
      cloudyAt = saved.cloudyAt;
    } else {
      startFreshTimer();
    }
    const becameCloudyWhileAway = check();
    persist();
    return { ...snapshot(), becameCloudyWhileAway };
  }

  /** A click. Clears a cloudy orb and starts a new random wait. */
  function clear() {
    if (phase !== 'cloudy') return false;
    startFreshTimer();
    persist();
    return true;
  }

  function msUntilCloudy() {
    return phase === 'clear' ? Math.max(0, cloudyAt - now()) : Infinity;
  }

  // Debug helpers, used by the tray menu in development builds.
  function forceCloudy() {
    if (phase !== 'clear') return false;
    phase = 'cloudy';
    cloudyAt = null;
    persist();
    return true;
  }

  function setNextIn(ms) {
    phase = 'clear';
    cloudyAt = now() + Math.min(Math.max(0, ms), HARD_CAP_MS);
    persist();
  }

  return {
    load,
    check,
    clear,
    msUntilCloudy,
    forceCloudy,
    setNextIn,
    snapshot,
    getPhase: () => phase,
  };
}

module.exports = { createOrb, HARD_CAP_MS, HOUR_MS };
