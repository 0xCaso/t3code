#!/usr/bin/env bash
# Builds this fork's desktop app, "T3 Code (Custom)", for Apple Silicon and
# installs it in /Applications. The nightly sync runs it after merging the
# newest upstream Nightly tag; you can also run it by hand.
#
#   scripts/custom-build.sh v0.0.46-nightly.20261015.3145   build, then install
#   scripts/custom-build.sh --install                       install a pending build
#
# The tag only sets the base version (0.0.46). The build is versioned
# <base>-preview.<today>.<n>, which names it "Custom" and ships it without an
# update feed. A build made while the app is open waits in release/pending
# until --install finds the app closed. The three newest DMGs are kept.
set -euo pipefail

cd "$(dirname "$0")/.."
app="/Applications/T3 Code (Custom).app"
pending="release/pending/T3 Code (Custom).app"

install_pending() {
  if [ ! -d "$pending" ]; then
    echo "nothing to install"
    return
  fi
  local version
  version="$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$pending/Contents/Info.plist")"
  if pgrep -f "$app/Contents/MacOS/" >/dev/null; then
    echo "built $version; it installs when T3 Code (Custom) is closed"
    return
  fi
  rm -rf "$app"
  ditto "$pending" "$app"
  rm -rf "$pending"
  echo "installed $version in $app"
}

if [ "${1:-}" = "--install" ]; then
  install_pending
  exit 0
fi

tag="${1:?usage: scripts/custom-build.sh <nightly tag> | --install}"
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

mountpoint="$(mktemp -d /tmp/t3-custom-dmg.XXXX)"
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$dmg" >/dev/null
rm -rf "$pending"
mkdir -p "$(dirname "$pending")"
ditto "$mountpoint/T3 Code (Custom).app" "$pending"
hdiutil detach "$mountpoint" >/dev/null
rmdir "$mountpoint"

install_pending
