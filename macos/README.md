# Cloudy Memory for macOS

A native Swift menu bar app. The Windows (Electron) app in the repository root is untouched and still builds as before; this folder adds the macOS build alongside it.

```
macos/
  Package.swift
  Sources/CloudyMemoryCore/   pure logic, no UI (shared with a future iOS app)
  Sources/CloudyMemoryUI/     SwiftUI views (reminders window, menu) and icon loading, with #Previews
  Sources/CloudyMemory/       the app: SwiftUI App + MenuBarExtra, the model that drives it, notifications
  Tests/                      XCTest: the shared fixtures, plus icon-asset checks
  Resources/Info.plist        bundle template (LSUIElement: no Dock icon)
  VERSION                     release version used by scripts/build-mac.sh
```

Requires macOS 13+ and Xcode 15+ (or the Command Line Tools).

## Xcode

Open the `macos/` folder (or `macos/Package.swift`) in Xcode; no `.xcodeproj` is needed.

**Previews.** The views live in the `CloudyMemoryUI` library so previews work. Open `RemindersView.swift`, `MenuContent.swift` or `OrbFramesGallery.swift` and show the canvas (Option-Command-Return). The views are stateless (plain values and closures), so each preview feeds them sample data: an empty list, pending and due reminders, a validation error, a long note in dark mode, the menu with and without smoke, and every orb frame of every colour. If a preview does not load, try Product > Clean Build Folder, and check that the scheme is `CloudyMemoryUI` or `CloudyMemory`.

## Develop

```sh
swift test --package-path macos        # runs the Swift port against the shared fixtures
swift run --package-path macos CloudyMemory --debug
```

`swift run` works from a source checkout (icons are read from `assets/frames`). Notifications and Launch at Login need a real `.app` bundle, so they are inactive in that mode. `--debug` (or `CLOUDY_DEBUG=1`) adds the "Debug: ..." menu items.

## How it differs from Windows

- The menu bar item is a SwiftUI `MenuBarExtra` in `.menu` style, so it is a native macOS menu that opens on **any** click. **Clear Reminders** clears the orb and every due reminder, and is enabled only while something is showing.
- Icons are 18 px (@1x) and 36 px (@2x) full-colour PNGs, not "template" images (templates are tinted monochrome and would lose the purple and green smoke). The icon animation works by publishing the current frame, which makes the `MenuBarExtra` label redraw.
- State is stored in `~/Library/Application Support/Cloudy Memory/` using the same JSON schema as the Windows build.
- Launch at Login uses `SMAppService` and only works from an installed `.app`.
- Wake and screen-unlock events re-check the timers, like Windows resume and unlock.

## Things to check first (written without a Mac to run them on)

These rely on behaviour I could not verify, so test them first:

1. **The hover tooltip.** `MenuBarExtra` has no tooltip API. The label uses `.help(...)`, and `StatusItemTooltip.swift` also sets `toolTip` on the status bar button directly (it finds the button inside the status bar window). If hovering the icon shows nothing, that file is where to look; if `.help` alone works, delete the file.
2. **The animated icon.** Every animation frame updates the `MenuBarExtra` label image. Check the smoke fills and drains smoothly, and that the colours are not tinted.
3. **The reminders window** is a SwiftUI view hosted in an `NSWindow` (see `RemindersWindow.swift` for why not a `Window` scene). Check that it comes to the front when opened from the menu.
4. **Notifications and Launch at Login** only work from the packaged app, not from Xcode or `swift run`.

## Build a DMG

```sh
scripts/build-mac.sh
```

With nothing configured it makes an ad-hoc signed DMG that runs on the Mac that built it. To produce something other people can open:

1. Enrol in the Apple Developer Program and create a **Developer ID Application** certificate (Xcode, Settings, Accounts, Manage Certificates).
2. Store notarization credentials once:
   ```sh
   xcrun notarytool store-credentials "cloudy-memory-notary" \
     --apple-id you@example.com --team-id TEAMID --password <app-specific password>
   ```
3. Build:
   ```sh
   DEVELOPER_ID_APPLICATION="Developer ID Application: Your Name (TEAMID)" \
   NOTARY_PROFILE="cloudy-memory-notary" \
   scripts/build-mac.sh
   ```

The script runs the tests, builds a universal (arm64 + x86_64) release binary, assembles and signs `Cloudy Memory.app` with the hardened runtime, notarizes and staples it, wraps it in `dist-mac/CloudyMemory-<version>.dmg`, signs, notarizes and staples the DMG, and prints the SHA-256 plus a ready-to-edit Homebrew cask.

Set the version in `macos/VERSION` (or `VERSION=1.2.0 scripts/build-mac.sh`). The bundle id defaults to `io.github.cmaster14.cloudymemory` (override with `BUNDLE_ID`).

## Homebrew cask

Upload the DMG to a GitHub release tagged `v<version>`, then put the cask the script prints into your tap as `Casks/cloudy-memory.rb`. The `url` assumes the asset is named `CloudyMemory-<version>.dmg`, which is what the script produces.

## Keeping the ports in step

`shared/fixtures/` holds language-neutral test vectors that both the JavaScript tests (`npm test`) and the Swift tests run. Change a fixture first, make the JS pass, then the Swift. See `shared/fixtures/README.md`.
