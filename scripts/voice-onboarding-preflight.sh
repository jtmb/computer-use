#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VOICE="$ROOT/voice-assistant"
case "${1:---check}" in
  --check) VERIFY_MODELS=0 ;;
  --verify-models) VERIFY_MODELS=1 ;;
  *) echo 'Usage: voice-onboarding-preflight.sh [--check|--verify-models]' >&2; exit 2 ;;
esac
fail() {
  echo "voice onboarding: $*; first run voice-assistant/setup.sh --with-streaming" >&2
  exit 1
}
[[ -f "$VOICE/package.json" ]] || fail 'pinned voice submodule is not initialized'
[[ -f "$VOICE/node_modules/jsonc-parser/package.json" ]] || fail 'voice JavaScript dependencies are missing'
[[ -x "$VOICE/.venv/bin/python" ]] || fail 'voice Python environment is missing'
for binary in bwrap pw-cli pw-cat pw-dump; do
  command -v "$binary" >/dev/null || fail "required executable missing: $binary"
done
if [[ "$VERIFY_MODELS" -eq 1 ]]; then
  MODEL_PATH="$(PYTHONDONTWRITEBYTECODE=1 "$VOICE/.venv/bin/python" - "$VOICE" <<'PY'
from pathlib import Path
import sys
sys.path.insert(0, sys.argv[1])
from audio.models import STREAMING_NAME
print(Path(sys.argv[1]) / "models" / STREAMING_NAME)
PY
)"
  # The owned smoke entrypoint unshares the network and this option never opens
  # microphone/speaker devices. Do not suppress failures or bypass its sandbox.
  /usr/bin/env -u OPENCODE_VOICE_OFFLINE "$VOICE/.venv/bin/python" "$VOICE/scripts/audio_smoke.py" --recognition-only --recognizer-backend sherpa --recognizer-model "$MODEL_PATH"
  echo 'voice dependencies/models verified; physical audio acceptance remains separate'
else
  echo 'static voice prerequisites present; models not loaded (--check)'
fi
