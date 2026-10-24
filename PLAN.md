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
3. **The menu stays static.** Existing reminders are *not* listed in the tray menu (decided). They are viewed and cancelled in the **Custom Reminders** window, opened from the menu item of the same name, so `buildMenu()` is still called once and needs no rebuild logic.
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
- Custom reminders have **no cap**: any positive delay is accepted (the 48 h cap stays specific to the random timer). Input validation only requires a finite, positive amount and a resulting `dueAt` that is a safe integer.
- Any number of reminders can be pending at once.

### 2. Display state: `src/display.js` (new, pure)

One function turns `(orbPhase, firedReminders)` into `{ set: 'purple' | 'green' | 'mixed' | null, tooltip }`. `null` means clear. The tooltip builder truncates to 127 characters. Easy to unit test, and it keeps `app.js` from growing conditionals.

### 3. Tray wiring: `src/app.js`

- `createTrayApp` takes `frameSets` (`{ purple, green, mixed }`) and a `reminders` instance (default built from storage, injectable for tests) plus an `openReminderWindow` function (injectable, so tests don't need a BrowserWindow).
- A `refresh()` function recomputes the display state and applies it. Called after every tick, click, add, cancel, debug action.
- `schedule()` sleeps `min(orb.msUntilCloudy(), reminders.msUntilNext(), 60s)`.
- `tick()` runs `orb.check()` and `reminders.check()`. **Toasts (decided):** a toast fires for each *newly* due custom reminder, with the note as the body (several reminders due in the same tick are combined into one toast, "N reminders are due"). The random orb keeps its existing toast behaviour. Reminders already due at launch show the icon silently, no toast.
- **Set transitions (decided):** when the display set has to change while something is already cloudy, the current unmixed cloud is *unclouded first* (animated down to level 0 in its own colour), then the mixed cloud is animated up from level 0. This applies to both directions: purple showing + a reminder comes due, and green showing + the random orb goes cloudy. The animator gets a small `transitionTo(set)` that plays the reverse of the current set, then the forward animation of the new one. While a transition is playing, further state changes are queued and the final display state is reached afterwards. Hovering during a transition shows the final tooltip.
- Launch: if anything is already due, show it immediately and silently, as the orb does today.
- Menu is built once, as today: **Create reminder**, **Custom Reminders**, Launch at login, debug items, Quit. No reminder list lives in the menu. Both reminder items are always enabled (not tied to `app.isPackaged`; only Launch at login needs that). Each item's `click` just opens its window.

### 4. Windows

**Custom Reminders window (viewer, decided):** opened by the **Custom Reminders** menu item. Lists every reminder: pending ones with a live "due in 25 min / at 3:40 PM" and a Cancel button, then reminders that have come due (shown until a tray click clears them). Empty state: "No reminders yet". It reads through IPC (`reminders:list`) and gets pushed updates (`reminders:changed`) when a reminder is added, cancelled, fires, or is cleared by a click, so it stays correct while open. A small "New reminder" button opens the input window below.

**Input window**

- `src/windows.js`: creates the two small, non-resizable `BrowserWindow`s (input and list), each reused if already open (focus it instead of opening a second) and destroyed on close. `contextIsolation: true`, no node integration.
- `src/preload.js`: exposes a single `submitReminder({ amount, unit, note })` through `contextBridge`.
- `src/ui/reminder.html`, `reminder.js`, `reminder.css`: amount field + unit select (minutes / hours / days), note field, Set button. Enter submits, Esc closes.
- v1 is deliberately a structured form, not free text. A natural-language parser ("30 minutes from now", "tomorrow 9am") can be layered on later as an extra input without changing the data model.
- IPC handler in `main.js` validates input again in the main process before calling `reminders.add`.
- `package.json` `build.files` already includes `src/**/*`, so the UI files are packaged.

### 5. Click behaviour

**Decided: a click clears everything that is showing**, whichever set it is. Clearing the random orb starts a new random wait as today; every fired custom reminder is removed from the list. Reminders that are still pending (not yet due) are untouched.

### 6. Tests

- `test/reminders.test.js`: add/cancel, ordering, due detection, restart persistence, fired-while-closed, corrupt storage, note truncation.
- `test/display.test.js`: all state combinations, tooltip truncation and "+N more".
- Extend `test/app.test.js`: reminder fires green, mixed when both (with the unmix-then-mix sequence in both directions), click clears both, a toast is shown with the note when a custom reminder comes due, no toast for already-due reminders at launch, sleep/resume past a due reminder, silent launch, several reminders pending and due together.
- `test/frames.test.js` already covers all three icon sets (done).

### 7. Docs

README: update features (remove "IN DEVELOPMENT"), project layout, config table, and the custom artwork section (new file naming for variants).

## Status

Implemented and covered by tests (69 passing):

- Icon sets: purple, green and mixed (two hard-edged regions, no blending), generated by `scripts/generate-frames.js`.
- `src/reminders.js`: add, cancel, check, dismiss, persistence, no cap, many at once.
- `src/display.js`: icon set and tooltip from the orb and reminder state; toast text.
- `src/app.js`: scheduling for both timers; unmix-then-mix transitions (both directions, safe mid-animation); green toast per due reminder (combined when several); click clears the orb and all due reminders; silent display of anything already due at launch; debug item "custom reminder in 10 s".
- `src/animator.js`: `to(target, onDone)` so one animation can follow another.
- Custom Reminders window (`src/windows.js`, `src/preload.js`, `src/ipc.js`, `src/ui/*`): the single **Custom Reminders** menu item opens one window with the new-reminder form, a "Due now" list (Dismiss) and a "Waiting" list (Cancel). It updates live. IPC input is validated again in the main process. Notes are only ever written with `textContent`.

Not yet done: a manual pass on a real Windows 11 desktop (tray, toast, window focus, tooltip length) and an installer build.

Menu note: your edit replaced the separate "Create reminder" item with **Custom Reminders**, so creating and viewing live in the same window. The tray menu never lists reminders.

## Build order (all but 6 and 7 done)

1. Fix the comma bug, add the **Custom Reminders** menu item, enable both reminder items (app launches again).
2. `reminders.js` + tests.
3. `display.js` + tests.
4. Wire into `app.js`: scheduling, refresh, frame sets, toasts, menu rebuild + tests.
5. Input window and Custom Reminders window, preload, IPC in `main.js`.
6. Manual pass on a real Windows 11 desktop (tray, toasts, window focus, tooltip length).
7. README and installer build.

## Decisions (confirmed)

1. **Click:** clears everything showing in one click.
2. **Cap:** none on custom reminders.
3. **Concurrency:** multiple pending reminders are allowed.
4. **Mixed icon:** when a reminder comes due while the purple orb is cloudy (or the random orb goes cloudy while a reminder is showing), the existing unmixed cloud is cleared first, then the mixed cloud is shown.
5. **Toast:** shown when a custom reminder becomes due, with the note as its body.

## Remaining small choices (will use these defaults unless you say otherwise)

- Toast wording: title "Cloudy Memory", body is the note.
- Tooltip when mixed: the note(s) first, then the existing purple phrase on a new line, truncated to 127 characters.

## Icon sets (done)

Generated from `scripts/generate-frames.js` with variants defined in `src/frames.config.js`. File names: purple keeps `orb-L<level>-<size>.png`; the new sets are `orb-green-L<level>-<size>.png` and `orb-mixed-L<level>-<size>.png`, each at 16/24/32/48 px for levels 0-8. In the mixed set, purple and green are drawn in two complementary regions split by a slowly turning S-curve, each clipped so they never overlap or blend. `loadFrames(dir, nativeImage, { all: true })` returns all three sets.
