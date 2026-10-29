#!/usr/bin/env bash
# Run the model-index maintenance CLI from an isolated pinned-Python venv.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${GO_MODEL_INDEX_VENV:-${XDG_DATA_HOME:-$HOME/.local/share}/computer-use/venv-go-model-index}"

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install --disable-pip-version-check -q \
    -r "$ROOT/requirements-go-model-index.txt"
fi

exec "$VENV/bin/python" "$ROOT/scripts/go-model-index-maintain.py" "$@"
