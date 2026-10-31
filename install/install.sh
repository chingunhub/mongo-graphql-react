#!/bin/bash
# Forge Academy installer for Mac. `npm run release` stamps the versions and hashes in below.
# Needs no admin rights and is safe to run twice. Running it again updates, after backing up progress.
# FORGE_RELEASE: where the release lives, a URL or a folder. FORGE_HOME: where to install.
# Everything is inside main, so a download cut off halfway runs nothing. macOS ships bash 3.2, so nothing newer here.
set -euo pipefail

# __PINS__

step() { printf '\033[33m==> %s\033[0m\n' "$1"; }
die() { printf 'Forge Academy: %s\n' "$1" >&2; exit 1; }

sha256_of() { shasum -a 256 "$1" | cut -d ' ' -f 1; }

# Keeps a partial download in a .part file, so a dropped connection resumes when the line is run again.
fetch() {
  local source=$1 path=$2 sha256=$3 part="$2.part" code=0
  if [ -f "$path" ] && [ "$(sha256_of "$path")" = "$sha256" ]; then return; fi
  rm -f "$path"
  if [ -f "$source" ]; then cp "$source" "$part"
  else
    curl -#fL --retry 3 --retry-delay 2 -C - -o "$part" "$source" || code=$?
    # 33: this server can't resume, so the next run has to start from nothing.
    if [ "$code" = 33 ]; then rm -f "$part"; fi
    [ "$code" = 0 ] || die "Couldn't download $source. Check your connection and run the line again."
  fi
  if [ "$(sha256_of "$part")" != "$sha256" ]; then
    rm -f "$part"
    die "The download of $(basename "$path") didn't match its checksum, so it was deleted. Run the line again."
  fi
  mv -f "$part" "$path"
}

make_app() {
  local bundle="$HOME/Applications/Forge Academy.app"
  rm -rf "$bundle"
  mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
  cp "$FORGE_ROOT/app/assets/forge.icns" "$bundle/Contents/Resources/forge.icns"
  cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Forge Academy</string>
  <key>CFBundleIdentifier</key><string>academy.forge.launcher</string>
  <key>CFBundleExecutable</key><string>Forge Academy</string>
  <key>CFBundleIconFile</key><string>forge</string>
  <key>CFBundlePackageType</key><string>APPL</string>
</dict>
</plist>
PLIST
  printf '#!/bin/bash\nexec "%s" "%s"\n' "$FORGE_ROOT/runtime/node/bin/node" "$FORGE_ROOT/app/scripts/app.mjs" \
    > "$bundle/Contents/MacOS/Forge Academy"
  chmod +x "$bundle/Contents/MacOS/Forge Academy"
  ln -sfn "$bundle" "$HOME/Desktop/Forge Academy.app"
}

main() {
  [ "$(uname -s)" = Darwin ] || die "this installer is for Mac. On Windows, use the PowerShell line."
  PATH="$PATH:/usr/sbin:/sbin"

  # A Terminal under Rosetta reports x86_64, so ask the hardware.
  local node_url=$NODE_X64_URL node_sha=$NODE_X64_SHA256 mongo_url=$MONGO_X64_URL mongo_sha=$MONGO_X64_SHA256
  if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then
    node_url=$NODE_ARM64_URL node_sha=$NODE_ARM64_SHA256
    mongo_url=$MONGO_ARM64_URL mongo_sha=$MONGO_ARM64_SHA256
  fi

  FORGE_ROOT=${FORGE_HOME:-"$HOME/Library/Application Support/ForgeAcademy"}
  local release=${FORGE_RELEASE:-$RELEASE_URL}
  local runtime="$FORGE_ROOT/runtime" app="$FORGE_ROOT/app" data="$FORGE_ROOT/data" downloads="$FORGE_ROOT/downloads"
  local node="$runtime/node/bin/node" mongod="$runtime/mongodb/bin/mongod"

  [ -n "$release" ] || die "this installer has no release address. Set FORGE_RELEASE."
  mkdir -p "$runtime" "$data" "$downloads"
  local free_kb
  free_kb=$(df -k "$FORGE_ROOT" | awk 'NR==2 {print $4}')
  [ "$free_kb" -ge 2097152 ] || die "Forge Academy needs 2 GB of free space, and this disk has $((free_kb / 1048576)) GB."

  if [ -f "$app/scripts/app.mjs" ] && [ -x "$node" ]; then
    step "Closing the running copy"
    "$node" "$app/scripts/app.mjs" stop || true
    sleep 3
  fi

  if ! { [ -x "$node" ] && [ "$("$node" --version)" = "v$NODE_VERSION" ]; }; then
    step "Downloading Node $NODE_VERSION"
    fetch "$node_url" "$downloads/node.tar.gz" "$node_sha"
    rm -rf "$runtime/node"
    mkdir -p "$runtime/node"
    tar -xzf "$downloads/node.tar.gz" -C "$runtime/node" --strip-components=1 || die "Couldn't unpack Node."
    rm -f "$downloads/node.tar.gz"
  fi

  if ! { [ -f "$runtime/mongodb/version.txt" ] && [ "$(cat "$runtime/mongodb/version.txt")" = "$MONGO_VERSION" ]; }; then
    step "Downloading MongoDB $MONGO_VERSION"
    fetch "$mongo_url" "$downloads/mongodb.tgz" "$mongo_sha"
    local unpacked="$downloads/mongodb-unpacked"
    rm -rf "$unpacked"
    mkdir -p "$unpacked" "$(dirname "$mongod")"
    tar -xzf "$downloads/mongodb.tgz" -C "$unpacked" --strip-components=1 || die "Couldn't unpack MongoDB."
    mv -f "$unpacked/bin/mongod" "$mongod"
    "$mongod" --version > /dev/null || die "MongoDB would not run on this version of macOS."
    printf '%s\n' "$MONGO_VERSION" > "$runtime/mongodb/version.txt"
    rm -rf "$unpacked" "$downloads/mongodb.tgz"
  fi

  step "Downloading Forge Academy $APP_VERSION"
  local package="$downloads/$APP_FILE"
  fetch "$release/$APP_FILE" "$package" "$APP_SHA256"
  local stage="$FORGE_ROOT/app.new"
  rm -rf "$stage"
  mkdir -p "$stage"
  tar -xzf "$package" -C "$stage" --strip-components=1 || die "Couldn't unpack Forge Academy."

  # A failed release must never reach the student's working copy, so this all happens in the new folder.
  step "Installing packages"
  (cd "$stage" && PATH="$runtime/node/bin:$PATH" "$runtime/node/bin/npm" ci --omit=dev --no-audit --no-fund --loglevel=error) ||
    die "Couldn't install packages. Check your connection and run the line again."

  if [ -f "$data/progress.json" ]; then
    mkdir -p "$data/backups"
    cp "$data/progress.json" "$data/backups/progress-$(date +%Y%m%d-%H%M%S).json"
  fi

  rm -rf "$FORGE_ROOT/app.old"
  if [ -d "$app" ]; then mv "$app" "$FORGE_ROOT/app.old"; fi
  mv "$stage" "$app"
  rm -rf "$FORGE_ROOT/app.old"

  if [ -z "${FORGE_NO_ICON:-}" ]; then
    step "Adding the app icon"
    make_app
  fi

  step "Opening Forge Academy"
  if [ -n "${FORGE_NO_OPEN:-}" ]; then "$node" "$app/scripts/app.mjs" --no-open
  else "$node" "$app/scripts/app.mjs"
  fi
  printf '\033[32mDone. Forge Academy is on your desktop, and installed in %s\033[0m\n' "$FORGE_ROOT"
}

main
