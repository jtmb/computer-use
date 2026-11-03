#!/usr/bin/env bash
# Create one zip plus a SHA-256 sidecar and a short README index.
set -euo pipefail

OUTPUT=""
FILES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output|-o) OUTPUT="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: package-deliverables.sh --output out.zip file1 [file2 ...]"
      exit 0 ;;
    *) FILES+=("$1"); shift ;;
  esac
done
if [[ -z "$OUTPUT" || ${#FILES[@]} -eq 0 ]]; then
  echo "Need --output and at least one file." >&2
  exit 2
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
{
  echo "Deliverables"
  echo
  for f in "${FILES[@]}"; do
    echo "- $(basename "$f")"
  done
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$TMPDIR/README.txt"

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT" "${OUTPUT}.sha256"
( cd "$(dirname "$0")" >/dev/null 2>&1 || true )
zip -q -j "$OUTPUT" "${FILES[@]}" "$TMPDIR/README.txt"
sha256sum "$OUTPUT" > "${OUTPUT}.sha256"
echo "Wrote $OUTPUT"
echo "Wrote ${OUTPUT}.sha256"
