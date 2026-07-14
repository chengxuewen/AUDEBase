#!/usr/bin/env bash
# bootstrap.sh — AUDEBase development environment entry point
# Sources: source bootstrap.sh
# One command to get a fully functional development environment

set -euo pipefail

# Resolve script directory (symlink-safe)
SCRIPT_DIR_REAL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
source "${SCRIPT_DIR_REAL}/scripts/_common.sh"

echo "=== AUDEBase Bootstrap ==="

# Step 1: Install/update pixi and project dependencies
bash "${SCRIPT_DIR}/scripts/pixi-init.sh" || {
    echo "ERROR: pixi-init.sh failed" >&2
    exit 1
}

# Step 2: Activate pixi environment shell hook
source "${SCRIPT_DIR}/pixi.sh"

echo "=== AUDEBase environment ready ==="
echo "Run 'pixi run --help' to see available tasks"
