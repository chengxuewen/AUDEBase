#!/usr/bin/env bash
# pixi-init.sh — Initialize pixi and project dependencies
# Sources: runs a minimal pixi bootstrap without pack/unpack tools
set -euo pipefail

# Resolve script directory
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

arg_root_dir="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
while [ $# -gt 0 ]; do
    case "$1" in
        --root-dir)
            if [ -n "$2" ]; then
                mkdir -p "$2"
                arg_root_dir="$(cd "$2" && pwd -P)" || { echo "ERROR: Cannot enter directory: $2" >&2; exit 1; }
                shift 2
            else
                echo "ERROR: Invalid root dir." >&2
                exit 1
            fi
            ;;
        *)
            echo "ERROR: Unknown parameter $1" >&2
            exit 1
            ;;
    esac
done
PIXI_VERSION="0.67.2"

# Guard against missing HOME in minimal environments (Docker, CI)
if [ -z "${HOME:-}" ]; then
    echo "ERROR: HOME is not set" >&2
    exit 1
fi
export PATH="${HOME}/.pixi/bin:$PATH"
NEED_INSTALL=false

if command -v pixi >/dev/null 2>&1; then
    # Use awk to parse version — macOS grep lacks -P (Perl regex)
    CURRENT_PIXI_VERSION=$(pixi --version 2>/dev/null | awk '{print $2}' || echo "unknown")
    if [ "${CURRENT_PIXI_VERSION}" = "${PIXI_VERSION}" ]; then
        echo "[INFO] pixi ${PIXI_VERSION} is already installed"
    else
        echo "[INFO] pixi version mismatch (installed: ${CURRENT_PIXI_VERSION:-unknown}, required: ${PIXI_VERSION}), reinstalling..."
        NEED_INSTALL=true
    fi
else
    echo "[INFO] pixi not installed, installing pixi ${PIXI_VERSION}..."
    NEED_INSTALL=true
fi

if [ "${NEED_INSTALL}" = "true" ]; then
    # Use Gitee mirror for faster download in mainland China
    # Override with: PIXI_REPOURL=https://github.com/pixi.sh/pixi bash pixi-init.sh
    export PIXI_REPOURL="${PIXI_REPOURL:-https://gitee.com/chengxuewen-github/pixi}"
    bash "${SCRIPT_DIR}/pixi-install.sh"
    export PATH="$HOME/.pixi/bin:$PATH"
fi

# Install project dependencies
export PIXI_CACHE_DIR="${arg_root_dir}/.pixi-cache"
cd "${arg_root_dir}" || { echo "Unable to enter directory: ${arg_root_dir}" >&2; exit 1; }

echo "[INFO] Installing pixi project dependencies..."
pixi install || {
    echo "[INFO] Lock file may be stale, updating..."
    pixi lock
    pixi install || { echo "ERROR: pixi install failed after lock update" >&2; exit 1; }
}

# Install pixi-pack for deployment packaging (includes pixi-unpack)
if command -v pixi-pack >/dev/null 2>&1; then
    echo "[INFO] pixi-pack is already installed"
else
    echo "[INFO] Installing pixi-pack (includes pixi-unpack)..."
    pixi global install pixi-pack || { echo "WARNING: pixi-pack install failed — deploy scripts may not work" >&2; }
fi

echo "[INFO] pixi init complete"
