# Cloudy Memory for macOS

A native Swift menu bar app. The Windows (Electron) app in the repository root is untouched and still builds as before; this folder adds the macOS build alongside it.

```
macos/
  Package.swift
  Sources/CloudyMemoryCore/   pure logic, no AppKit (shared with a future iOS app)
  Sources/CloudyMemory/       the menu bar shell: NSStatusItem, notifications, SwiftUI reminders window
  Tests/CloudyMemoryCoreTests/  XCTest, including the shared fixtures in ../shared/fixtures
  Resources/Info.plist        bundle template (LSUIElement: no Dock icon)
  VERSION                     release version used by scripts/build-mac.sh
```

Requires macOS 13+ and Xcode 15+ (or the Command Line Tools).

## Develop

```sh
swift test --package-path macos        # runs the Swift port against the shared fixtures
swift run --package-path macos CloudyMemory --debug
```

`swift run` works from a source checkout (icons are read from `assets/frames`). Notifications and Launch at Login need a real `.app` bundle, so they are inactive in that mode. `--debug` (or `CLOUDY_DEBUG=1`) adds the "Debug: ..." menu items.

## How it differs from Windows

- The status item's menu opens on **any** click. **Clear Reminders** clears the orb and every due reminder, and is enabled only while something is showing.
- Icons are 18 px (@1x) and 36 px (@2x) full-colour PNGs, not "template" images (templates are tinted monochrome and would lose the purple and green smoke).
- State is stored in `~/Library/Application Support/Cloudy Memory/` using the same JSON schema as the Windows build.
- Launch at Login uses `SMAppService` and only works from an installed `.app`.
- Wake and screen-unlock events re-check the timers, like Windows resume and unlock.

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
