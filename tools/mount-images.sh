#!/bin/zsh
# Opens the APFS image that holds node_modules (see CLAUDE.md, Drive notes).
cd "$(dirname "$0")" && hdiutil attach toolchain.sparsebundle >/dev/null 2>&1
ls /Volumes/TT-Toolchain >/dev/null && echo "TT-Toolchain mounted"
