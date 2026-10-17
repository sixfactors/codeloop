#!/usr/bin/env bash
export CODELOOP_HOME="${CODELOOP_HOME:-$(mktemp -d)}"  # keep test projects out of ~/.codeloop/projects.json
# Playwright proof of the sign-in model, in the style of scripts/first-user/browser.mjs (raw
# Playwright borrowed from another checkout, STEP PASS/FAIL lines): a visitor sees the Accept
# button disabled, signs in with the default board password, and the same button then answers
# the question.
#
#   npm run build && bash scripts/playwright-sign-in-accept.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }
[ -d "$ROOT/dist/workspace" ] || { echo "FAIL  dist/workspace missing; run npm run build:workspace"; exit 1; }

WORK="$(mktemp -d)"
SERVE_PID=""
trap '[ -n "$SERVE_PID" ] && kill "$SERVE_PID" 2>/dev/null; rm -rf "$WORK"' EXIT

mkdir -p "$WORK/bin" "$WORK/project"
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE
cd "$WORK/project"

pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); }
expect() {
  local want=$1 name=$2 got=0
  shift 2
  "$@" > "$WORK/step.log" 2>&1 || got=$?
  if [ "$got" = "$want" ]; then ok "$name"; else echo "exit $got, wanted $want" >> "$WORK/step.log"; bad "$name"; sed 's/^/        /' "$WORK/step.log"; fi
}
http() { node -e "fetch(process.argv[1]).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$1"; }
up() { for _ in 1 2 3 4 5 6 7 8 9 10; do http "$1/api/cards" && return 0; sleep 0.5; done; return 1; }

git init -q
expect 0 "init" codeloop init --tools claude --starter generic
expect 0 "start c-001 with an open question" sh -c "codeloop start 'Export invoices as CSV' --persona founder --can 'export invoices as one file' --so 'reconciliation is faster' --size S --id c-001"
expect 0 "ask a question with a recommended answer" codeloop ask c-001 "Which export format?" --recommended "CSV" --as agent

PORT=$(node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})")
codeloop serve --standalone --owner --port "$PORT" > "$WORK/serve.log" 2>&1 &
SERVE_PID=$!
BASE="http://localhost:$PORT"
expect 0 "serve starts" up "$BASE"

got=0
node "$ROOT/scripts/first-user/browser.mjs" question "$BASE" "owner:codeloop" workspace c-001 > "$WORK/question.out" 2>&1 || got=$?
while IFS= read -r line; do
  case "$line" in
    "STEP PASS "*) ok "${line#STEP PASS }" ;;
    "STEP FAIL "*) bad "${line#STEP FAIL }" ;;
  esac
done < "$WORK/question.out"
if ! grep -q '^STEP ' "$WORK/question.out"; then cat "$WORK/question.out"; bad "browser driver did not run (exit $got)"; fi

echo
if [ "$fail" = 0 ]; then echo "PLAYWRIGHT SIGN-IN PASS: $pass passed, 0 failed"; exit 0; fi
echo "PLAYWRIGHT SIGN-IN FAIL: $pass passed, $fail failed"; exit 1
