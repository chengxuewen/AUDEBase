#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"


export PATH="$HOME/.pixi/bin:$PATH"
eval "$(pixi shell-hook --manifest-path "${PROJECT_ROOT}/pixi.toml")"
