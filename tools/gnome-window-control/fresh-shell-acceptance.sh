#!/usr/bin/env bash
# Fresh-Shell desktop acceptance.
#
# A running GNOME Shell caches extension modules by URL, so changed extension code is
# never re-read in a live process, and `gnome-extensions disable/enable` does not help
# (proven on GNOME 50.1: `ReloadExtension` is declared but not implemented). This starts
# a private headless Shell, stages the DEPLOYED extension there, and drives the bridge:
# inventory, a real PNG capture, an observation-bound click over one sender, a launch
# attempt, and the stale-target/size-bound refusals.
#
# Safety: the script re-executes itself under `dbus-run-session`, so it can never inherit
# the operator's session bus and can never drive the live Shell. It uses a unique scratch
# directory and requests cleanup of its tracked children. Evidence is retained.
# This is not an OS sandbox or proof that every descendant has stopped.
#
#   tools/gnome-window-control/fresh-shell-acceptance.sh [--debug]
#
#   --debug  load a scratch copy of the sources with one log line in the extension's
#            error mapper, so a refusal shows its real stack. The deployed artifact is
#            never modified. With --debug the script also requires that the expected
#            refusal stack appears, so a silent failure cannot pass.
#
# Exit 0 when all checks pass; 1 on failure; 2 on missing prerequisites/bad usage;
# 3 when the real-seat workflow remains incomplete.

set -u

finish_private_run() {
  if [ "$FAILED" -ne 0 ]; then
    log "one or more fresh-Shell checks failed"; return 1
  fi
  if [ "$INCOMPLETE" -ne 0 ]; then
    log "fresh-Shell checks have an incomplete workflow (no seat for the keystroke)"; return 3
  fi
  log "fresh-Shell checks passed"; return 0
}

start_owned() {
  local label="$1" output="$2"
  shift 2
  OWNED_JOB=$(mktemp -d "$BASE/process-$label.XXXXXX") || return 1
  OWNED_JOBS+=("$OWNED_JOB")
  python3 -B "$REPO/tools/gnome-window-control/owned-process.py" run \
    --job-dir "$OWNED_JOB" --timeout-seconds 1800 -- "$@" >"$output" 2>&1 &
  OWNED_PID=$!
  OWNED_PIDS+=("$OWNED_PID")
  python3 -B "$REPO/tools/gnome-window-control/owned-process.py" ready \
    --job-dir "$OWNED_JOB" --timeout-seconds 5
}

stop_owned_job() {
  local job="$1"
  mkdir -- "$job/stop.request" 2>/dev/null || { [ -d "$job/stop.request" ] && [ ! -L "$job/stop.request" ]; }
}

stop_owned_target() {
  local target="$1" job
  case "$target" in ''|*[!0-9]*) return 1 ;; esac
  for job in "${OWNED_JOBS[@]}"; do
    if python3 -B "$REPO/tools/gnome-window-control/owned-process.py" matches --job-dir "$job" --pid "$target"; then
      stop_owned_job "$job"
      return $?
    fi
  done
  return 1
}

run_private() {
SCRIPT="$1"
shift
REPO=$(cd "$(dirname "$SCRIPT")/../.." && pwd)
CLIENT="$REPO/scripts/desktop-windows.py"
UUID="opencode-window-control@computer-use.local"
DISPLAY_NAME="wayland-freshshell"
DEBUG=0
for argument in "$@"; do
  case "$argument" in
    --debug) DEBUG=1 ;;
    --keep) : ;;  # accepted for backwards compatibility; evidence is always retained
    *) echo "usage: $0 [--debug]" >&2; exit 2 ;;
  esac
done

SCRATCH_ROOT="${TMPDIR:-/tmp/opencode}"
mkdir -p "$SCRATCH_ROOT" || exit 2
BASE=$(mktemp -d "$SCRATCH_ROOT/ocwc-fresh-shell.XXXXXX") || exit 2
chmod 700 "$BASE"
LOG="$BASE/result.log"
# Match this run's documents by unique scratch-dir name: GNOME Text Editor restores the
# previous session's documents, so a fixed filename would match a window from an earlier
# run and the checks would silently exercise the wrong window.
TAG=$(basename "$BASE")
mkdir -p "$BASE/editor-config" "$BASE/editor-state"
FAILED=0
INCOMPLETE=0
OWNED_JOBS=()
OWNED_PIDS=()

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG"; }
fail() { log "FAIL $*"; FAILED=1; }
run_py() {  # run a python helper and fold its exit status into FAILED
  local status
  python3 "$@" 2>&1 | tee -a "$LOG"
  status=${PIPESTATUS[0]}
  [ "$status" -ne 0 ] && FAILED=1
  return 0
}
cleanup() {
  local result=$? job pid
  trap - EXIT
  for job in "${OWNED_JOBS[@]}"; do stop_owned_job "$job" || result=1; done
  # These are our direct supervisor children, waited for rather than signaled by PID.
  for pid in "${OWNED_PIDS[@]}"; do wait "$pid" || result=1; done
  printf 'fresh-Shell evidence retained: %s\n' "$BASE"
  exit "$result"
}
trap cleanup EXIT

export XDG_RUNTIME_DIR="$BASE/xdg"
DEPLOYED="$HOME/.local/share/gnome-shell/extensions/$UUID"
STAGED="$BASE/data/gnome-shell/extensions/$UUID"
mkdir -p "$STAGED" "$BASE/home" "$BASE/config" "$BASE/state" "$BASE/cache"
if [ -L "$DEPLOYED" ]; then
  fail "deployed extension directory is a symlink"; exit 2
fi
# Stage only this extension, never expose the operator's writable extension tree.
for name in metadata.json extension.js policy.mjs capture.mjs input.mjs launch.mjs runtime-contract.mjs; do
  if [ ! -f "$DEPLOYED/$name" ] || [ -L "$DEPLOYED/$name" ]; then
    fail "deployed extension member is missing/nonregular/linked: $name"; exit 2
  fi
  cp -- "$DEPLOYED/$name" "$STAGED/$name" || exit 2
  cmp -- "$DEPLOYED/$name" "$STAGED/$name" || exit 2
done
export HOME="$BASE/home"
export XDG_DATA_HOME="$BASE/data"
export XDG_CONFIG_HOME="$BASE/config"
export XDG_STATE_HOME="$BASE/state"
export XDG_CACHE_HOME="$BASE/cache"
export XDG_DATA_DIRS="/usr/local/share:/usr/share"
export WAYLAND_DISPLAY="$DISPLAY_NAME"
mkdir -m 700 -p "$XDG_RUNTIME_DIR"
# The exports above deliberately override the agent runtime, which sets
# XDG_DATA_HOME=<pilot data dir>; honouring an inherited value hides the installed
# extension and the bridge never appears, which looks like a product failure.

if [ "$DEBUG" -eq 1 ]; then
  # Keep debug instrumentation in a separate scratch tree, never in deployed files.
  DEBUG_DATA="$BASE/debug-data"
  DEST="$DEBUG_DATA/gnome-shell/extensions/$UUID"
  case "$(realpath -m "$DEST")" in
    "$BASE"/*) ;;
    *) echo "refusing to instrument $DEST: outside $BASE" >&2; exit 2 ;;
  esac
  mkdir -p "$DEST" || exit 2
  for name in metadata.json extension.js policy.mjs capture.mjs input.mjs launch.mjs; do
    cp "$REPO/tools/gnome-window-control/$name" "$DEST/$name" || exit 2
  done
  cp "$REPO/tools/computer-use-runtime/src/runtime-contract.mjs" "$DEST/runtime-contract.mjs" || exit 2
  python3 - "$DEST/extension.js" <<'PY' || exit 2
import sys
path = sys.argv[1]
text = open(path).read()
anchor = """    _inputFailure(invocation, error) {
        invocation.return_dbus_error("""
replacement = """    _inputFailure(invocation, error) {
        console.error('[ocwc-debug] code=' + this._actionCode(error)
            + ' stack=' + String(error?.stack ?? error));
        invocation.return_dbus_error("""
if anchor not in text:
    print("instrumentation anchor missing; refusing to run --debug", file=sys.stderr)
    raise SystemExit(1)
open(path, "w").write(text.replace(anchor, replacement, 1))
PY
  export XDG_DATA_HOME="$DEBUG_DATA"
  log "debug: scratch copy with a logged error mapper (deployed artifact untouched)"
fi

# The bus daemon predates these exports; activated dconf/apps must get private
# homes too. Never use --systemd, which could alter the shared user manager.
dbus-update-activation-environment HOME XDG_RUNTIME_DIR XDG_DATA_HOME XDG_DATA_DIRS \
  XDG_CONFIG_HOME XDG_STATE_HOME XDG_CACHE_HOME WAYLAND_DISPLAY || exit 2
gsettings set org.gnome.shell enabled-extensions "['$UUID']" || exit 2
start_owned shell "$BASE/shell.log" gnome-shell --headless --virtual-monitor 1280x720 --wayland-display "$DISPLAY_NAME" || exit 1

for _ in $(seq 1 40); do
  sleep 1
  [ -S "$XDG_RUNTIME_DIR/$DISPLAY_NAME" ] && break
done
if [ ! -S "$XDG_RUNTIME_DIR/$DISPLAY_NAME" ]; then
  log "the headless Shell did not start; see $BASE/shell.log"
  exit 1
fi

owner=""
for _ in $(seq 1 30); do
  sleep 1
  owner=$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
    --method org.freedesktop.DBus.NameHasOwner \
    org.gnome.Shell.Extensions.OpenCodeWindowControl 2>/dev/null || true)
  case "$owner" in *true*) break;; esac
done
case "$owner" in
  *true*)
    if [ "$DEBUG" -eq 1 ]; then
      log "PASS the scratch copy loaded in a fresh Shell (deployed artifact untouched)"
    else
      log "PASS the deployed extension loaded in a fresh Shell"
    fi
    ;;
  *)
    fail "the bridge never appeared; is the extension enabled and deployed?"
    exit 1
    ;;
esac

gdbus introspect --session --dest org.gnome.Shell.Extensions.OpenCodeWindowControl \
  --object-path /org/gnome/Shell/Extensions/OpenCodeWindowControl \
  >"$BASE/introspect.txt" 2>&1
run_py - "$BASE/introspect.txt" <<'PY'
import re, sys
text = open(sys.argv[1]).read()
required = ["Abort", "Apply", "Begin", "Chunk", "ConfirmLaunch", "End", "GetState",
            "InputBegin", "InputClick", "InputDrag", "InputPressKey", "InputReleaseAll",
            "InputScroll", "InputTypeText", "Launch", "Preview"]
counts = {name: len(re.findall(rf"\b{name}\(", text)) for name in required}
missing = [name for name, count in counts.items() if count == 0]
duplicated = [name for name, count in counts.items() if count > 1]
if missing or duplicated:
    print("FAIL method set:", "missing", missing, "duplicated", duplicated)
    raise SystemExit(1)
print(f"PASS all {len(required)} reviewed methods present exactly once")
PY

# Two NORMAL windows: one target, one that keeps the desktop state valid after the target
# closes. The bridge lists only Meta.WindowType.NORMAL, so dialogs cannot be used here.
printf 'fresh shell acceptance target one\n' > "$BASE/target1.txt"
printf 'fresh shell acceptance target two\n' > "$BASE/target2.txt"
# The target is raised LAST so it holds focus: capture and input both require the target
# to be the focused window, and a window that steals focus makes a click refuse
# FOCUS_CHANGED — a correct refusal, but one that would test the harness, not the bridge.
# Editors also get private config AND state homes: GNOME Text Editor restores earlier
# documents from its state directory, and restoring the operator's real files into this
# private Shell would be an unwanted side effect.
start_owned editor2 "$BASE/editor2.log" env XDG_CONFIG_HOME="$BASE/editor-config" XDG_STATE_HOME="$BASE/editor-state" GDK_BACKEND=wayland gnome-text-editor --new-window "$BASE/target2.txt" || exit 1
# Wait for the second window before raising the target: launching both at once leaves focus
# on whichever mapped last, and a click then refuses FOCUS_CHANGED instead of reaching the
# input controller.
for _ in $(seq 1 20); do
  sleep 1
  timeout 20 python3 "$CLIENT" list >"$BASE/list.json" 2>&1 || true
  seen=$(python3 -c "
import json
windows = json.load(open('$BASE/list.json')).get('windows') or []
print(sum(1 for w in windows if '$TAG' in (w.get('title') or '') and 'target2' in (w.get('title') or '')))
" 2>/dev/null || echo 0)
  [ "${seen:-0}" -ge 1 ] && break
done
start_owned editor1 "$BASE/editor1.log" env XDG_CONFIG_HOME="$BASE/editor-config" XDG_STATE_HOME="$BASE/editor-state" GDK_BACKEND=wayland gnome-text-editor --new-window "$BASE/target1.txt" || exit 1

count=0
for _ in $(seq 1 30); do
  sleep 1
  timeout 20 python3 "$CLIENT" list >"$BASE/list.json" 2>&1 || true
  # Wait for the TARGET title, not merely any two windows: the editors briefly appear as
  # drafts, and a count-only wait makes the identity check flaky.
  count=$(python3 -c "
import json
windows = json.load(open('$BASE/list.json')).get('windows') or []
print(sum(1 for w in windows if '$TAG' in (w.get('title') or '') and 'target1' in (w.get('title') or '')))
" 2>/dev/null || echo 0)
  [ "${count:-0}" -ge 1 ] && break
done

TARGET_META=$(node --input-type=module - \
  "$REPO/.opencode/plugins/computer-use/acceptance-safety.mjs" "$BASE/list.json" "$TAG" \
  2>"$BASE/target-selection.err" <<'JS'
import { readFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"

const [modulePath, inventoryPath, runTag] = process.argv.slice(2)
const safety = await import(pathToFileURL(modulePath))
const inventory = safety.parseInventoryText(await readFile(inventoryPath, "utf8"))
const target = safety.selectUniqueRunTarget(inventory, runTag)
process.stdout.write(`${target.windowId}\t${target.appId}\n`)
JS
)
if [ -z "$TARGET_META" ]; then
  cat "$BASE/target-selection.err" | tee -a "$LOG"
  fail "could not select one exact window ID and app ID from this run's current inventory"
  exit 1
fi
IFS=$'\t' read -r WINDOW_ID TARGET_APP_ID <<< "$TARGET_META"
log "PASS current run uniquely selected $WINDOW_ID | $TARGET_APP_ID"
EPOCH="${WINDOW_ID%%:*}"

if [ -z "$WINDOW_ID" ]; then
  fail "no target window id, so capture cannot be exercised"
  exit 1
fi

# A live Shell can be mid-transition (a window still mapping, a stale dialog blocker), so
# retry briefly before calling a refusal a failure.
CAPTURE_STATUS=1
for attempt in 1 2 3; do
  timeout 40 python3 "$CLIENT" capture --request "{\"windowId\":\"$WINDOW_ID\"}" >"$BASE/capture.json" 2>&1
  CAPTURE_STATUS=$?
  [ "$CAPTURE_STATUS" -eq 0 ] && break
  sleep 2
done
run_py - "$BASE/capture.json" "$CAPTURE_STATUS" <<'PY'
import base64, hashlib, json, struct, sys
path, status = sys.argv[1], int(sys.argv[2])
if status != 0:
    print("FAIL capture command exited", status); raise SystemExit(1)
data = json.load(open(path))
if not data.get("ok"):
    print("FAIL capture refused:", data.get("error"), str(data.get("detail"))[:200]); raise SystemExit(1)
raw = base64.b64decode(data["pngBase64"])
if raw[:8] != b"\x89PNG\r\n\x1a\n":
    print("FAIL capture is not a PNG"); raise SystemExit(1)
width, height = struct.unpack(">II", raw[16:24])
observation = data.get("observationId")
if width < 200 or height < 200 or len(raw) < 1000 or not isinstance(observation, str) or not observation:
    print("FAIL capture implausible:", width, height, len(raw), bool(observation)); raise SystemExit(1)
print(f"PASS capture: {len(raw)} bytes, {width}x{height}, PNG signature, observationId present")
print("  sha256:", hashlib.sha256(raw).hexdigest()[:16])
PY

# Capture and input must share one D-Bus sender: observations are sender-bound, which is
# why the plugin keeps a persistent daemon. The helper is a file so quoting stays simple.
cat > "$BASE/daemon_check.py" <<'PY'
import json, subprocess, sys
window_id, client_path = sys.argv[1], sys.argv[2]
client = subprocess.Popen(["python3", client_path, "serve"],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
def send(request_id, command, request):
    client.stdin.write(json.dumps({"id": request_id, "command": command, "request": request}) + "\n")
    client.stdin.flush()
    return json.loads(client.stdout.readline())
failed = 0
try:
    captured = send(1, "capture", {"windowId": window_id})
    body = captured.get("result") if isinstance(captured.get("result"), dict) else captured
    if not body.get("ok") or not body.get("observationId"):
        print("FAIL daemon capture refused:", body.get("error"), str(body.get("detail"))[:160])
        raise SystemExit(1)
    print("PASS daemon capture over one sender:", bool(body.get("ok")), "observationId", bool(body.get("observationId")))
    focused = send(4, "list", {})
    focused = focused.get("result") if isinstance(focused.get("result"), dict) else focused
    if focused.get("focusedWindowId") != window_id:
        print("NOTE the target is not the focused window; click not attempted (target:",
              window_id, "focus:", focused.get("focusedWindowId"), ")")
        clicked = {}
    else:
        clicked = send(2, "input", {"observationId": body["observationId"], "action": "click", "x": 120, "y": 120})
    if not clicked:
        pass
    elif clicked.get("ok"):
        print("PASS observation-bound click dispatched")
    elif "INPUT_FAILED" in str(clicked.get("detail")):
        print("NOTE observation-bound click refused with INPUT_FAILED (headless backend has no seat)")
    else:
        print("FAIL click produced an unexpected refusal:", clicked.get("error"), str(clicked.get("detail"))[:160])
        failed = 1
    released = send(3, "release", {})
    if released.get("ok"):
        print("PASS release")
    else:
        print("FAIL release refused:", released.get("error"), str(released.get("detail"))[:160])
        failed = 1
finally:
    client.stdin.close()
    client.wait(timeout=10)
raise SystemExit(failed)
PY
timeout 90 python3 "$BASE/daemon_check.py" "$WINDOW_ID" "$CLIENT" >"$BASE/daemon.json" 2>&1
DAEMON_STATUS=$?
cat "$BASE/daemon.json" | tee -a "$LOG"
[ "$DAEMON_STATUS" -ne 0 ] && FAILED=1

# Bridge-protocol acceptance: ordering, replay, abort and release over one sender.
timeout 180 python3 "$REPO/tools/gnome-window-control/bridge-protocol-acceptance.py" \
  --window-id "$WINDOW_ID" --deadline >"$BASE/protocol.txt" 2>&1
PROTOCOL_STATUS=$?
cat "$BASE/protocol.txt" | tee -a "$LOG"
[ "$PROTOCOL_STATUS" -ne 0 ] && FAILED=1

# Approved desktop-ID launch, end to end, over ONE sender: launch -> confirm -> the new
# window -> capture it -> type into it -> capture again. Launch tokens and observations are
# sender-bound, so this must not be split across client processes.
timeout 180 python3 "$REPO/tools/gnome-window-control/desktop-workflow-acceptance.py" \
  --yes --tolerate-missing-seat >"$BASE/workflow.txt" 2>&1
WORKFLOW_STATUS=$?
cat "$BASE/workflow.txt" | tee -a "$LOG"
case "$WORKFLOW_STATUS" in
  0) ;;
  3) INCOMPLETE=1; log "INCOMPLETE workflow: launch and capture passed, the keystroke needs a real seat" ;;
  *) FAILED=1 ;;
esac

# --- negative checks: exact refusals, not merely "not ok" ---
expect_refusal() {  # label expected-token request file
  local label="$1" token="$2" request="$3" file="$4" status
  timeout 40 python3 "$CLIENT" capture --request "$request" >"$BASE/$file" 2>&1
  status=$?
  run_py - "$BASE/$file" "$status" "$label" "$token" <<'PY'
import json, sys
path, status, label, token = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
data = json.load(open(path))
if status == 0 or data.get("ok"):
    print("FAIL", label, "was accepted but should have been refused"); raise SystemExit(1)
detail = str(data.get("detail"))
if token not in detail:
    print("FAIL", label, "refused with an unexpected reason:", data.get("error"), detail[:160])
    raise SystemExit(1)
print("PASS", label, "->", token)
PY
}

expect_refusal "an unknown window id is refused as stale" "Error.STALE" \
  "{\"windowId\":\"$EPOCH:999999\"}" "stale.json"

# The client checks the announced size before requesting any chunk and aborts the bridge
# capture, so this covers both the client bound and the abort path.
expect_refusal "an impossible byte bound is refused before transfer" "maxBytes" \
  "{\"windowId\":\"$WINDOW_ID\",\"maxBytes\":1}" "bounds.json"

# Tool-level acceptance: the production tool definitions (registration, serialization,
# exposure policy, shared credential guard) against this live bridge.
timeout 180 node --experimental-strip-types \
  "$REPO/.opencode/plugins/computer-use/live-desktop-acceptance.mjs" \
  --window-id "$WINDOW_ID" --app-id "$TARGET_APP_ID" \
  --allow-effects --launch-desktop-id org.gnome.Calculator.desktop \
  >"$BASE/tool-acceptance.txt" 2>&1
TOOL_STATUS=$?
cat "$BASE/tool-acceptance.txt" | tee -a "$LOG"
[ "$TOOL_STATUS" -ne 0 ] && FAILED=1

# Bridge resilience: a frozen bridge daemon must fail bounded (and free the serialized
# slot) rather than hang, and the surface must work again when it answers.
timeout 180 node --experimental-strip-types \
  "$REPO/.opencode/plugins/computer-use/resilience-acceptance.mjs" \
  --window-id "$WINDOW_ID" --app-id "$TARGET_APP_ID" --allow-effects \
  >"$BASE/resilience.txt" 2>&1
RESILIENCE_STATUS=$?
cat "$BASE/resilience.txt" | tee -a "$LOG"
[ "$RESILIENCE_STATUS" -ne 0 ] && FAILED=1

# A second, multi-chunk transfer: an incompressible image in a viewer makes the capture
# span several chunks, which is the only way to exercise out-of-order delivery live.
if ! python3 - "$BASE/noise.png" <<'PY' | tee -a "$LOG"
import os, sys
from PIL import Image
Image.frombytes("RGB", (640, 400), os.urandom(640 * 400 * 3)).save(sys.argv[1])
print("generated an incompressible 640x400 image for the multi-chunk check")
PY
then
  fail "could not generate the incompressible image, so multi-chunk ordering is unproven"
fi
if [ -f "$BASE/noise.png" ]; then
  start_owned loupe "$BASE/loupe.log" env GDK_BACKEND=wayland loupe "$BASE/noise.png" || exit 1
  LOUPE_JOB="$OWNED_JOB"
  chunk_window=""
  for _ in $(seq 1 20); do
    sleep 1
    timeout 20 python3 "$CLIENT" list >"$BASE/list.json" 2>&1 || true
    chunk_window=$(python3 -c "
import json
windows = json.load(open('$BASE/list.json')).get('windows') or []
match = [w for w in windows if 'noise' in (w.get('title') or '')]
print(match[0]['id'] if match else '')
" 2>/dev/null || echo "")
    [ -n "$chunk_window" ] && break
  done
  if [ -n "$chunk_window" ]; then
    timeout 180 python3 "$REPO/tools/gnome-window-control/bridge-protocol-acceptance.py" \
      --window-id "$chunk_window" --require-chunks 3 >"$BASE/protocol-multi.txt" 2>&1
    MULTI_STATUS=$?
    cat "$BASE/protocol-multi.txt" | tee -a "$LOG"
    [ "$MULTI_STATUS" -ne 0 ] && FAILED=1
  else
    fail "the image viewer window never appeared, so multi-chunk ordering is unproven"
  fi
  stop_owned_job "$LOUPE_JOB" || FAILED=1
fi

# Close only a target backed by a retained child handle. D-Bus activation or a
# detached launcher can leave an unowned window PID; that is incomplete, not authority
# to signal it. A context refusal is fail-closed, never renamed STALE.
TARGET_PID=$(python3 -c "
import json
windows = json.load(open('$BASE/list.json')).get('windows') or []
match = [w for w in windows if '$TAG' in (w.get('title') or '') and 'target1' in (w.get('title') or '')]
print((match[0].get('pid') or '') if match else '')
" 2>/dev/null || echo "")
if [ -n "$TARGET_PID" ] && stop_owned_target "$TARGET_PID"; then
sleep 1
closed_code=""
for _ in $(seq 1 5); do
  sleep 1
  timeout 40 python3 "$CLIENT" capture --request "{\"windowId\":\"$WINDOW_ID\"}" >"$BASE/closed.json" 2>&1
  closed_code=$(python3 -c "
import json
try:
    d = json.load(open('$BASE/closed.json'))
except Exception:
    print('unparsable'); raise SystemExit
print('accepted' if d.get('ok') else ('STALE' if 'Error.STALE' in str(d.get('detail')) else 'other'))
" 2>/dev/null || echo unparsable)
  [ "$closed_code" = "STALE" ] && break
done
case "$closed_code" in
  STALE) log "PASS a window that closed is refused as stale -> Error.STALE" ;;
  accepted) fail "a closed window still produced a capture" ;;
  other)
    python3 - "$BASE/closed.json" "$BASE/list.json" <<'PY' | tee -a "$LOG"
import json, sys
capture = json.load(open(sys.argv[1]))
state = json.load(open(sys.argv[2]))
detail = str(capture.get("detail"))
if "Error.REFUSED" in detail:
    focused = state.get("focusedWindowId")
    listed = [w.get("id") for w in (state.get("windows") or [])]
    print("PASS the closed window cannot be captured; the Shell refuses the context",
          "(fail-closed, not staleness)",
          "| blockedReason:", state.get("blockedReason"),
          "| focus:", focused, "(inventory window)" if focused in listed else "(outside the inventory)")
else:
    print("FAIL the closed window was refused for an unexpected reason:",
          capture.get("error"), detail[:120])
    raise SystemExit(1)
PY
    [ "${PIPESTATUS[0]}" -ne 0 ] && FAILED=1
    ;;
  *) fail "the closed-window probe produced unreadable output" ;;
esac
else
  INCOMPLETE=1
  log "INCOMPLETE closed-window check: target has no live owned-child handle; no PID signal sent"
fi

if [ "$DEBUG" -eq 1 ]; then
  log "--- refusal stacks (scratch copy) ---"
  grep -a -A 6 "ocwc-debug" "$BASE/shell.log" \
    | sed 's/^.*\[ocwc-debug\]/[ocwc-debug]/' | head -28 | tee -a "$LOG"
  run_py - "$BASE/shell.log" "$BASE/daemon.json" "$BASE/workflow.txt" <<'PY'
import sys
log_text = open(sys.argv[1], errors="replace").read()
daemon_text = open(sys.argv[2], errors="replace").read()
workflow_text = open(sys.argv[3], errors="replace").read()
problems = []
if "ocwc-debug" not in log_text:
    problems.append("no instrumented refusal was logged")
if "INPUT_FAILED" in daemon_text and "code=INPUT_FAILED" not in log_text:
    problems.append("the click was refused but its INPUT_FAILED stack is missing")
# The workflow records a refused keystroke as a note; its stack must also be present.
if "typing refused with INPUT_FAILED" in workflow_text and "code=INPUT_FAILED" not in log_text:
    problems.append("the keystroke was refused but its INPUT_FAILED stack is missing")
if problems:
    print("FAIL debug evidence incomplete:", "; ".join(problems)); raise SystemExit(1)
print("PASS debug stacks corroborate every refusal recorded above")
PY
fi

finish_private_run
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  for tool in dbus-run-session dbus-update-activation-environment gnome-shell python3 gdbus node gsettings cp cmp; do
    command -v "$tool" >/dev/null 2>&1 || { echo "missing prerequisite: $tool" >&2; exit 2; }
  done
  SELF=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
  HELPER="$(dirname "$SELF")/owned-process.py"
  if [ ! -f "$HELPER" ] || [ -L "$HELPER" ]; then
    echo "missing or linked owned-process helper; refusing before private activation" >&2
    exit 2
  fi
  python3 -B -c 'import os, signal; assert callable(getattr(os, "pidfd_open", None)) and callable(getattr(signal, "pidfd_send_signal", None)), "Linux pidfd support required"' || exit 2
  # No inherited flag/file can skip this boundary; sourcing only defines functions.
  exec env -u DBUS_SESSION_BUS_ADDRESS -u DBUS_STARTER_ADDRESS -u DBUS_STARTER_BUS_TYPE \
    -u DISPLAY -u WAYLAND_DISPLAY -u BASH_ENV -u ENV -u DCONF_PROFILE -u GSETTINGS_BACKEND \
    dbus-run-session -- bash --noprofile --norc -c 'source "$1"; run_private "$@"' fresh-shell-private "$SELF" "$@"
fi
