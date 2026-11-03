#!/usr/bin/env bash
# Bounded, credential-free proof for the unapplied conditional session-title artifact.
#
# Safety: every output lives in a freshly allocated mkdtemp workspace under /tmp/opencode.
# Nothing is deleted, reused or chmod-ed, and pre-existing paths are refused before any write.
# Each native-suite subprocess is captured through runner.ts with a 45 s deadline and a
# 256 KiB retained-output cap; the pinned checkout is read-only input and untouched. The cap bounds
# what the runner keeps (shared stdout+stderr), not the size of each read the runtime performs —
# pinned Bun raises a stdout BYOB TypeError, so acquisition is not strictly pre-read chunk-capped.
# Client/OpenAPI generation runs only in staged copies, never in the pin.
set -euo pipefail
umask 077

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
native=${OPENCODE_NATIVE:-/home/james/repos/opencode-native-row}
bun_bin=${OPENCODE_BUN:-/home/james/repos/computer-use/tools/opencode-orchestration/runtime/bun-1.4.2-linux-x64/bun}
bun_sha=a83d263767d839e4d2649ca8e35d07159c7afc99afdc96d731ced29e056dda0c
bun_dir=$(dirname "$bun_bin")

die() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
EXTRA_ENV=()
CHILD_PATH=/usr/bin:/bin

[ -z "${CAS_WORK:-}" ] || die "CAS_WORK is not supported; workspaces are allocated exclusively under /tmp/opencode"
[ -x "$bun_bin" ] || die "bun is not executable: $bun_bin"
[ "$(sha256sum "$bun_bin" | cut -d' ' -f1)" = "$bun_sha" ] || die "bun hash does not match the pinned runtime"
[ -d "$native/packages/core/src" ] || die "pinned native checkout not found: $native"
[ "$(git --no-optional-locks -C "$native" rev-parse HEAD)" = ba546ec1598a70db2570e9c6258028d955ba8f58 ] || die "native commit changed"
[ -z "$(git --no-optional-locks -C "$native" status --porcelain --untracked-files=all -- \
  packages/core/src packages/core/test packages/core/package.json \
  packages/protocol/src packages/protocol/script packages/protocol/openapi.json packages/protocol/package.json packages/server/src packages/server/package.json \
  packages/client/src packages/client/script packages/client/package.json \
  packages/plugin/src packages/plugin/package.json \
  packages/httpapi-codegen/src packages/httpapi-codegen/package.json)" ] || die "selected native source tree is dirty"
(cd "$native" && sha256sum --quiet -c "$here/SOURCES.sha256") || die "pinned source hash mismatch"

[ -d /tmp/opencode ] && [ ! -L /tmp/opencode ] || die "approved scratch root must be a real directory"
work=$(mktemp -d /tmp/opencode/title-cas-XXXXXX) || die "could not allocate a workspace under /tmp/opencode"
[ -d "$work" ] || die "workspace allocation returned no directory"
for path in "$work/green" "$work/negative" "$work/logs" "$work/env" "$work/transport" \
  "$work/negative-forwarding" "$work/negative-conflict"; do
  [ ! -e "$path" ] && [ ! -L "$path" ] || die "refusing pre-existing path: $path"
done
mkdir "$work/logs" "$work/env"
mkdir "$work/env/home" "$work/env/cache" "$work/env/config" "$work/env/data" "$work/env/state" "$work/env/tmp" "$work/env/transpiler"

child_env() {
  env -i \
    PATH="${CHILD_PATH:-/usr/bin:/bin}" \
    HOME="$work/env/home" \
    XDG_CACHE_HOME="$work/env/cache" \
    XDG_CONFIG_HOME="$work/env/config" \
    XDG_DATA_HOME="$work/env/data" \
    XDG_STATE_HOME="$work/env/state" \
    TMPDIR="$work/env/tmp" \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH="$work/env/transpiler" \
    OPENCODE_DB=:memory: \
    CI=1 NO_COLOR=1 \
    "${EXTRA_ENV[@]}" \
    "$@"
}

# Runs one bounded child and echoes runner.ts's summary line.
run_bounded() { # $1 cwd, $2 log, $3 deadline, rest = bun subcommand and args
  local cwd=$1 log=$2 deadline=$3
  shift 3
  child_env "$bun_bin" "$here/runner.ts" exec --cwd "$cwd" --log "$log" --deadline "$deadline" -- "$bun_bin" "$@"
}

stage() { # $1 directory, $2 patch
  local dir=$1 patch=$2
  mkdir -p "$dir/packages/core/test"
  cp -a "$native/packages/core/src" "$dir/packages/core/src"
  cp -a "$native/packages/core/test/lib" "$dir/packages/core/test/lib"
  cp -a "$native/packages/core/package.json" "$dir/packages/core/package.json"
  ln -s "$native/packages/core/node_modules" "$dir/packages/core/node_modules"
  ln -s "$native/node_modules" "$dir/node_modules"
  cp "$here/cas.test.ts" "$dir/packages/core/test/cas.test.ts"
  (cd "$dir" && git apply -p1 "$patch")
}

# Transport stages keep the whole core test tree for the plugin-host fixture. "typed" points
# core's @opencode/plugin at the staged plugin, so the staged plugin -> staged regenerated client
# chain is what resolves. Runtime-only negative stages keep the pinned plugin link.
stage_core_full() { # $1 directory, $2 typed|runtime
  local dir=$1
  mkdir -p "$dir/packages/core"
  cp -a "$native/packages/core/src" "$dir/packages/core/src"
  cp -a "$native/packages/core/test" "$dir/packages/core/test"
  cp -a "$native/packages/core/package.json" "$dir/packages/core/package.json"
  if [ "${2:-runtime}" = typed ]; then
    link_modules "$dir/packages/core/node_modules" core "plugin=$dir/packages/plugin"
  else
    ln -s "$native/packages/core/node_modules" "$dir/packages/core/node_modules"
  fi
  ln -s "$native/node_modules" "$dir/node_modules"
}

# A real node_modules directory with absolute links to pinned dependencies and explicit
# overrides for staged workspace packages, so resolution cannot fall back to a pinned copy
# of a modified package. Symlinks are dependency resolution, not a sandbox.
link_modules() { # $1 destination, $2 pinned package name, then name=target overrides
  local dst=$1 pkg=$2
  shift 2
  local src="$native/packages/$pkg/node_modules" entry base pair target
  mkdir -p "$dst/@opencode"
  for entry in "$src"/*; do
    base=$(basename "$entry")
    [ "$base" = "@opencode" ] && continue
    ln -s "$(readlink -f "$entry")" "$dst/$base"
  done
  for entry in "$src"/@opencode/*; do
    base=$(basename "$entry")
    target=$(readlink -f "$entry")
    for pair in "$@"; do
      [ "${pair%%=*}" = "$base" ] && target="${pair#*=}"
    done
    ln -s "$target" "$dst/@opencode/$base"
  done
}

stage_protocol() { # $1 directory
  local dir=$1
  mkdir -p "$dir/packages/protocol"
  cp -a "$native/packages/protocol/src" "$dir/packages/protocol/src"
  cp -a "$native/packages/protocol/package.json" "$dir/packages/protocol/package.json"
  mkdir "$dir/packages/protocol/script"
  cp "$native/packages/protocol/script/generate-openapi.ts" "$native/packages/protocol/script/openapi-stabilize.ts" "$dir/packages/protocol/script/"
  cp "$native/packages/protocol/openapi.json" "$dir/packages/protocol/openapi.json"
  link_modules "$dir/packages/protocol/node_modules" protocol
}

stage_client() { # $1 directory
  local dir=$1
  mkdir -p "$dir/packages/client"
  local -a EXTRA_ENV=("COPY_FROM=$native/packages/client" "COPY_TO=$dir/packages/client")
  local copy_summary
  copy_summary=$(run_bounded "$dir/packages/client" "$work/logs/stage-client.log" 45000 -e '
    const fs=require("node:fs"),path=require("node:path");
    const from=process.env.COPY_FROM,to=process.env.COPY_TO;
    const outputs=["src/promise/generated","src/effect/generated","src/effect/api"];
    for(const entry of ["src","script","package.json"])
      fs.cpSync(path.join(from,entry),path.join(to,entry),{recursive:true,force:false,errorOnExist:true,
        filter:p=>!outputs.includes(path.relative(from,p))});
    for(const output of outputs){
      const target=path.join(to,output);
      let current=to;
      for(const part of output.split("/")){
        current=path.join(current,part);
        if(fs.existsSync(current)){
          const st=fs.lstatSync(current);
          if(st.isSymbolicLink()||!st.isDirectory())throw Error("unsafe output ancestor");
        }else fs.mkdirSync(current,{mode:0o700});
      }
      if(fs.realpathSync(target)!==target||fs.readdirSync(target).length)throw Error("output must be real and empty");
      console.log("fresh generator output: "+target);
    }
  ') || die "staged client copy failed within bounds"
  grep -q 'kind=ok exit=0 ' <<<"$copy_summary" || die "staged client copy failed: $copy_summary"
  link_modules "$dir/packages/client/node_modules" client \
    "protocol=$dir/packages/protocol" \
    "schema=$(readlink -f "$native/packages/schema")" \
    "httpapi-codegen=$(readlink -f "$native/packages/httpapi-codegen")"
}

stage_plugin() { # $1 directory
  local dir=$1
  mkdir -p "$dir/packages/plugin"
  cp -a "$native/packages/plugin/src" "$dir/packages/plugin/src"
  cp -a "$native/packages/plugin/package.json" "$dir/packages/plugin/package.json"
  link_modules "$dir/packages/plugin/node_modules" plugin \
    "client=$dir/packages/client" \
    "protocol=$dir/packages/protocol" \
    "schema=$(readlink -f "$native/packages/schema")" \
    "ai=$(readlink -f "$native/packages/ai")" \
    "util=$(readlink -f "$native/packages/util")" \
    "theme=$(readlink -f "$native/packages/theme")"
}

stage_server() { # $1 directory
  local dir=$1
  local client="$dir/packages/client"
  [ -d "$client" ] || client="$(readlink -f "$native/packages/client")"
  mkdir -p "$dir/packages/server/test"
  cp -a "$native/packages/server/src" "$dir/packages/server/src"
  cp -a "$native/packages/server/package.json" "$dir/packages/server/package.json"
  link_modules "$dir/packages/server/node_modules" server \
    "core=$dir/packages/core" \
    "protocol=$dir/packages/protocol" \
    "client=$client" \
    "schema=$(readlink -f "$native/packages/schema")" \
    "plugin=$(readlink -f "$native/packages/plugin")" \
    "util=$(readlink -f "$native/packages/util")" \
    "simulation=$(readlink -f "$native/packages/simulation")"
}

printf 'pinned native: %s\npinned bun:    %s\nworkspace:     %s\n' "$native" "$bun_bin" "$work"

runner_summary=$(run_bounded "$here" "$work/logs/runner.log" 45000 test ./runner.test.ts) ||
  { cat "$work/logs/runner.log"; die "runner safety suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$runner_summary" || { cat "$work/logs/runner.log"; die "runner safety suite failed: $runner_summary"; }
grep -q '^ 11 pass$' "$work/logs/runner.log" || { cat "$work/logs/runner.log"; die "runner safety suite did not report 11 passing tests"; }
printf 'runner:       %s\n' "$runner_summary"

stage "$work/green" "$here/conditional-rename.patch"
green_log="$work/logs/green.log"
green_summary=$(run_bounded "$work/green/packages/core" "$green_log" 45000 test ./test/cas.test.ts) ||
  { cat "$green_log"; die "patched suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$green_summary" || { cat "$green_log"; die "patched suite failed: $green_summary"; }
grep -q '^ 9 pass$' "$green_log" || { cat "$green_log"; die "patched suite did not report 9 passing tests"; }
printf 'green:        %s\n' "$green_summary"

stage "$work/negative" "$here/conditional-rename.patch"
(cd "$work/negative" && git apply -p1 "$here/negative-control.patch")
negative_log="$work/logs/negative.log"
negative_summary=$(run_bounded "$work/negative/packages/core" "$negative_log" 45000 \
  test -t "preserves a manual rename committed after the last pre-publication read" ./test/cas.test.ts) ||
  { cat "$negative_log"; die "negative control did not finish within bounds"; }
grep -q 'kind=ok ' <<<"$negative_summary" || { cat "$negative_log"; die "negative control bound violation: $negative_summary"; }
grep -q 'exit=0 ' <<<"$negative_summary" && { cat "$negative_log"; die "negative control passed; the guard is not load-bearing"; }
grep -qF -- '(fail) conditional session rename > preserves a manual rename committed after the last pre-publication read' "$negative_log" ||
  { cat "$negative_log"; die "negative control failed for an unexpected reason"; }
grep -qF -- '-   "title": "Human chosen' "$negative_log" ||
  { cat "$negative_log"; die "negative control did not fail at the manual-title assertion"; }
grep -qF 'Expected: "Failure"' "$negative_log" &&
  { cat "$negative_log"; die "negative control failed at the generic Exit check instead of the manual title"; }
printf 'negative:     %s (manual-title assertion failed as required)\n' "$negative_summary"

# Transport: generated client, in-process HTTP handler and plugin host against real core.
T="$work/transport"
stage_protocol "$T"
stage_client "$T"
stage_plugin "$T"
stage_core_full "$T" typed
stage_server "$T"
cp "$here/transport-host.test.ts" "$T/packages/core/test/plugin/transport-host.test.ts"
cp "$here/adapter-boundary.test.ts" "$T/packages/core/test/plugin/adapter-boundary.test.ts"
cp "$here/capability.test.ts" "$T/packages/core/test/plugin/capability.test.ts"
cp "$here/controller-boundary.test.ts" "$T/packages/core/test/plugin/controller-boundary.test.ts"
cp "$here/openapi.test.ts" "$T/packages/protocol/openapi.test.ts"
controller="$T/packages/core/test/plugin/title-controller"
mkdir "$controller"
for source in task-titles.ts session.ts automation.ts source-handoff.ts model.ts; do
  cp "$here/../../.opencode/plugins/goal-docs/$source" "$controller/$source"
done
sha256sum "$controller"/*.ts >"$work/logs/controller-inputs.sha256"
cp "$here/transport-http.test.ts" "$T/packages/server/test/transport-http.test.ts"
mkdir -p "$T/packages/client/test"
cp "$here/codegen.test.ts" "$T/packages/client/test/codegen.test.ts"
cp "$here/resolution.test.ts" "$T/packages/core/test/resolution.test.ts"
(cd "$T" && git apply -p1 "$here/conditional-rename.patch" && git apply -p1 "$here/transport.patch" &&
  git apply -p1 "$here/capability.patch")

EXTRA_ENV=("PATH=$bun_dir:/usr/bin:/bin" "CAS_STAGED=$T" "OPENCODE_NATIVE=$native")
resolve_summary=$(run_bounded "$T/packages/client" "$work/logs/resolve.log" 45000 \
  -e 'console.log(Bun.resolveSync("@opencode/protocol/client", process.env.CAS_STAGED + "/packages/client"))') ||
  { cat "$work/logs/resolve.log"; die "protocol resolution probe failed"; }
resolved=$(grep -E '^/' "$work/logs/resolve.log" | tail -1)
[ -n "$resolved" ] || { cat "$work/logs/resolve.log"; die "protocol resolution probe printed no path"; }
case "$resolved" in
  "$T"/packages/protocol/*) ;;
  *) die "client resolved a protocol outside the staged copy: $resolved" ;;
esac
printf 'resolution:   %s\n' "$resolved"

# The pinned document must first fail the owning generator's freshness check
# against the staged protocol, then be regenerated only in this fresh stage.
openapi_before=$(run_bounded "$T/packages/protocol" "$work/logs/openapi-before.log" 45000 run check:generated) ||
  { cat "$work/logs/openapi-before.log"; die "OpenAPI before-state did not finish within bounds"; }
grep -q 'kind=ok ' <<<"$openapi_before" || die "OpenAPI before-state exceeded its envelope"
grep -q 'exit=0 ' <<<"$openapi_before" && die "the unchanged pinned OpenAPI unexpectedly matched the modified staged protocol"
grep -qF 'Generated OpenAPI document is stale.' "$work/logs/openapi-before.log" ||
  { cat "$work/logs/openapi-before.log"; die "OpenAPI before-state failed outside its freshness assertion"; }
openapi_generate=$(run_bounded "$T/packages/protocol" "$work/logs/openapi-generate.log" 45000 run generate) || die "OpenAPI generation exceeded its envelope"
grep -q 'kind=ok exit=0 ' <<<"$openapi_generate" || { cat "$work/logs/openapi-generate.log"; die "OpenAPI generation failed"; }
openapi_check=$(run_bounded "$T/packages/protocol" "$work/logs/openapi-check.log" 45000 run check:generated) || die "OpenAPI check exceeded its envelope"
grep -q 'kind=ok exit=0 ' <<<"$openapi_check" || { cat "$work/logs/openapi-check.log"; die "generated OpenAPI is not canonical"; }
openapi_test=$(run_bounded "$T/packages/protocol" "$work/logs/openapi-test.log" 45000 test ./openapi.test.ts) || die "OpenAPI schema tests exceeded their envelope"
grep -q 'kind=ok exit=0 ' <<<"$openapi_test" || { cat "$work/logs/openapi-test.log"; die "OpenAPI schema tests failed"; }
grep -q '^ 5 pass$' "$work/logs/openapi-test.log" || die "OpenAPI schema tests did not report 5 passing tests"
sha256sum "$T/packages/protocol/openapi.json"
printf 'openapi:      %s (stale before; generated and canonical check passed)\n' "$openapi_test"

codegen_summary=$(run_bounded "$T/packages/client" "$work/logs/codegen.log" 45000 run generate) ||
  { cat "$work/logs/codegen.log"; die "client code generation did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$codegen_summary" || { cat "$work/logs/codegen.log"; die "client code generation failed: $codegen_summary"; }
printf 'codegen:      %s\n' "$codegen_summary"

GEN="$work/logs/generated-shapes.txt"
[ ! -e "$GEN" ] && [ ! -L "$GEN" ] || die "refusing pre-existing path: $GEN"
(
  set -o noclobber
  sha256sum "$T/packages/client/src/promise/generated/client.ts" \
    "$T/packages/client/src/promise/generated/types.ts" \
    "$T/packages/client/src/effect/generated/client.ts" \
    "$T/packages/client/src/effect/api/api.ts" >"$GEN"
  grep -n -A15 'update: (input: SessionUpdateInput' "$T/packages/client/src/promise/generated/client.ts" >>"$GEN"
  grep -n 'readonly expectedTitle?: string | undefined' "$T/packages/client/src/promise/generated/types.ts" | head -1 >>"$GEN"
  grep -n 'readonly expectedTitle?: string | undefined' "$T/packages/client/src/effect/api/api.ts" >>"$GEN"
  grep -n 'expectedTitle: input\["expectedTitle"\]' "$T/packages/client/src/effect/generated/client.ts" >>"$GEN"
)
cat "$GEN"

codegen_test=$(run_bounded "$T/packages/client" "$work/logs/codegen-test.log" 45000 test ./test/codegen.test.ts) ||
  { cat "$work/logs/codegen-test.log"; die "generated-shape suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$codegen_test" || { cat "$work/logs/codegen-test.log"; die "generated-shape suite failed: $codegen_test"; }
grep -q '^ 6 pass$' "$work/logs/codegen-test.log" || { cat "$work/logs/codegen-test.log"; die "generated client suite did not report 6 passing tests"; }
printf 'generated:    %s\n' "$codegen_test"

resolution_test=$(run_bounded "$T/packages/core" "$work/logs/resolution.log" 45000 test ./test/resolution.test.ts) ||
  { cat "$work/logs/resolution.log"; die "staged resolution suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$resolution_test" || { cat "$work/logs/resolution.log"; die "staged resolution suite failed: $resolution_test"; }
grep -q '^ 3 pass$' "$work/logs/resolution.log" || { cat "$work/logs/resolution.log"; die "staged resolution suite did not report 3 passing tests"; }
printf 'resolution test: %s\n' "$resolution_test"

http_summary=$(run_bounded "$T/packages/server" "$work/logs/http.log" 45000 test ./test/transport-http.test.ts) ||
  { cat "$work/logs/http.log"; die "HTTP transport suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$http_summary" || { cat "$work/logs/http.log"; die "HTTP transport suite failed: $http_summary"; }
grep -q '^ 6 pass$' "$work/logs/http.log" || { cat "$work/logs/http.log"; die "HTTP transport suite did not report 6 passing tests"; }
printf 'http:         %s\n' "$http_summary"

host_summary=$(run_bounded "$T/packages/core" "$work/logs/host.log" 45000 test ./test/plugin/transport-host.test.ts) ||
  { cat "$work/logs/host.log"; die "plugin host suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$host_summary" || { cat "$work/logs/host.log"; die "plugin host suite failed: $host_summary"; }
grep -q '^ 6 pass$' "$work/logs/host.log" || { cat "$work/logs/host.log"; die "plugin host suite did not report 6 passing tests"; }
printf 'host:         %s\n' "$host_summary"

# Same staged tree: the promise adapter compiles the patched payload schema, so the conflict must
# surface at the promise boundary and the pinned adapter control must still overwrite (negative).
adapter_summary=$(run_bounded "$T/packages/core" "$work/logs/adapter.log" 45000 test ./test/plugin/adapter-boundary.test.ts) ||
  { cat "$work/logs/adapter.log"; die "promise adapter suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$adapter_summary" || { cat "$work/logs/adapter.log"; die "promise adapter suite failed: $adapter_summary"; }
grep -q '^ 3 pass$' "$work/logs/adapter.log" || { cat "$work/logs/adapter.log"; die "promise adapter suite did not report 3 passing tests"; }
printf 'adapter:      %s\n' "$adapter_summary"

# Capability handshake: the staged bridge must answer exactly {conditionalTitleUpdate: 1} with no
# write, while the pinned adapter exposes no capability at all (absence, not a version guess).
capability_summary=$(run_bounded "$T/packages/core" "$work/logs/capability.log" 45000 test ./test/plugin/capability.test.ts) ||
  { cat "$work/logs/capability.log"; die "capability suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$capability_summary" || { cat "$work/logs/capability.log"; die "capability suite failed: $capability_summary"; }
grep -q '^ 2 pass$' "$work/logs/capability.log" || { cat "$work/logs/capability.log"; die "capability suite did not report 2 passing tests"; }
printf 'capability:   %s\n' "$capability_summary"

controller_summary=$(run_bounded "$T/packages/core" "$work/logs/controller.log" 45000 test ./test/plugin/controller-boundary.test.ts) ||
  { cat "$work/logs/controller.log"; die "current-controller suite did not finish within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$controller_summary" || { cat "$work/logs/controller.log"; die "current-controller suite failed: $controller_summary"; }
grep -q '^ 6 pass$' "$work/logs/controller.log" || { cat "$work/logs/controller.log"; die "current-controller suite did not report 6 passing tests"; }
printf 'controller:   %s\n' "$controller_summary"

# Baseline above must pass before either isolated controller mutation is tested.
# The native adapter/core stay identical; only the selected safety clause changes.
mutation_summary=$(run_bounded "$T/packages/core" "$work/logs/controller-mutations.log" 45000 -e '
  const fs=require("node:fs"),path=require("node:path");
  const root="test/plugin", source=path.join(root,"title-controller");
  const variants=[
    ["no-precondition","task-titles.ts","{ sessionID: id, title, expectedTitle: existing }","{ sessionID: id, title }"],
    ["no-capability","task-titles.ts",`if (capability !== "conditional-title-v1") return`,"/* isolated negative control: capability gate removed */"],
    ["worker-no-precondition","automation.ts","{ sessionID: id, title, expectedTitle: current.title }","{ sessionID: id, title }"],
    ["worker-no-capability","automation.ts","if (!await supportsConditionalTitle(deps.session, deps.signal)) return","/* isolated negative control: capability gate removed */"],
  ];
  for(const [name,input,before,after] of variants){
    const target=path.join(root,`title-controller-${name}`);
    fs.cpSync(source,target,{recursive:true,errorOnExist:true,force:false});
    const file=path.join(target,input), text=fs.readFileSync(file,"utf8");
    if(text.split(before).length!==2)throw Error("controller mutation site is not unique");
    fs.writeFileSync(file,text.replace(before,after));
    const test=fs.readFileSync(path.join(root,"controller-boundary.test.ts"),"utf8");
    fs.writeFileSync(path.join(root,`controller-${name}.test.ts`),test.replaceAll("./title-controller/",`./title-controller-${name}/`),{flag:"wx"});
  }
  console.log("four isolated controller variants staged");
') || { cat "$work/logs/controller-mutations.log"; die "controller controls could not be staged within bounds"; }
grep -q 'kind=ok exit=0 ' <<<"$mutation_summary" || die "controller control staging failed"
for control in no-precondition no-capability worker-no-precondition worker-no-capability; do
  if [ "$control" = no-precondition ]; then
    selected="current controller preserves a manual title at the final promise publication boundary"
    expected='Expected: "Human chosen'
  elif [ "$control" = no-capability ]; then
    selected="current controller refuses the pinned adapter without generation, storage writes or legacy publication"
    expected='Expected: "Fix desktop input"'
  elif [ "$control" = worker-no-precondition ]; then
    selected="handoff worker preserves a manual title at the final promise publication boundary"
    expected='Expected: "Human chosen'
  else
    selected="handoff worker refuses legacy publication without disabling its policy"
    expected='Expected: "Fix handoff resume"'
  fi
  log="$work/logs/controller-$control.log"
  summary=$(run_bounded "$T/packages/core" "$log" 45000 test -t "$selected" "./test/plugin/controller-$control.test.ts") ||
    { cat "$log"; die "controller control did not finish within bounds"; }
  grep -q 'kind=ok ' <<<"$summary" || die "controller control exceeded its envelope"
  grep -q 'exit=0 ' <<<"$summary" && { cat "$log"; die "controller control unexpectedly passed"; }
  grep -qF "(fail) $selected" "$log" || { cat "$log"; die "controller control failed outside its selected case"; }
  grep -qF "$expected" "$log" || { cat "$log"; die "controller control did not fail at title preservation"; }
  printf 'controller %s: %s (title preservation assertion failed as required)\n' "$control" "$summary"
done
EXTRA_ENV=()
CHILD_PATH=

# Same user-visible controls: dropped forwarding fails the manual-title assertion, and a
# dropped 409 mapping fails the status assertion while the title stays preserved.
NEG_FORWARD="$work/negative-forwarding"
stage_core_full "$NEG_FORWARD"
stage_protocol "$NEG_FORWARD"
stage_server "$NEG_FORWARD"
cp "$here/transport-host.test.ts" "$NEG_FORWARD/packages/core/test/plugin/transport-host.test.ts"
cp "$here/transport-http.test.ts" "$NEG_FORWARD/packages/server/test/transport-http.test.ts"
(cd "$NEG_FORWARD" && git apply -p1 "$here/conditional-rename.patch" && git apply -p1 "$here/transport.patch" &&
  git apply -p1 "$here/negative-forwarding.patch")

forward_http=$(run_bounded "$NEG_FORWARD/packages/server" "$work/logs/forward-http.log" 45000 \
  test -t "conflict preserves the manual title" ./test/transport-http.test.ts) ||
  { cat "$work/logs/forward-http.log"; die "forwarding control did not finish within bounds"; }
grep -q 'kind=ok ' <<<"$forward_http" || { cat "$work/logs/forward-http.log"; die "forwarding control bound violation: $forward_http"; }
grep -q 'exit=0 ' <<<"$forward_http" && { cat "$work/logs/forward-http.log"; die "dropped HTTP forwarding still passed"; }
grep -qF -- 'Expected: "Human chosen' "$work/logs/forward-http.log" ||
  { cat "$work/logs/forward-http.log"; die "HTTP forwarding control did not fail at the manual-title assertion"; }
printf 'forward http: %s (manual-title assertion failed as required)\n' "$forward_http"

forward_host=$(run_bounded "$NEG_FORWARD/packages/core" "$work/logs/forward-host.log" 45000 \
  test -t "plugin conflict preserves the manual title" ./test/plugin/transport-host.test.ts) ||
  { cat "$work/logs/forward-host.log"; die "host forwarding control did not finish within bounds"; }
grep -q 'kind=ok ' <<<"$forward_host" || { cat "$work/logs/forward-host.log"; die "host forwarding control bound violation: $forward_host"; }
grep -q 'exit=0 ' <<<"$forward_host" && { cat "$work/logs/forward-host.log"; die "dropped host forwarding still passed"; }
grep -qF -- 'Expected: "Human chosen' "$work/logs/forward-host.log" ||
  { cat "$work/logs/forward-host.log"; die "host forwarding control did not fail at the manual-title assertion"; }
printf 'forward host: %s (manual-title assertion failed as required)\n' "$forward_host"

NEG_CONFLICT="$work/negative-conflict"
stage_core_full "$NEG_CONFLICT"
stage_protocol "$NEG_CONFLICT"
stage_server "$NEG_CONFLICT"
cp "$here/transport-http.test.ts" "$NEG_CONFLICT/packages/server/test/transport-http.test.ts"
(cd "$NEG_CONFLICT" && git apply -p1 "$here/conditional-rename.patch" && git apply -p1 "$here/transport.patch" &&
  git apply -p1 "$here/negative-conflict.patch")
conflict_summary=$(run_bounded "$NEG_CONFLICT/packages/server" "$work/logs/conflict.log" 45000 \
  test -t "conflict preserves the manual title" ./test/transport-http.test.ts) ||
  { cat "$work/logs/conflict.log"; die "409-mapping control did not finish within bounds"; }
grep -q 'kind=ok ' <<<"$conflict_summary" || { cat "$work/logs/conflict.log"; die "409-mapping control bound violation: $conflict_summary"; }
grep -q 'exit=0 ' <<<"$conflict_summary" && { cat "$work/logs/conflict.log"; die "dropped 409 mapping still passed"; }
grep -q 'Expected: 409' "$work/logs/conflict.log" ||
  { cat "$work/logs/conflict.log"; die "409-mapping control did not fail at the status assertion"; }
grep -qF -- '-   "title": "Human chosen' "$work/logs/conflict.log" &&
  { cat "$work/logs/conflict.log"; die "409-mapping control failed at the title assertion instead of the status"; }
printf '409 mapping:  %s (status assertion failed as required, title preserved)\n' "$conflict_summary"

# Resolution before-state: the runtime-only stage keeps the pinned plugin link, so the staged
# plugin/client assertions must fail. This is the observed red for the typed resolution proof.
cp "$here/resolution.test.ts" "$NEG_CONFLICT/packages/core/test/resolution.test.ts"
EXTRA_ENV=("CAS_STAGED=$NEG_CONFLICT")
resolution_red=$(run_bounded "$NEG_CONFLICT/packages/core" "$work/logs/resolution-red.log" 45000 \
  test -t "staged core resolves the staged plugin" ./test/resolution.test.ts) ||
  { cat "$work/logs/resolution-red.log"; die "resolution before-state did not finish within bounds"; }
grep -q 'kind=ok ' <<<"$resolution_red" || { cat "$work/logs/resolution-red.log"; die "resolution before-state bound violation: $resolution_red"; }
grep -q 'exit=0 ' <<<"$resolution_red" && { cat "$work/logs/resolution-red.log"; die "resolution before-state unexpectedly passed"; }
grep -qF '(fail) staged core resolves the staged plugin instead of the pin' "$work/logs/resolution-red.log" ||
  { cat "$work/logs/resolution-red.log"; die "resolution before-state did not fail at the staged-plugin assertion"; }
EXTRA_ENV=()
printf 'resolution red: %s (pinned plugin link failed the staged assertion)\n' "$resolution_red"

printf 'OK: conditional title transport proof complete; workspace retained; pinned checkout untouched\n'
