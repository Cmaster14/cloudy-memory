# Cloudy Memory: user-generated reminders

## Goal

From the tray's right-click menu, let the user set a reminder ("in 30 minutes") with a note. When it comes due the orb clouds over in **green**, and hovering shows the note. A click clears it. The existing random purple timer keeps running independently.

Three visual states, all now drawn by `scripts/generate-frames.js`:

| State | Icon set | Tooltip |
| --- | --- | --- |
| Random timer cloudy only | purple (`orb-L*`) | existing "You have forgotten something..." |
| Custom reminder(s) due only | green (`orb-green-L*`) | the note(s) |
| Both | mixed (`orb-mixed-L*`): purple and green in two hard-edged regions | note(s), then the existing phrase |

## What I found in app.js

1. **It currently won't parse.** The "Create reminder" menu item is missing a trailing comma before `{ type: 'separator' }`.
2. **"Create reminder" is `enabled: app.isPackaged`**, so it would be greyed out in `npm start`. Make it always enabled.
3. **The menu is built once** in `start()`. A list of upcoming reminders needs the menu rebuilt whenever reminders change.
4. **`schedule()` only knows about the orb.** It sleeps `min(orb.msUntilCloudy(), 60s)`. It must also consider the next reminder due time.
5. **`showCloudy()` and `onClick()` assume a single frame set.** The animator renders `frames[i]`; it needs to render from whichever set is active.
6. **Tooltip has a hard length limit.** The Windows tray tooltip is capped at about 127 characters, so notes must be truncated and multiple reminders summarised ("+2 more").

## Design

### 1. Pure reminder logic: `src/reminders.js` (new)

Same philosophy as `state.js`: no Electron, no timers, injected `now`, `storage` and id generator.

- Reminder shape: `{ id, dueAt, note, createdAt, fired }`. `dueAt` is an absolute epoch-ms timestamp, so it survives restarts and sleep exactly like the orb deadline.
- API: `add(delayMs, note)`, `cancel(id)`, `check()` (marks due reminders fired, returns the newly fired ones), `msUntilNext()`, `pending()`, `fired()`, `dismissFired()`, `load()`.
- Stored in its **own file** (`reminders.json` via the existing `createFileStorage`), so `state.js` and its 15 tests stay untouched.
- Validation on `add` and `load`: finite `dueAt`, note trimmed and length-capped (200 chars), junk entries dropped, corrupt file starts empty.
- Custom reminders are **not** bound by the 48 h cap (that exists for the random timer). I suggest a separate generous ceiling (30 days), see open questions.

### 2. Display state: `src/display.js` (new, pure)

One function turns `(orbPhase, firedReminders)` into `{ set: 'purple' | 'green' | 'mixed' | null, tooltip }`. `null` means clear. The tooltip builder truncates to 127 characters. Easy to unit test, and it keeps `app.js` from growing conditionals.

### 3. Tray wiring: `src/app.js`

- `createTrayApp` takes `frameSets` (`{ purple, green, mixed }`) and a `reminders` instance (default built from storage, injectable for tests) plus an `openReminderWindow` function (injectable, so tests don't need a BrowserWindow).
- A `refresh()` function recomputes the display state and applies it. Called after every tick, click, add, cancel, debug action.
- `schedule()` sleeps `min(orb.msUntilCloudy(), reminders.msUntilNext(), 60s)`.
- `tick()` runs `orb.check()` and `reminders.check()`. A toast fires for each *newly* due thing; the reminder toast body is the note.
- Changing set while cloudy (purple to mixed when a reminder fires, mixed to green when only the orb is cleared) keeps the same level index. All three sets share blob geometry, so the swap reads as a colour appearing rather than a restart.
- Launch: if anything is already due, show it immediately and silently, as the orb does today.
- Menu rebuilt from `refresh()`: **Create reminder...**, **Upcoming reminders** submenu (each entry "in 25 min: note", click to cancel), Launch at login, debug items, Quit.

### 4. Input window

- `src/reminder-window.js`: creates one small, non-resizable `BrowserWindow` (reuse if already open, destroy on close). `contextIsolation: true`, no node integration.
- `src/preload.js`: exposes a single `submitReminder({ amount, unit, note })` through `contextBridge`.
- `src/ui/reminder.html`, `reminder.js`, `reminder.css`: amount field + unit select (minutes / hours / days), note field, Set button. Enter submits, Esc closes.
- v1 is deliberately a structured form, not free text. A natural-language parser ("30 minutes from now", "tomorrow 9am") can be layered on later as an extra input without changing the data model.
- IPC handler in `main.js` validates input again in the main process before calling `reminders.add`.
- `package.json` `build.files` already includes `src/**/*`, so the UI files are packaged.

### 5. Click behaviour

Proposed: **a click clears everything that is showing** (consistent with "click returns it to the original state"). Clearing the random orb starts a new random wait as today; clearing custom reminders removes them from the list. See open question 1.

### 6. Tests

- `test/reminders.test.js`: add/cancel, ordering, due detection, restart persistence, fired-while-closed, corrupt storage, note truncation.
- `test/display.test.js`: all state combinations, tooltip truncation and "+N more".
- Extend `test/app.test.js`: reminder fires green, mixed when both, click clears both, menu rebuilds, sleep/resume past a due reminder, silent launch.
- `test/frames.test.js` already covers all three icon sets (done).

### 7. Docs

README: update features (remove "IN DEVELOPMENT"), project layout, config table, and the custom artwork section (new file naming for variants).

## Build order

1. Fix the comma bug, enable the menu item (app launches again).
2. `reminders.js` + tests.
3. `display.js` + tests.
4. Wire into `app.js`: scheduling, refresh, frame sets, toasts, menu rebuild + tests.
5. Input window, preload, IPC in `main.js`.
6. Manual pass on a real Windows 11 desktop (tray, toasts, window focus, tooltip length).
7. README and installer build.

## Open questions

1. **Click semantics:** clear everything at once (proposed), or one thing per click (e.g. green first, then purple)?
2. **Cap for custom reminders:** 30 days, 1 year, or none?
3. **Multiple reminders at once:** allowed (proposed, with the "+N more" tooltip), or one active reminder at a time?
4. **Reminder that comes due while the orb is already cloudy:** proposed to show mixed. Confirm that's the intent of the mixed icon.
5. **Toast for custom reminders:** show the note in the toast (proposed), or stay silent like the random orb?

## Icon sets (done)

Generated from `scripts/generate-frames.js` with variants defined in `src/frames.config.js`. File names: purple keeps `orb-L<level>-<size>.png`; the new sets are `orb-green-L<level>-<size>.png` and `orb-mixed-L<level>-<size>.png`, each at 16/24/32/48 px for levels 0-8. In the mixed set, purple and green are drawn in two complementary regions split by a slowly turning S-curve, each clipped so they never overlap or blend. `loadFrames(dir, nativeImage, { all: true })` returns all three sets.
