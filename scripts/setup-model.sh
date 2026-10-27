#!/usr/bin/env bash
# Guided model setup for this repository's tracked global OpenCode config.
# Dry-run is the default; --apply writes the change and deploys it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$ROOT/global/opencode.jsonc"
MODEL=""
APPLY=0
DEPLOY=1
LIST=0
ALLOW_UNKNOWN=0

usage() {
  cat <<'EOF'
Usage: setup-model.sh [--model provider/model] [--list] [--apply]
                      [--config FILE] [--no-deploy] [--allow-unknown]

Without --model, lists the available models and prompts for a selection.
Dry-run is the default; --apply writes the tracked global config and deploys it.
Comments and nested agent models are handled; only the top-level model changes.

Options:
  --model ID       Set this model ID (for example deepseek/deepseek-flash)
  --list           List numbered available models and exit
  --apply          Write the selection and deploy the global opencode.jsonc
  --config FILE    Edit FILE instead of global/opencode.jsonc
  --no-deploy      Write the file but do not run deploy-global-config.sh
  --allow-unknown  Accept a model ID that `opencode models` does not list
  -h, --help       Show this help
EOF
}

fail() {
  printf 'setup-model: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --model)
      [ "$#" -ge 2 ] || fail "--model requires an ID"
      MODEL="$2"
      shift 2
      ;;
    --model=*)
      MODEL="${1#*=}"
      shift
      ;;
    --list) LIST=1; shift ;;
    --apply) APPLY=1; shift ;;
    --config)
      [ "$#" -ge 2 ] || fail "--config requires a file"
      CONFIG="$2"
      shift 2
      ;;
    --config=*)
      CONFIG="${1#*=}"
      shift
      ;;
    --no-deploy) DEPLOY=0; shift ;;
    --allow-unknown) ALLOW_UNKNOWN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

command -v opencode >/dev/null 2>&1 || fail "opencode is not on PATH"
[ -f "$CONFIG" ] || fail "config file not found: $CONFIG"

CONFIG="$(cd "$(dirname "$CONFIG")" && pwd)/$(basename "$CONFIG")"
MODELS_FILE="$(mktemp)"
trap 'rm -f "$MODELS_FILE"' EXIT

if ! opencode models >"$MODELS_FILE" 2>/dev/null; then
  fail "could not list models; is the OpenCode service healthy?"
fi
[ -s "$MODELS_FILE" ] || fail "opencode models returned no models"

current_model() {
  python3 "$ROOT/scripts/jsonc_model.py" get "$1" 2>/dev/null || true
}

CURRENT="$(current_model "$CONFIG")"

if [ "$LIST" -eq 1 ]; then
  nl -ba -w3 -s'. ' "$MODELS_FILE"
  exit 0
fi

if [ -z "$MODEL" ]; then
  [ -t 0 ] || fail "no --model given and stdin is not interactive"
  printf 'Current model: %s\n\n' "${CURRENT:-<none>}"
  nl -ba -w3 -s'. ' "$MODELS_FILE"
  printf '\nSelect a number, or enter provider/model [%s]: ' "${CURRENT:-none}"
  read -r answer
  answer="${answer:-$CURRENT}"
  [ -n "$answer" ] || fail "no model selected"
  case "$answer" in
    *[!0-9]*)
      MODEL="$answer"
      ;;
    *)
      MODEL="$(sed -n "${answer}p" "$MODELS_FILE")"
      [ -n "$MODEL" ] || fail "selection $answer is out of range"
      ;;
  esac
fi

if [ "$ALLOW_UNKNOWN" -eq 0 ] && ! grep -Fxq -- "$MODEL" "$MODELS_FILE"; then
  fail "model '$MODEL' is not listed by 'opencode models' (use --allow-unknown to force)"
fi

printf 'config=%s\n' "$CONFIG"
printf 'model=%s\n' "$MODEL"
[ -n "$CURRENT" ] && printf 'previous=%s\n' "$CURRENT"

if [ "$APPLY" -eq 0 ]; then
  printf 'setup-model: dry run only; rerun with --apply to write\n'
  exit 0
fi

python3 "$ROOT/scripts/jsonc_model.py" set "$CONFIG" "$MODEL"

if [ "$DEPLOY" -eq 1 ] && [ "$CONFIG" = "$ROOT/global/opencode.jsonc" ]; then
  "$ROOT/scripts/deploy-global-config.sh" --apply --only opencode.jsonc
else
  printf 'setup-model: deploy skipped; run scripts/deploy-global-config.sh --apply when ready\n'
fi

printf 'setup-model: done. Restart the OpenCode service from the TUI (Ctrl+P, service.restart).\n'
