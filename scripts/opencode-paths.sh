#!/usr/bin/env bash
# Shared resolution for the active OpenCode global config directory.
# Source this file; it defines resolve_global_config_dir.

resolve_global_config_dir() {
  if [ -n "${OPENCODE_GLOBAL_CONFIG_DIR:-}" ]; then
    printf '%s\n' "$OPENCODE_GLOBAL_CONFIG_DIR"
    return 0
  fi
  if [ -n "${OPENCODE_V2_CONFIG_DIR:-}" ]; then
    printf '%s\n' "$OPENCODE_V2_CONFIG_DIR"
    return 0
  fi
  if [ -n "${OPENCODE_V2_PILOT_DIR:-}" ]; then
    printf '%s\n' "$OPENCODE_V2_PILOT_DIR/config"
    return 0
  fi
  local config_dir=""
  config_dir="$(opencode debug paths 2>/dev/null | sed -n 's/^config[[:space:]]*//p' | head -n 1 || true)"
  printf '%s\n' "${config_dir:-$HOME/.opencode-v2-pilot/config}"
}
