#!/usr/bin/env bash
# scripts/_common.sh — shared shell utilities for AUDEBase bootstrap
# Source this in project scripts to get SCRIPT_DIR and PROJECT_ROOT

set -euo pipefail

# Guard against double-sourcing (pixi.sh sources pixi-shell.sh which sources _common.sh)
[ -n "${_COMMON_SH_LOADED:-}" ] && return 0
_COMMON_SH_LOADED=true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd -P)"
if [ -f "${SCRIPT_DIR}/pixi.toml" ]; then
    PROJECT_ROOT="$SCRIPT_DIR"
else
    PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
fi
