# Smoke Orb

**A Windows tray app: a glass orb that quietly fills with smoke at a random moment, and stays cloudy until you click it clear.**

Inspired by the Remembrall from Harry Potter: it sits in your system tray and, at some point in the next 30 minutes to 48 hours, the glass clouds over. That is your cue that you've forgotten something. Click the orb, the smoke drains away, and a fresh random timer begins. The wait is never longer than 48 hours.

![Every smoke level of the orb, on dark and light taskbars, at 48 px and at the real 16 px tray size](assets/orb-L6-48.png)

<sub>All nine smoke levels, drawn on dark and light taskbars, at 48 px (top two rows) and at the true 16 px tray size (bottom two rows, enlarged).</sub>

## Features

- **Random, bounded timer.** Each wait is picked uniformly between a configurable minimum (default 30 minutes) and a hard ceiling of 48 hours.
- **Smooth smoke animation.** The orb fills over about two seconds, and a click plays the same frames in reverse. Clicking mid-animation reverses from wherever the smoke has got to.
- **Survives restarts and sleep.** The deadline is saved as an absolute timestamp, so quitting and relaunching keeps it. If it passed while the app was closed, the orb is simply cloudy on launch.
- **Sharp at any display scaling.** Frames ship at 16, 24, 32 and 48 px, so Windows picks the right size at 100%, 150%, 200% and 300% scaling.
- **Quiet notification.** A silent Windows toast when the orb clouds over (optional).
- **Tray-only.** No window, a single running instance, and a "Launch at login" checkbox in the tray menu for installed builds.
- **Custom reminder creation.** Opens app window to allow user to set custom reminder timer with notes *IN DEVELOPMENT*

## Quick start

Requires Windows 10/11 and Node.js 20 or newer.

```powershell
git clone <this repo>
cd smoke-orb
npm install
npm start
```

A development run adds two items to the tray's right-click menu so you don't have to wait hours to see it work:

- **Debug: cloud over now**
- **Debug: cloud over in 10 s**

On Windows 11, new tray icons start hidden under the `^` overflow arrow. Drag the orb out onto the visible tray, or enable it under Settings > Personalization > Taskbar > Other system tray icons.

If `npm install` stalls on "Downloading Electron binary...", see [Troubleshooting](#troubleshooting).

## How it works

The interesting part is that **nothing relies on a long-running timer**, because JavaScript timers are unreliable across Windows sleep and hibernate, and a 48-hour `setTimeout` would not survive an app restart anyway.

- **State is a deadline, not a countdown.** `src/state.js` holds the orb's entire logic as pure code with no Electron, timers or disk access of its own. The orb is either `clear` with an absolute `cloudyAt` timestamp, or `cloudy`. Time, storage and randomness are injected, so the whole thing is testable with a fake clock.
- **The 48-hour cap is enforced everywhere.** It is applied when a delay is picked, when saved state is loaded, and on every check. A config value above 48 hours is clamped, a hand-edited state file is pulled in, and if the system clock moves backwards the wait still can't exceed the cap.
- **Wake-ups are cheap and frequent.** The app sleeps at most 60 seconds at a time and compares the clock to the deadline, and it re-checks on the power monitor's `resume` and `unlock-screen` events, so a PC that was suspended mid-wait notices promptly.
- **State is written atomically.** The JSON state file in `%APPDATA%\smoke-orb` is written to a temp file and renamed into place, so a crash can't leave a half-written file. Corrupt or missing state just starts a fresh timer.
- **The tray icon is a frame player.** A small animator walks the icon through nine pre-rendered smoke levels one frame per beat, and each level is a multi-resolution image so Windows can choose the sharpest size.

## Project layout

```
main.js                    Electron entry: single-instance lock, loads frames, starts the tray app
src/state.js               Timer logic and the 48 h cap (pure, no Electron)
src/app.js                 Wires state to the tray: click, menu, toasts, sleep/resume
src/animator.js            Steps the icon through the smoke frames
src/icons.js               Loads the PNG frames as multi-resolution tray images
src/storage.js             Atomic JSON save/load
src/config.js              Wait range, animation speed, texts
src/frames.config.js       Frame count, sizes, placeholder colours
scripts/generate-frames.js Draws the placeholder orb with sharp
assets/frames/             orb-L<level>-<size>.png, levels 0-8, sizes 16/24/32/48
assets/icon.png            512 px app icon for the installer
test/                      node:test suites
```

## Configuration

Everything you're likely to change is in `src/config.js`:

| Setting | Default | What it does |
| --- | --- | --- |
| `timer.minMs` | 30 minutes | Shortest possible wait |
| `timer.maxMs` | 48 hours | Longest possible wait (clamped to 48 h regardless) |
| `animation.frameMs` | 220 | Time per animation frame |
| `notification.enabled` | `true` | Show a toast when the orb clouds over |
| `text.*` | | Tooltips and notification wording |

## Custom artwork

The orb art here is a generated placeholder: a glass sphere with seeded, swirling blobs of smoke, drawn as SVG and rasterised by `scripts/generate-frames.js`. To use your own, replace the PNGs in `assets/frames/` and keep the names and sizes:

```
orb-L0-16.png ... orb-L8-48.png
```

Level 0 is fully clear, level 8 is fully clouded, and the levels in between are the animation. Replace `assets/icon.png` (256 px or larger) for the installer icon. You can change the number of levels in `src/frames.config.js`. To redraw the placeholder art after editing its colours, run `npm run frames`.

## Tests

```powershell
npm test
```

27 tests using Node's built-in test runner and a hand-cranked fake clock, so nothing actually waits. They cover:

- the timer range and the 48-hour cap, including oversized config values
- restarts, corrupt or junk saved state, and storage failures
- a deadline that passes while the app is closed or the PC is asleep
- the click flow: clearing, a fresh timer, clicking a clear orb, clicking mid-animation
- the tray wiring against a fake tray, and that every frame file exists at the right size

The tray itself (real icons, Windows scaling, toasts) needs a real Windows desktop to verify.

## Building an installer

```powershell
npm run dist
```

This uses electron-builder to produce an NSIS installer in `dist/`. Once installed, the tray menu's **Launch at login** checkbox becomes available (it's disabled in development runs, since it would otherwise register `electron.exe` itself). Before shipping, change `appId` in `package.json` and `appUserModelId` in `src/config.js` from the `com.example` placeholders.

## Troubleshooting

**`npm install` hangs at "Downloading Electron binary..."** The binary is a ~100 MB download from GitHub with no progress output. If it's genuinely stuck (10+ minutes), try these in order:

1. Install everything else first, then fetch the binary on its own:
   ```powershell
   $env:ELECTRON_SKIP_BINARY_DOWNLOAD=1
   npm install
   Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD
   node node_modules\electron\install.js
   ```
2. Use a mirror: `$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`
3. Behind a VPN or proxy: disconnect the VPN, or set `$env:ELECTRON_GET_USE_PROXY=1` and `$env:HTTPS_PROXY`.
4. Install manually: download `electron-v<version>-win32-x64.zip` from the [Electron releases](https://github.com/electron/electron/releases), extract it into `node_modules\electron\dist`, and create `node_modules\electron\path.txt` containing just `electron.exe`.

## License

No license has been chosen yet. Add a `LICENSE` file before publishing if you want others to be able to use or modify the code.
