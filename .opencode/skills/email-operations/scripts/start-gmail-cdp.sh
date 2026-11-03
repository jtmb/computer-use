#!/usr/bin/env bash
# Launch a separate Chrome instance with a COPY of the user's profile and a CDP
# port for Gmail drafting. It never modifies the main profile and never sends.
set -euo pipefail

PORT=9222
SOURCE_PROFILE="${HOME}/.config/google-chrome"
PROFILE_DIR="/tmp/opencode/gmail-cdp-profile"
FRESH=0
CHROME=""

usage() {
  cat <<'USAGE'
Usage: start-gmail-cdp.sh [options]

  --port N              CDP port (default 9222)
  --source DIR          Chrome profile to copy (default ~/.config/google-chrome)
  --profile DIR         Temp profile directory (default /tmp/opencode/gmail-cdp-profile)
  --fresh               Recreate the temp profile copy
  --chrome PATH         Chrome binary (auto-detected by default)
  -h, --help            Show this help

Prints JSON: {"port":..., "profile":..., "pid":..., "reused":true|false}
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --source) SOURCE_PROFILE="$2"; shift 2 ;;
    --profile) PROFILE_DIR="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    --chrome) CHROME="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if curl -fsS "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  printf '{"port":%s,"profile":%s,"pid":null,"reused":true}\n' "$PORT" "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$PROFILE_DIR")"
  exit 0
fi

if [[ -z "$CHROME" ]]; then
  for candidate in google-chrome google-chrome-stable chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then CHROME="$(command -v "$candidate")"; break; fi
  done
fi
if [[ -z "$CHROME" ]]; then
  echo "No Chrome/Chromium binary found." >&2
  exit 1
fi
if [[ ! -d "$SOURCE_PROFILE/Default" ]]; then
  echo "Source profile not found: $SOURCE_PROFILE/Default" >&2
  exit 1
fi

if [[ "$FRESH" -eq 1 ]]; then
  rm -rf "$PROFILE_DIR"
fi
mkdir -p "$PROFILE_DIR"

# Copy only the profile state needed for the session. Caches are excluded.
rsync -a \
  --exclude 'Cache' --exclude 'Code Cache' --exclude 'GPUCache' \
  --exclude 'DawnCache' --exclude 'ShaderCache' --exclude 'Service Worker' \
  --exclude 'Session Storage' \
  "$SOURCE_PROFILE/Default" "$PROFILE_DIR/"
if [[ -f "$SOURCE_PROFILE/Local State" ]]; then
  cp "$SOURCE_PROFILE/Local State" "$PROFILE_DIR/Local State"
fi

nohup "$CHROME" \
  --user-data-dir="$PROFILE_DIR" \
  --profile-directory=Default \
  --remote-debugging-port="$PORT" \
  --remote-allow-origins='*' \
  --no-first-run --no-default-browser-check \
  --disable-sync --disable-background-networking --disable-gpu \
  >/tmp/opencode/gmail-cdp.log 2>&1 &
PID=$!

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    printf '{"port":%s,"profile":%s,"pid":%s,"reused":false}\n' \
      "$PORT" "$(python3 -c 'import json,sys;print(json.dumps(sys.argv[1]))' "$PROFILE_DIR")" "$PID"
    exit 0
  fi
  sleep 0.5
done

echo "Chrome did not expose CDP on port $PORT. See /tmp/opencode/gmail-cdp.log" >&2
exit 1
