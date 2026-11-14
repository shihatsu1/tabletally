#!/bin/zsh
# Run npm on the APFS image instead of the exFAT drive (1 MB blocks would balloon node_modules, and
# npm replaces a node_modules symlink with a real folder). Usage: zsh tools/npm-install.sh [npm install args]
# Example: zsh tools/npm-install.sh -D vitest@latest
set -e
proj="$(cd "$(dirname "$0")/.." && pwd)"
img=/Volumes/TT-Toolchain/app
[ -d /Volumes/TT-Toolchain ] || zsh "$proj/tools/mount-images.sh"
mkdir -p "$img"
cp "$proj/package.json" "$img/package.json"
[ -f "$proj/package-lock.json" ] && cp "$proj/package-lock.json" "$img/package-lock.json"
(cd "$img" && npm install "$@")
cp "$img/package.json" "$proj/package.json"
cp "$img/package-lock.json" "$proj/package-lock.json"
if [ -d "$proj/node_modules" ] && [ ! -L "$proj/node_modules" ]; then
  rm -rf "$proj/node_modules"
fi
[ -L "$proj/node_modules" ] || ln -s "$img/node_modules" "$proj/node_modules"
echo "node_modules -> $(readlink "$proj/node_modules")"
