#!/usr/bin/env bash
#
# Builds, signs, notarizes and packages Cloudy Memory for macOS.
# Run it on a Mac with Xcode (or the Command Line Tools) installed:
#
#   scripts/build-mac.sh
#
# It produces dist-mac/CloudyMemory-<version>.dmg and prints the SHA-256 and a
# Homebrew cask snippet for it. With no environment variables set it makes an
# ad-hoc signed DMG that runs on this Mac only (good for testing). For a DMG
# other people can open, set:
#
#   DEVELOPER_ID_APPLICATION   e.g. "Developer ID Application: Your Name (TEAMID)"
#   NOTARY_PROFILE             a notarytool keychain profile, created once with:
#                              xcrun notarytool store-credentials "cloudy-memory-notary" \
#                                  --apple-id you@example.com --team-id TEAMID --password <app-specific password>
#
# Optional:
#   VERSION       release version (default: the contents of macos/VERSION)
#   BUNDLE_ID     default io.github.cmaster14.cloudymemory
#   SKIP_TESTS=1  skip `swift test`
#   ARCHS         default "arm64 x86_64" (a universal binary)
#
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

APP_NAME="Cloudy Memory"
EXECUTABLE="CloudyMemory"
BUNDLE_ID="${BUNDLE_ID:-io.github.cmaster14.cloudymemory}"
VERSION="${VERSION:-$(tr -d '[:space:]' < macos/VERSION)}"
BUILD="${BUILD:-$(date +%Y%m%d%H%M)}"
ARCHS="${ARCHS:-arm64 x86_64}"
IDENTITY="${DEVELOPER_ID_APPLICATION:--}"
OUT="$ROOT/dist-mac"
APP="$OUT/$APP_NAME.app"
DMG="$OUT/$EXECUTABLE-$VERSION.dmg"

say() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || die "this script must run on macOS"
command -v swift >/dev/null || die "swift not found (install Xcode or the Command Line Tools)"
[[ -f assets/icon.png ]] || die "assets/icon.png is missing"
ls assets/frames/orb-L0-18.png assets/frames/orb-L0-36.png >/dev/null 2>&1 \
  || die "the 18/36 px frames are missing; run: npm run frames:mac"

if [[ "$IDENTITY" == "-" ]]; then
  echo "note: DEVELOPER_ID_APPLICATION is not set, so the app is ad-hoc signed and will only run on this Mac."
fi

# ---------------------------------------------------------------- tests
if [[ "${SKIP_TESTS:-0}" != "1" ]]; then
  say "Running the Swift tests"
  swift test --package-path macos
fi

# ---------------------------------------------------------------- build
say "Building $EXECUTABLE ($ARCHS) in release mode"
ARCH_FLAGS=()
for a in $ARCHS; do ARCH_FLAGS+=(--arch "$a"); done
swift build --package-path macos -c release --product "$EXECUTABLE" "${ARCH_FLAGS[@]}"
BIN_DIR="$(swift build --package-path macos -c release --product "$EXECUTABLE" "${ARCH_FLAGS[@]}" --show-bin-path)"
[[ -x "$BIN_DIR/$EXECUTABLE" ]] || die "built binary not found at $BIN_DIR/$EXECUTABLE"

# ---------------------------------------------------------------- bundle
say "Assembling $APP_NAME.app"
rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/frames"
cp "$BIN_DIR/$EXECUTABLE" "$APP/Contents/MacOS/$EXECUTABLE"

sed -e "s/@BUNDLE_ID@/$BUNDLE_ID/g" \
    -e "s/@VERSION@/$VERSION/g" \
    -e "s/@BUILD@/$BUILD/g" \
    macos/Resources/Info.plist > "$APP/Contents/Info.plist"
plutil -lint "$APP/Contents/Info.plist" >/dev/null

# Menu bar frames (18 px @1x and 36 px @2x, every colour and level).
cp assets/frames/orb*-18.png assets/frames/orb*-36.png "$APP/Contents/Resources/frames/"

# App icon (shown in Finder and the notification banner). Uses the sized
# assets/icon_<px>.png files when present and falls back to resizing the 1024 px
# one (or assets/icon.png) for any size that is missing.
ICONSET="$OUT/AppIcon.iconset"
mkdir -p "$ICONSET"
ICON_BASE="assets/icon.png"
[[ -f assets/icon_1024.png ]] && ICON_BASE="assets/icon_1024.png"
for spec in "16 icon_16x16" "32 icon_16x16@2x" "32 icon_32x32" "64 icon_32x32@2x" \
            "128 icon_128x128" "256 icon_128x128@2x" "256 icon_256x256" "512 icon_256x256@2x" \
            "512 icon_512x512" "1024 icon_512x512@2x"; do
  set -- $spec
  if [[ -f "assets/icon_$1.png" ]]; then
    cp "assets/icon_$1.png" "$ICONSET/$2.png"
  else
    sips -z "$1" "$1" "$ICON_BASE" --out "$ICONSET/$2.png" >/dev/null
  fi
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$ICONSET"

# ---------------------------------------------------------------- sign
sign() {
  if [[ "$IDENTITY" == "-" ]]; then
    codesign --force --sign - --timestamp=none "$@"
  else
    codesign --force --sign "$IDENTITY" --options runtime --timestamp "$@"
  fi
}

say "Signing the app"
sign "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

notarize() { # notarize <file>
  xcrun notarytool submit "$1" --keychain-profile "$NOTARY_PROFILE" --wait
}

if [[ "$IDENTITY" != "-" && -n "${NOTARY_PROFILE:-}" ]]; then
  say "Notarizing the app"
  ZIP="$OUT/notarize-app.zip"
  ditto -c -k --keepParent "$APP" "$ZIP"
  notarize "$ZIP"
  rm -f "$ZIP"
  xcrun stapler staple "$APP"
fi

# ---------------------------------------------------------------- dmg
say "Creating $(basename "$DMG")"
STAGE="$OUT/dmg-stage"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"

if [[ "$IDENTITY" != "-" ]]; then
  codesign --force --sign "$IDENTITY" --timestamp "$DMG"
  if [[ -n "${NOTARY_PROFILE:-}" ]]; then
    say "Notarizing the DMG"
    notarize "$DMG"
    xcrun stapler staple "$DMG"
    xcrun stapler validate "$DMG"
    spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG" || true
  else
    echo "note: NOTARY_PROFILE is not set, so the DMG is signed but not notarized; Gatekeeper will warn on other Macs."
  fi
fi

# ---------------------------------------------------------------- result
SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"
say "Done"
echo "DMG:     $DMG"
echo "SHA-256: $SHA"
cat <<CASK

Homebrew cask (Casks/cloudy-memory.rb in your tap):

cask "cloudy-memory" do
  version "$VERSION"
  sha256 "$SHA"

  url "https://github.com/Cmaster14/cloudy-memory/releases/download/v#{version}/$EXECUTABLE-#{version}.dmg"
  name "Cloudy Memory"
  desc "Menu bar orb that clouds over when you have forgotten something"
  homepage "https://github.com/Cmaster14/cloudy-memory"

  depends_on macos: ">= :ventura"

  app "$APP_NAME.app"

  zap trash: [
    "~/Library/Application Support/$APP_NAME",
  ]
end
CASK
