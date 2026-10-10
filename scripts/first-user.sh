#!/usr/bin/env bash
# First-user proof: a stranger installs codeloop from the packed tarball into a private npm
# prefix, runs the Start docs pages' own commands, and uses the served board. Nothing from this
# checkout is on PATH; the docs commands are lifted from the pages at run time, never retyped.
#
#   bash scripts/first-user.sh [--only install|docs|gate|wiki] [--keep]
#
# Steps print PASS/FAIL like scripts/e2e-founder-loop.sh; the exit code is 1 on any failure.
# Every mismatch between a page and the CLI is also printed as a GAP line (page / line /
# expected / got) for the docs owners. `--only` stops after that phase (earlier phases it
# needs still run) and ends with `FIRST-USER PASS <phase>`, which usecases/first-user asserts.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# FIRST_USER_DOCS points the run at another copy of the Start pages (a draft, or a deliberately
# broken copy to watch the comparison fail).
DOCS="${FIRST_USER_DOCS:-$ROOT/site/content/docs/start}"
PAGES="install first-card inbox approve-a-gate"
ONLY=all
KEEP=
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY=$2; shift 2 ;;
    --keep) KEEP=1; shift ;;
    *) echo "unknown argument $1"; exit 64 ;;
  esac
done
case "$ONLY" in install|docs|gate|wiki|all) ;; *) echo "--only takes install, docs, gate or wiki"; exit 64 ;; esac

[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }
for p in $PAGES; do [ -f "$DOCS/$p.md" ] || { echo "FAIL  $DOCS/$p.md missing"; exit 1; }; done

WORK="$(mktemp -d)"
PREFIX="$WORK/prefix"
PROJECT="$WORK/your-project"
LOG="$WORK/step.log"
SERVE_PID=""
START=$(date +%s)
cleanup() {
  [ -n "$SERVE_PID" ] && kill "$SERVE_PID" 2>/dev/null
  if [ -n "$KEEP" ]; then echo "kept $WORK"; else rm -rf "$WORK"; fi
}
trap cleanup EXIT
mkdir -p "$PREFIX" "$PROJECT"
cd "$PROJECT"
git init -q
unset CODELOOP_ROLE CODELOOP_AGENT_RUN

pass=0; fail=0; GAPS=()
ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); sed 's/^/        /' "$LOG" | head -40; }
gap() { GAPS+=("$1"); }

# expect <exit code> <step name> <command...>
expect() {
  local want=$1 name=$2 got=0
  shift 2
  "$@" > "$LOG" 2>&1 || got=$?
  if [ "$got" = "$want" ]; then ok "$name"; else echo "exit $got, wanted $want" >> "$LOG"; bad "$name"; fi
}
http() { node -e "const [want,u]=process.argv.slice(1); fetch(u).then(async r=>{console.log(await r.text()); process.exit(r.status===Number(want)?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})" "$@"; }
up() { for _ in $(seq 1 120); do http 200 "$1/api/cards" > /dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
norm() { node "$ROOT/scripts/first-user/blocks.mjs" norm "$@"; }

# ---------------------------------------------------------------------------------------------
# Phase 1: install from a package into a private prefix, with this checkout off PATH.
# ---------------------------------------------------------------------------------------------
# Drop this checkout and its node_modules/.bin from PATH; the private prefix goes first so the
# `codeloop` the docs run is the packed one, never a global install already on this machine.
CLEAN_PATH="$(printf '%s' "$PATH" | tr ':' '\n' | grep -v -F "$ROOT" | paste -sd ':' -)"
export PATH="$PREFIX/bin:$CLEAN_PATH"
export npm_config_prefix="$PREFIX"
export npm_config_update_notifier=false

VERSION="$(node -p "require('$ROOT/package.json').version")"
expect 0 "npm pack builds the tarball from this checkout" sh -c "cd '$ROOT' && npm pack --pack-destination '$WORK' --silent > '$WORK/pack.out' 2>&1 && test -s '$WORK/pack.out'"
TARBALL="$WORK/$(tr -d '[:space:]' < "$WORK/pack.out")"
[ -f "$TARBALL" ] || { echo "FAIL  no tarball at $TARBALL"; exit 1; }

# The install block from install.md, with the registry name swapped for the tarball under test.
# That is the one substitution in the install page; `cd your-project` is the other one, below.
BLOCKS="$WORK/blocks"
for p in $PAGES; do node "$ROOT/scripts/first-user/blocks.mjs" extract "$DOCS/$p.md" "$BLOCKS/$p" > /dev/null; done
substitute() { sed -e "s#@protoboxai/codeloop#$TARBALL#g" -e "s#cd your-project#cd '$PROJECT'#" "$1"; }

run_block() { # run_block <page> <nn>: runs the page's sh block, compares to its text block when it has one
  local page=$1 nn=$2 dir="$BLOCKS/$1" line first name got=0
  line=$(sed -n 's/^line=//p' "$dir/$nn.meta"); first=$(sed -n 's/^first=//p' "$dir/$nn.meta")
  name="$page.md L$line: $first"
  substitute "$dir/$nn.sh" > "$WORK/block.sh"
  (cd "$PROJECT" && bash "$WORK/block.sh") > "$WORK/block.out" 2>&1 || got=$?
  cp "$WORK/block.out" "$LOG"
  if [ -f "$dir/$nn.expect" ]; then
    norm "$dir/$nn.expect" > "$WORK/want.txt"
    norm "$WORK/block.out" "$PROJECT=your-project" "$TARBALL=@protoboxai/codeloop" > "$WORK/got.txt"
    if diff -q "$WORK/want.txt" "$WORK/got.txt" > /dev/null; then ok "$name (output matches the page)"; else
      echo "exit $got; diff (- page, + got):" > "$LOG"; diff -u "$WORK/want.txt" "$WORK/got.txt" | tail -n +3 >> "$LOG"
      # Under --only gate|wiki the pages are setup for the board, so a page that drifted is
      # reported as a gap without failing the phase; the docs phase itself still fails on it.
      if [ "$ONLY" = all ] || [ "$ONLY" = docs ]; then bad "$name (output differs from the page)"; else echo "WARN  $name (output differs from the page; a gap, not this phase's failure)"; sed 's/^/        /' "$LOG" | head -20; fi
      # The first differing lines only: `-` is what the page says, `+` is what the CLI printed.
      gap "$page.md / L$(sed -n 's/^expect_line=//p' "$dir/$nn.meta") / $(diff "$WORK/want.txt" "$WORK/got.txt" | grep '^<' | head -3 | sed 's/^< //' | tr '\n' '¶') / $(diff "$WORK/want.txt" "$WORK/got.txt" | grep '^>' | head -3 | sed 's/^> //' | tr '\n' '¶')"
    fi
  else
    if [ "$got" = 0 ]; then ok "$name (exit 0)"; else echo "exit $got" >> "$LOG"; bad "$name (exit $got)"; gap "$page.md / L$line / exit 0 / exit $got: $(head -c 200 "$WORK/block.out" | tr '\n' '¶')"; fi
  fi
}

run_block install 01
RPREFIX="$(realpath "$PREFIX")"; RROOT="$(realpath "$ROOT")"
expect 0 "codeloop on PATH is the private install, not this checkout" sh -c "test \"\$(command -v codeloop)\" = '$PREFIX/bin/codeloop' && realpath \"\$(command -v codeloop)\" | grep -q '^$RPREFIX/' && ! realpath \"\$(command -v codeloop)\" | grep -q '^$RROOT'"
expect 0 "codeloop --version prints $VERSION" sh -c "codeloop --version | grep -qF '$VERSION'"
INSTALLED="$PREFIX/lib/node_modules/@protoboxai/codeloop"
if [ -d "$INSTALLED/dist/workspace" ]; then PACKED_UI="workspace app (dist/workspace shipped in the package)"; else PACKED_UI="static board (no dist/workspace in the package)"; fi
echo "INFO  package ships: $PACKED_UI"

finish() {
  echo
  if [ ${#GAPS[@]} -gt 0 ]; then
    echo "GAPS (page / line / expected / got):"
    for g in "${GAPS[@]}"; do echo "  $g"; done
    echo
  fi
  echo "took $(( $(date +%s) - START ))s"
  if [ "$fail" = 0 ]; then echo "FIRST-USER PASS $ONLY: $pass steps passed, 0 failed"; exit 0; fi
  echo "FIRST-USER FAIL $ONLY: $pass passed, $fail failed"; exit 1
}
[ "$ONLY" = install ] && finish

# ---------------------------------------------------------------------------------------------
# Phase 2: the Start pages, block by block, in the order a reader meets them.
# ---------------------------------------------------------------------------------------------
# Steps the pages ask the reader to do in prose, between two code blocks.
before() { # before <page> <nn>
  case "$1/$2" in
    first-card/07)
      # "Fill in the story fields, one acceptance line and two tagged tasks" with `screens: none`.
      local spec; spec=$(ls -d "$PROJECT"/specs/001-*/ | head -1)
      perl -pi -e 's/^Story: .*/Story: As a founder, I can export every invoice as one CSV, so that I can hand the file to my accountant./; s/^size: .*/size: S/; s/^metric: .*/metric: cycle_time_days/; s/^done_when: .*/done_when: npm test/; s/^- US1 Given <state>.*/- US1 Given ten invoices, when I export, then invoices.csv has ten rows./; s/^screens:.*/screens: none/' "$spec/spec.md"
      grep '^- \[ \] T' "$DOCS/first-card.md" >> "$spec/tasks.md"
      ;;
    approve-a-gate/02)
      # "After the redo, `codeloop next c-001` runs the check again and the card parks at the same gate."
      (cd "$PROJECT" && codeloop next c-001) > "$WORK/redo.out" 2>&1 || true
      ;;
  esac
}

for p in $PAGES; do
  for f in "$BLOCKS/$p"/*.sh; do
    nn=$(basename "$f" .sh)
    [ "$p/$nn" = install/01 ] && continue
    before "$p" "$nn"
    run_block "$p" "$nn"
  done
done
[ "$ONLY" = docs ] && finish

# ---------------------------------------------------------------------------------------------
# Phase 3: the served board. A second card made the same way as the docs card, parked at its
# spec gate (c-001 left the gate on the approve-a-gate page).
# ---------------------------------------------------------------------------------------------
cd "$PROJECT"
codeloop start "Send invoices by email" --persona founder --can "email an invoice to a customer" --so "I stop attaching PDFs by hand" --size S > "$WORK/c2.out" 2>&1
SPEC2=$(ls -d "$PROJECT"/specs/002-*/ | head -1)
printf -- '- source: https://example.com/a — one\n- source: https://example.com/b — two\n- source: https://example.com/c — three\n\nverdict: build\n' >> "$SPEC2/research.md"
perl -pi -e 's/^Story: .*/Story: As a founder, I can email an invoice to a customer, so that I stop attaching PDFs by hand./; s/^size: .*/size: S/; s/^metric: .*/metric: cycle_time_days/; s/^done_when: .*/done_when: npm test/; s/^- US1 Given <state>.*/- US1 Given an invoice, when I send it, then the customer gets an email./; s/^screens:.*/screens: none/' "$SPEC2/spec.md"
printf -- '- [ ] T001 [US1] [api] Send the invoice email\n' >> "$SPEC2/tasks.md"
codeloop next c-002 > /dev/null 2>&1
# The interview stage: three questions with a recommended answer each, accepted by the owner.
for q in "Which mail provider?" "Attach the PDF or link to it?" "Who is the sender?"; do codeloop ask c-002 "$q" --recommended "Take the default" --as agent > /dev/null 2>&1; done
codeloop answer c-002 1 --accept > /dev/null 2>&1; codeloop answer c-002 2 --accept > /dev/null 2>&1; codeloop answer c-002 3 --accept > /dev/null 2>&1
codeloop next c-002 > /dev/null 2>&1; codeloop next c-002 > /dev/null 2>&1; codeloop next c-002 > "$WORK/c2-next.out" 2>&1
expect 0 "a second card made like the docs card is parked at the spec gate" sh -c "codeloop card show c-002 --json | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!(d.stage==='spec'&&d.gate==='spec')){console.log(JSON.stringify(d));process.exit(1)}\""

PORT=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
TOKEN=firstuser$(date +%s)
CODELOOP_SERVE_TOKEN=$TOKEN codeloop serve --owner --port "$PORT" > "$WORK/serve.log" 2>&1 &
SERVE_PID=$!
BASE="http://127.0.0.1:$PORT"
expect 0 "codeloop serve --owner answers on $BASE" up "$BASE"
UI=static
grep -q "Workspace app:" "$WORK/serve.log" && UI=workspace
grep -q "API only" "$WORK/serve.log" && UI=none
echo "INFO  UI under test: $UI ($(grep -o 'Workspace app: .*\|Static board: .*\|API only.*' "$WORK/serve.log" | head -1 | sed 's/\x1b\[[0-9;]*m//g'))"

run_browser() { # run_browser <flow> <label>
  local flow=$1 label=$2 got=0
  node "$ROOT/scripts/first-user/browser.mjs" "$flow" "$BASE" "$TOKEN" "$UI" c-002 > "$WORK/$flow.out" 2>&1 || got=$?
  while IFS= read -r line; do
    case "$line" in
      "STEP PASS "*) ok "$label: ${line#STEP PASS }" ;;
      "STEP FAIL "*) printf '%s\n' "$line" > "$LOG"; bad "$label: ${line#STEP FAIL }"; gap "$label / UI / ${line#STEP FAIL }" ;;
    esac
  done < "$WORK/$flow.out"
  if ! grep -q '^STEP ' "$WORK/$flow.out"; then cp "$WORK/$flow.out" "$LOG"; bad "$label: browser driver did not run (exit $got)"; fi
}

if [ "$ONLY" = all ] || [ "$ONLY" = gate ]; then
  run_browser gate "board ($UI)"
  expect 0 "the approval is on the card as an owner event" sh -c "codeloop card show c-002 --json | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!(d.stage==='build'&&(d.events||[]).some(e=>/approve/.test(JSON.stringify(e))))){console.log(JSON.stringify(d).slice(0,400));process.exit(1)}\""
fi
[ "$ONLY" = gate ] && finish

run_browser wiki "wiki ($UI)"
expect 0 "the new wiki page is a file under .codeloop/wiki" sh -c "ls '$PROJECT'/.codeloop/wiki/*/invoice-export-rollout.md"
finish
