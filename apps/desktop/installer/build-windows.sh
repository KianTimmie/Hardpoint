#!/usr/bin/env bash
# Cross-compile Hardpoint for Windows on Linux and build a per-user NSIS installer.
# Needs: mingw-w64 (gcc-mingw-w64-x86-64), nsis, and the x86_64-pc-windows-gnu Rust target.
# The official Windows build is the Release workflow; this is for building without Windows.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VERSION="$(node -p "require('$ROOT/apps/desktop/src-tauri/tauri.conf.json').version")"
export CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc

(cd "$ROOT/apps/desktop" && npm run build)
cargo build --manifest-path "$ROOT/Cargo.toml" --release --target x86_64-pc-windows-gnu \
  -p hardpoint-desktop -p hardpoint-cli --features hardpoint-desktop/custom-protocol

REL="$ROOT/target/x86_64-pc-windows-gnu/release"
OUT="$ROOT/target/windows-installer"
STAGE="$OUT/stage"
rm -rf "$STAGE" && mkdir -p "$STAGE"
x86_64-w64-mingw32-strip -o "$STAGE/Hardpoint.exe" "$REL/hardpoint-desktop.exe"
x86_64-w64-mingw32-strip -o "$STAGE/hardpoint-cli.exe" "$REL/hardpoint.exe"
cp "$REL/WebView2Loader.dll" "$STAGE/"
cp "$ROOT/apps/desktop/src-tauri/icons/icon.ico" "$STAGE/"
cat > "$STAGE/README.txt" <<TXT
Hardpoint $VERSION - mod manager for DCS World

Hardpoint.exe       the desktop app
hardpoint-cli.exe   command-line tool (same engine; run "hardpoint-cli --help")

Your library, backups and settings are in %APPDATA%\\hardpoint\\Hardpoint\\data.
Uninstalling the app keeps them. Disable your mods in the app first if you want
DCS put back exactly as it was.
TXT
makensis -V2 -DVERSION="$VERSION" -DSRC="$STAGE" -DOUT="$OUT/Hardpoint_${VERSION}_x64-setup.exe" \
  "$ROOT/apps/desktop/installer/hardpoint.nsi"
ls -la "$OUT"/*.exe
