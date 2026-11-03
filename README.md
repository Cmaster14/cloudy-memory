# Cloudy Memory

**A Windows tray app and macOS menu bar app to remind you that you've forgotten something.**

Inspired by the Remembrall from Harry Potter: it sits in your system tray and clouds over when you have forgotten something. Click the orb to disperse the smoke and let it remind you again the next time.

## Custom reminders

Right-click the tray icon and choose **Custom Reminders** to set a reminder for any time from now (minutes, hours or days) with a note. When it comes due the orb fills with **green** smoke and hovering over it shows your note. If the normal purple smoke is showing at the same time, the orb shows both colours side by side. One click on the orb clears everything that is showing.

**Download Executable**

[Cloudy Memory v1.1](https://github.com/Cmaster14/cloudy-memory/releases/download/v1.1/Cloudy.Memory.Setup.1.1.1.exe)

## macOS

The macOS version is a native Swift menu bar app (macOS 13 or later), built from the `macos/` folder. Its logic is a port of the Windows app and is checked against the same test fixtures in `shared/fixtures/`.

One difference from Windows: the menu opens on any click of the icon (left or right), and **Clear Reminders** in that menu clears the orb and every due reminder.

Build, sign and package a DMG on a Mac with Xcode:

```sh
npm run frames:mac        # once: the 18/36 px menu bar icons (already committed)
scripts/build-mac.sh      # tests, builds, signs, notarizes (if configured) and writes dist-mac/*.dmg
```

See [macos/README.md](macos/README.md) for signing, notarization and the Homebrew cask.

## License

MIT License
