#!/usr/bin/env bash
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

export PATH="$HOME/.pixi/bin:$PATH"

# Check pixi is installed before attempting shell-hook
if ! command -v pixi &>/dev/null; then
  echo "ERROR: pixi not found. Install from https://pixi.sh/latest"
  return 1 2>/dev/null || exit 1
fi

# Activate pixi environment — must not crash terminal on failure
HOOK_OUTPUT="$(pixi shell-hook --manifest-path "${PROJECT_ROOT}/pixi.toml" 2>&1)" || {
  echo "ERROR: pixi shell-hook failed:"
  echo "$HOOK_OUTPUT"
  return 1 2>/dev/null || exit 1
}
eval "$HOOK_OUTPUT"
