#!/usr/bin/env bash
# Builds this fork's desktop app, "T3 Code (Custom)", for Apple Silicon and
# installs it in /Applications. The nightly sync runs it after merging the
# newest upstream Nightly tag; you can also run it by hand.
#
#   scripts/custom-build.sh v0.0.46-nightly.20261015.3145
#
# The tag only sets the base version (0.0.46). The build is versioned
# <base>-preview.<today>.<n>, which names it "Custom" and ships it without an
# update feed. The install is skipped while the app is open; the DMG stays in
# release/ either way. The three newest builds are kept.
set -euo pipefail

tag="${1:?usage: scripts/custom-build.sh <nightly tag>}"
cd "$(dirname "$0")/.."

base="${tag#v}"
base="${base%%-*}"
day="$(date +%Y%m%d)"
n=1
while [ -e "release/T3-Code-$base-preview.$day.$n-arm64.dmg" ]; do n=$((n + 1)); done
version="$base-preview.$day.$n"

export PATH="$PWD/node_modules/.bin:$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
# Stale C++ headers in the Command Line Tools break node-pty; use the SDK's.
export CPLUS_INCLUDE_PATH="$(xcrun --show-sdk-path)/usr/include/c++/v1"
# sysinfo needs rustc 1.95; the default stable toolchain here is older.
RUSTUP_TOOLCHAIN=1.95.0 T3CODE_DESKTOP_VERSION="$version" vp run dist:desktop:dmg:arm64

dmg="release/T3-Code-$version-arm64.dmg"
[ -f "$dmg" ] || { echo "build finished but $dmg is missing" >&2; exit 1; }

# Keep the three newest builds (DMG, ZIP and their blockmaps).
ls -t release/T3-Code-*-arm64.dmg | tail -n +4 | while read -r old; do
  rm -f "$old" "$old.blockmap" "${old%.dmg}.zip" "${old%.dmg}.zip.blockmap"
done

app="/Applications/T3 Code (Custom).app"
if pgrep -f "$app/Contents/MacOS/" >/dev/null; then
  echo "built $version; not installed because T3 Code (Custom) is open: $PWD/$dmg"
  exit 0
fi

mountpoint="$(mktemp -d /tmp/t3-custom-dmg.XXXX)"
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$dmg" >/dev/null
trap 'hdiutil detach "$mountpoint" >/dev/null 2>&1; rmdir "$mountpoint" 2>/dev/null' EXIT
rm -rf "$app"
ditto "$mountpoint/T3 Code (Custom).app" "$app"
echo "installed $version in $app"
