#!/usr/bin/env bash
# Playwright proof of the hub: two projects, one hub, one sign-in, switching between them never
# shows one project's data to the other. In the style of scripts/playwright-sign-in-accept.sh.
#
#   npm run build && npm run build:workspace && bash scripts/playwright-hub-switch.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }
[ -d "$ROOT/dist/workspace" ] || { echo "FAIL  dist/workspace missing; run npm run build:workspace"; exit 1; }

WORK="$(mktemp -d)"
HUB_PID=""
# A fixed port in the range this session was told to use for any server it starts (4300-4399),
# never 4040/4096.
PORT=4319
trap '[ -n "$HUB_PID" ] && kill "$HUB_PID" 2>/dev/null; CODELOOP_HOME="$WORK/home" node "$ROOT/dist/index.js" hub --stop >/dev/null 2>&1; rm -rf "$WORK"' EXIT

mkdir -p "$WORK/bin" "$WORK/home" "$WORK/a" "$WORK/b" "$WORK/shots"
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
export CODELOOP_HOME="$WORK/home"
unset CODELOOP_ROLE

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
up() { for _ in 1 2 3 4 5 6 7 8 9 10; do http "$1/api/hub/projects" && return 0; sleep 0.5; done; return 1; }

seed() {
  local dir=$1
  cd "$dir" || return 1
  git init -q
  codeloop init --tools claude --starter generic >/dev/null 2>&1 || return 1
  codeloop start "Export invoices as CSV" --persona founder --can "export invoices as one file" --so "reconciliation is faster" --size S --id c-001 >/dev/null 2>&1 || return 1
  codeloop ask c-001 "Which export format?" --recommended "CSV" --as agent >/dev/null 2>&1 || return 1
}

expect 0 "seed project A" seed "$WORK/a"
expect 0 "seed project B" seed "$WORK/b"

cd "$WORK/a" || exit 1
codeloop serve --port "$PORT" > "$WORK/serve-a.log" 2>&1
BASE="http://127.0.0.1:$PORT"
expect 0 "hub starts on A's serve" up "$BASE"

cd "$WORK/b" || exit 1
codeloop serve --port "$PORT" > "$WORK/serve-b.log" 2>&1

resolve_id() {
  node -e "
    const fs = require('fs');
    const want = fs.realpathSync(process.argv[2]);
    const found = JSON.parse(fs.readFileSync(process.argv[1], 'utf-8')).find(p => { try { return fs.realpathSync(p.path) === want; } catch { return false; } });
    if (!found) { console.error('no registry entry for', want); process.exit(1); }
    console.log(found.id);
  " "$WORK/home/projects.json" "$1"
}
ID_A=$(resolve_id "$WORK/a")
ID_B=$(resolve_id "$WORK/b")
if [ -z "$ID_A" ] || [ -z "$ID_B" ]; then
  bad "resolve project ids from the registry"
else
  ok "resolve project ids from the registry ($ID_A, $ID_B)"
fi

HUB_PID=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf-8')).pid)" "$WORK/home/state/hub.json" 2>/dev/null)

got=0
node "$ROOT/scripts/hub-playwright.mjs" "$BASE" "$ID_A" "$ID_B" "$WORK/shots" > "$WORK/hub.out" 2>&1 || got=$?
while IFS= read -r line; do
  case "$line" in
    "STEP PASS "*) ok "${line#STEP PASS }" ;;
    "STEP FAIL "*) bad "${line#STEP FAIL }" ;;
  esac
done < "$WORK/hub.out"
if ! grep -q '^STEP ' "$WORK/hub.out"; then cat "$WORK/hub.out"; bad "browser driver did not run (exit $got)"; fi

if [ -f "$WORK/shots/hub-project-a-answered.png" ] && [ -f "$WORK/shots/hub-project-b-open.png" ]; then
  ok "screenshots saved in $WORK/shots"
else
  bad "screenshots missing"
fi

echo
if [ "$fail" = 0 ]; then echo "PLAYWRIGHT HUB SWITCH PASS: $pass passed, 0 failed"; exit 0; fi
echo "PLAYWRIGHT HUB SWITCH FAIL: $pass passed, $fail failed"; exit 1
