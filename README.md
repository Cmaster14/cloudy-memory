# Cloudy Memory

A Windows system-tray app. The tray icon is a glass orb that, at a random moment
while the app is running, slowly fills with smoke. Click the icon and the smoke
clears, and a new random wait begins. The wait is never longer than 48 hours.

## Run it

Requires Node 20 or newer.

```
npm install
npm start
```

A development run adds two **Debug** items to the tray's right-click menu so you
don't have to wait hours to see it work:

- **Debug: cloud over now**
- **Debug: cloud over in 10 s**

(Debug items also appear in a packaged build if you launch it with `--debug`.)

**Windows 11 tip:** new tray icons start out hidden under the `^` overflow
arrow. Drag the orb out of it onto the visible tray area, or turn it on under
Settings > Personalization > Taskbar > Other system tray icons.

## How it behaves

- The wait is picked uniformly between `timer.minMs` and `timer.maxMs` in
  `src/config.js` (default 30 minutes to 48 hours). `maxMs` is clamped to 48 h
  in `src/state.js` whatever you put there, and a saved deadline further out
  than 48 h is pulled in on load, so a clock change can't stretch it either.
- The deadline is stored as an absolute timestamp in `state.json` under the
  app's user-data folder (`%APPDATA%\cloudy-memory`). Quitting and relaunching keeps
  the same deadline. If it passed while the app was closed, the orb is simply
  cloudy on launch (no animation, no toast).
- Windows sleep can stall JavaScript timers, so the app wakes at least once a
  minute to compare the clock with the deadline and re-checks on the power
  monitor's `resume` and `unlock-screen` events.
- When the orb clouds over live, it animates over about 2 seconds and shows a
  quiet Windows toast (turn it off with `notification.enabled`).
- Clicking a cloudy orb plays the animation in reverse and starts the new wait
  immediately. Clicking a clear orb gives it a tiny flicker and changes nothing.
  A click mid-animation reverses from wherever the smoke has got to.
- It is a tray-only app: there is no window. Only one copy can run at a time.

## Files

```
main.js                    Electron entry: single-instance lock, loads frames, starts the tray app
src/state.js               Timer logic and the 48 h cap (pure, no Electron)
src/app.js                 Wires state to the tray: click, menu, toasts, sleep/resume
src/animator.js            Steps the icon through the smoke frames
src/icons.js               Loads the PNG frames as multi-resolution tray images
src/storage.js             Atomic JSON save/load
src/config.js              Wait range, animation speed, texts
src/frames.config.js       Frame count, sizes, placeholder colours
scripts/generate-frames.js Draws the placeholder orb (needs sharp)
assets/frames/             orb-L<level>-<size>.png, levels 0-8, sizes 16/24/32/48
assets/icon.png            512 px app icon for the installer
test/                      node:test suites
```

## Swapping in your own art

Replace the PNGs in `assets/frames/` keeping the names and sizes:
`orb-L0-16.png` ... `orb-L8-48.png`. Level 0 is fully clear, level 8 fully
clouded, and the levels in between are the animation. Windows picks the size
that matches the display scaling (16 px at 100%, 24 at 150%, 32 at 200%, 48 at
300%). Replace `assets/icon.png` (256 px or larger) for the installer icon.
You can change the number of levels in `src/frames.config.js`.

The placeholder art can be redrawn with `npm run frames` after editing the
colours there.

## Build an installer

```
npm run dist
```

This uses electron-builder to produce an NSIS installer in `dist/`. Once the
app is installed, the tray menu's **Launch at login** checkbox becomes
available (it is disabled in development runs on purpose).

Before you ship anything, change `appId` in `package.json` and
`appUserModelId` in `src/config.js` from the `com.example` placeholders, and
rename the app in the texts in `src/config.js` if you like.

## Tests

```
npm test
```

Covers the timer and the 48 h cap, restarts and corrupt state, clock changes,
sleep and resume, and the full click/animation flow against a fake tray, using
a fake clock so no test actually waits.
