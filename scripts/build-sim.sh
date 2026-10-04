#!/usr/bin/env bash
# Build the development client for the iOS simulator.
#
# Expo's native build scripts break when the project path contains spaces or
# parentheses, so the native build runs from a mirrored copy in a plain path.
# Only needed when native dependencies or app.config.ts change; JavaScript is
# served by Metro from the real project folder (`npx expo start`).
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DEST="${LE_BUILD_DIR:-$HOME/.little-echoes-ios-build}"
DEVICE="${1:-iPhone 17 Pro}"

export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

mkdir -p "$DEST"
rsync -a --delete --exclude /ios --exclude /android --exclude /.expo --exclude /.git "$SRC/" "$DEST/"

cd "$DEST"
npx expo prebuild --platform ios
npx expo run:ios --device "$DEVICE" --no-bundler
