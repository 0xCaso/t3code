#!/usr/bin/env bash
# Builds this fork's desktop app, "T3 Code (Custom)", for Apple Silicon and
# installs it in /Applications. The nightly sync runs it after merging the
# newest upstream Nightly tag; you can also run it by hand.
#
#   scripts/custom-build.sh v0.0.46-nightly.20261015.3145   build, then install
#   scripts/custom-build.sh --install                       install a pending build
#   scripts/custom-build.sh --on-quit                       install a pending build, then reopen
#   scripts/custom-build.sh --setup-signing                 create the signing certificate once
#
# The tag only sets the base version (0.0.46). The build is versioned
# <base>-preview.<today>.<n>, which names it "Custom" and ships it without an
# update feed. A build made while the app is open waits in release/pending and
# posts a notification. The LaunchAgent com.0xcaso.t3code-custom-install runs
# --on-quit every 10 seconds: once you quit the app, it installs the pending
# build and opens it again. The three newest DMGs are kept.
#
# macOS keeps privacy permissions (disk access, folders, keychain) per code
# signature. An ad-hoc signature changes with every build, so each update
# asked for them again. Builds are signed with one self-signed certificate
# instead, kept in its own keychain so the nightly build never prompts.
set -euo pipefail

cd "$(dirname "$0")/.."
app="/Applications/T3 Code (Custom).app"
pending="release/pending/T3 Code (Custom).app"
signing_keychain="$HOME/Library/Keychains/t3code-custom-signing.keychain-db"
signing_password_file="$HOME/.config/t3code-custom/signing-keychain-password"
signing_identity="T3 Code (Custom) Signing"

setup_signing() {
  if [ -f "$signing_keychain" ]; then
    echo "signing keychain already exists: $signing_keychain"
    return 0
  fi
  local work password
  work="$(mktemp -d /tmp/t3-custom-signing.XXXX)"
  mkdir -p "$(dirname "$signing_password_file")"
  password="$(/usr/bin/openssl rand -hex 24)"
  (umask 077 && printf '%s' "$password" >"$signing_password_file")
  cat >"$work/cert.cnf" <<EOF
[req]
distinguished_name=dn
x509_extensions=ext
prompt=no
[dn]
CN=$signing_identity
[ext]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,codeSigning
EOF
  /usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 7300 -config "$work/cert.cnf" \
    -keyout "$work/key.pem" -out "$work/cert.pem" 2>/dev/null
  /usr/bin/openssl pkcs12 -export -inkey "$work/key.pem" -in "$work/cert.pem" \
    -out "$work/identity.p12" -passout "pass:$password"
  security create-keychain -p "$password" "$signing_keychain"
  security set-keychain-settings "$signing_keychain"
  security unlock-keychain -p "$password" "$signing_keychain"
  security import "$work/identity.p12" -k "$signing_keychain" -P "$password" -T /usr/bin/codesign >/dev/null
  # Lets codesign use the key without a keychain prompt.
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$signing_keychain" >/dev/null
  rm -rf "$work"
  echo "created $signing_identity in $signing_keychain"
}

sign_app() {
  if [ ! -f "$signing_keychain" ]; then
    echo "warning: no signing keychain, keeping the ad-hoc signature; run --setup-signing" >&2
    return 0
  fi
  security unlock-keychain -p "$(cat "$signing_password_file")" "$signing_keychain"
  # codesign only finds identities in keychains on the search list, so add ours
  # for the signing only; leaving a locked keychain there can prompt other apps.
  local original=()
  while IFS= read -r keychain; do
    keychain="${keychain#"${keychain%%[![:space:]]*}"}"
    original+=("${keychain//\"/}")
  done < <(security list-keychains -d user)
  security list-keychains -d user -s "${original[@]}" "$signing_keychain"
  local status=0
  codesign --force --deep --keychain "$signing_keychain" --sign "$signing_identity" "$1" || status=$?
  security list-keychains -d user -s "${original[@]}"
  security lock-keychain "$signing_keychain"
  return "$status"
}

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
  --setup-signing)
    setup_signing
    # Sign a build that is already waiting; the rename keeps the LaunchAgent off it meanwhile.
    if [ -d "$pending" ] && mv "$pending" "release/signing.$$" 2>/dev/null; then
      sign_app "release/signing.$$"
      mv "release/signing.$$" "$pending"
      echo "signed the pending build"
    fi
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

# vite-plus pnpm first: an older nvm Node can shadow it with a corepack pnpm that fails.
export PATH="$PWD/node_modules/.bin:$HOME/.local/share/vite-plus/fallback-bin:$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
# Stale C++ headers in the Command Line Tools break node-pty; use the SDK's.
export CPLUS_INCLUDE_PATH="$(xcrun --show-sdk-path)/usr/include/c++/v1"
# sysinfo needs rustc 1.95; the default stable toolchain here is older.
RUSTUP_TOOLCHAIN=1.95.0 T3CODE_DESKTOP_VERSION="$version" vp run dist:desktop:dmg:arm64
# The web build rewrites the generated route tree; keep the committed one so the
# nightly sync finds a clean tree.
git checkout -- apps/web/src/routeTree.gen.ts

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
sign_app "$staging"
rm -rf "$pending"
mkdir -p "$(dirname "$pending")"
mv "$staging" "$pending"

if ! install_pending; then
  /usr/bin/osascript -e "display notification \"Versione $version pronta: chiudi l'app (Cmd+Q) per installarla, poi si riapre da sola.\" with title \"T3 Code (Custom)\""
fi
