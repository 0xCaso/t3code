#!/usr/bin/env bash
# Builds this fork's desktop app, "T3 Code (Custom)", for Apple Silicon and
# installs it in /Applications. The nightly sync runs it after merging the
# newest upstream Nightly tag; you can also run it by hand.
#
#   scripts/custom-build.sh v0.0.46-nightly.20261015.3145   build, then install
#   scripts/custom-build.sh --install                       install a pending build
#   scripts/custom-build.sh --on-quit                       install a pending build, then reopen
#
# The tag only sets the base version (0.0.46). The build is versioned
# <base>-preview.<today>.<n>, which names it "Custom" and ships it without an
# update feed. A build made while the app is open waits in release/pending and
# posts a notification. The LaunchAgent com.0xcaso.t3code-custom-install runs
# --on-quit every 10 seconds: once you quit the app, it installs the pending
# build and opens it again. The three newest DMGs are kept.
set -euo pipefail

cd "$(dirname "$0")/.."
app="/Applications/T3 Code (Custom).app"
pending="release/pending/T3 Code (Custom).app"

# -a: the nightly task runs inside the app, and pgrep skips its own ancestors by default.
# The pattern is a regex, so the parentheses in the app name are escaped.
app_running() {
  /usr/bin/pgrep -af 'T3 Code \(Custom\)\.app/Contents/MacOS/' >/dev/null
}

install_pending() {
  if [ ! -d "$pending" ]; then
    echo "nothing to install"
    return 1
  fi
  local version claimed
  version="$(/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" "$pending/Contents/Info.plist")"
  if app_running; then
    echo "built $version; it installs when T3 Code (Custom) is closed"
    return 1
  fi
  # The rename claims the build, so the build and the LaunchAgent never both install it.
  claimed="release/installing.$$"
  mv "$pending" "$claimed" 2>/dev/null || return 1
  rm -rf "$app"
  /usr/bin/ditto "$claimed" "$app"
  rm -rf "$claimed"
  echo "$(date '+%F %T') installed $version in $app"
}

case "${1:-}" in
  --install)
    install_pending || true
    exit 0
    ;;
  --on-quit)
    # Runs every 10 seconds: stay silent unless there is something to install.
    [ -d "$pending" ] && ! app_running || exit 0
    install_pending && /usr/bin/open "$app"
    exit 0
    ;;
esac

tag="${1:?usage: scripts/custom-build.sh <nightly tag> | --install | --on-quit}"
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

# Copy next to pending, then rename: the LaunchAgent must never see a half-copied app.
mountpoint="$(mktemp -d /tmp/t3-custom-dmg.XXXX)"
staging="release/staging.$$"
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$dmg" >/dev/null
rm -rf "$staging"
ditto "$mountpoint/T3 Code (Custom).app" "$staging"
hdiutil detach "$mountpoint" >/dev/null
rmdir "$mountpoint"
rm -rf "$pending"
mkdir -p "$(dirname "$pending")"
mv "$staging" "$pending"

if ! install_pending; then
  /usr/bin/osascript -e "display notification \"Versione $version pronta: chiudi l'app (Cmd+Q) per installarla, poi si riapre da sola.\" with title \"T3 Code (Custom)\""
fi
