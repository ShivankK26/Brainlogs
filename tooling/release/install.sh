#!/bin/sh
# Brainlogs installer for macOS: downloads the .dmg with curl (no Gatekeeper quarantine flag),
# copies Brainlogs.app to /Applications, and opens it. No Apple account or App Store involved.
#
#   curl -fsSL https://github.com/ShivankK26/Brainlogs/releases/latest/download/install.sh | sh
#   BRAINLOGS_VERSION=v1.0.2 sh install.sh      # pin a version
set -eu
REPO="${BRAINLOGS_REPO:-ShivankK26/Brainlogs}"
VERSION="${BRAINLOGS_VERSION:-latest}"
if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS. Linux: download the .AppImage or .deb from https://github.com/$REPO/releases" >&2
  exit 1
fi
if [ "$VERSION" = "latest" ]; then
  BASE="https://github.com/$REPO/releases/latest/download"
else
  BASE="https://github.com/$REPO/releases/download/$VERSION"
fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "Downloading Brainlogs ($VERSION)…"
# The asset name carries the version; resolve it from the release's checksum list.
curl -fsSL "$BASE/SHA256SUMS.txt" -o "$TMP/SHA256SUMS.txt"
DMG="$(awk '/_universal\.dmg$/ {print $2; exit}' "$TMP/SHA256SUMS.txt")"
[ -n "$DMG" ] || { echo "No macOS .dmg in this release." >&2; exit 1; }
curl -fL --progress-bar "$BASE/$DMG" -o "$TMP/$DMG"
echo "Verifying checksum…"
( cd "$TMP" && grep " $DMG\$" SHA256SUMS.txt | shasum -a 256 -c - >/dev/null )
MNT="$(hdiutil attach -nobrowse -readonly "$TMP/$DMG" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')"
trap 'hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
APP="$(find "$MNT" -maxdepth 1 -name '*.app' | head -n 1)"
[ -n "$APP" ] || { echo "No .app in the image." >&2; exit 1; }
DEST="/Applications/$(basename "$APP")"
if [ -d "$DEST" ]; then
  echo "Replacing existing $DEST"
  rm -rf "$DEST"
fi
cp -R "$APP" /Applications/
# curl downloads carry no quarantine attribute, but clear it anyway so first launch is silent.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
echo "Installed $DEST"
echo "Opening Brainlogs. Grant Accessibility when macOS asks: System Settings → Privacy & Security → Accessibility."
open "$DEST"
