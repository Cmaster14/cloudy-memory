# Shared golden fixtures

Language-neutral test vectors for the logic that every Cloudy Memory build has
to agree on. They are plain JSON, run by:

- `test/fixtures.test.js` against the JavaScript implementation (Windows build), via `npm test`
- `macos/Tests/CloudyMemoryCoreTests/*FixtureTests.swift` against the Swift implementation (macOS build), via `swift test --package-path macos`

When the behaviour changes, change the fixture first, make the JS tests pass,
then make the Swift tests pass. A future Kotlin (Android) port should run the
same files. Expected values are the Windows build's actual behaviour.

| File | Covers | JS source |
| --- | --- | --- |
| `orb.json` | the random-timer state machine, 48 h cap, save/restore | `src/state.js` |
| `reminders.json` | custom reminders, sorting, restart, corrupt files | `src/reminders.js` |
| `display.json` | tooltip and toast text, 127-character budget | `src/display.js` |
| `delay.json` | turning "30 minutes" into a delay, with exact error text | `src/ipc.js` |
| `animator.json` | frame stepping, nudge, clamping | `src/animator.js` |
| `controller.json` | the whole flow with a fake clock: cloud over, click, sleep, mixed colours | `src/app.js` |

## Conventions

- Times are epoch milliseconds. `startMs` is the fake clock's start.
- JSON cannot hold `NaN` or `Infinity`, so a `delayMs` of the string `"NaN"` or `"Infinity"` means that number. Any other string, or `null`, is a wrong type and must be refused.
- A note may be a string, a number or `null` (wrong type, treated as no note), `{"repeat": "x", "count": 200}`, or `{"concat": [...]}`.
- Frames are written `set:index`; `purple:1-8` means purple:1 up to purple:8 and `purple:7-0` counts down.
- An `expect` key that is absent is not checked. `null` means "nothing" (for example `msUntilNext: null` is JavaScript's `Infinity`).
- Lengths are UTF-16 code units, like JavaScript. The cases are ASCII, so any counting agrees.

Not expressible as JSON (so tested separately in each language): storage that
throws, and file storage on disk.
