#!/usr/bin/env bash
# End-to-end proof of the optional cloud store against a local Protobox, in temp projects.
#   npm run build && bash scripts/e2e-cloud.sh
# Reads the workspace id and API key from $PROTOBOX_CACHE (default ~/Projects/protobox/.caches/protobox.json).
# Every run uses its own board title, wiki titles and workspace folder, so it never touches a real
# "codeloop board" page and never sees the pages an earlier run left behind.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }
PORT="${PROTOBOX_MCP_PORT:-4002}"
CACHE="${PROTOBOX_CACHE:-$HOME/Projects/protobox/.caches/protobox.json}"

if ! (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  echo "SKIP: local Protobox not running"
  exit 0
fi
[ -f "$CACHE" ] || { echo "FAIL  $CACHE not found"; exit 1; }
WS=$(node -e "console.log(require('$CACHE').test_workspace.id)")
KEY=$(node -e "console.log(require('$CACHE').api_key)")
URL="http://localhost:$PORT/api/mcp/$WS"

# The workspace has to serve the page tools on its MCP endpoint; say so plainly if it does not.
TOOLS=$(URL="$URL" KEY="$KEY" node --input-type=module -e "
const post = async b => { const t = await (await fetch(process.env.URL, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + process.env.KEY }, body: JSON.stringify(b) })).text(); const l = t.split('\n').find(x => x.startsWith('data:')); return JSON.parse(l ? l.slice(5) : t); };
await post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } } });
console.log((await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map(t => t.name).join(' '));
" 2>&1)
for tool in KNOWLEDGE_WRITE_PAGE KNOWLEDGE_READ_PAGE KNOWLEDGE_LIST_PAGES KNOWLEDGE_SEARCH; do
  case " $TOOLS " in
    *" $tool "*) ;;
    *) echo "FAIL  workspace $WS at $URL does not serve $tool"; echo "        it serves: $TOOLS"; echo "        point PROTOBOX_CACHE at a workspace whose MCP endpoint has the knowledge page tools"; exit 1 ;;
  esac
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
LOG="$WORK/step.log"
mkdir -p "$WORK/bin" "$WORK/a" "$WORK/b"
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE
STAMP=$(date +%s)
export CODELOOP_CLOUD_BOARD_TITLE="codeloop board e2e $STAMP"
export CODELOOP_CLOUD_FOLDER="codeloop-e2e-$STAMP"
GOTCHA="Cloud e2e gotcha $STAMP"

pass=0
fail=0
ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); sed "s/$KEY/<key>/g; s/^/        /" "$LOG"; }
expect() {
  local want=$1 name=$2 got=0
  shift 2
  "$@" > "$LOG" 2>&1 || got=$?
  if [ "$got" = "$want" ]; then ok "$name"; else echo "exit $got, wanted $want" >> "$LOG"; bad "$name"; fi
}
json() {
  local name=$1 expr=$2
  shift 2
  if "$@" 2> "$LOG" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!($expr)){console.error(JSON.stringify(d,null,1));process.exit(1)}" >> "$LOG" 2>&1; then ok "$name"; else bad "$name"; fi
}
# sync_entry <path under .codeloop> <js expression over `d`>: the document's record in state/sync.json.
sync_entry() { node -e "const d=JSON.parse(require('fs').readFileSync('.codeloop/state/sync.json','utf8')).documents['$1']; if(!($2)){console.error(JSON.stringify(d));process.exit(1)}"; }
# doc_state <path under .codeloop>: its state in `cloud status`.
doc_state() { codeloop cloud status --json | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).documents.find(x=>x.path==='$1')?.state)"; }
# Points the connection at a closed port, or back at the workspace.
go_offline() { node -e "const f='.codeloop/cloud.json',c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.url='http://127.0.0.1:1/mcp';require('fs').writeFileSync(f,JSON.stringify(c))"; }
go_online() { node -e "const f='.codeloop/cloud.json',c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.url='$URL';require('fs').writeFileSync(f,JSON.stringify(c))"; }
lane() {
  mkdir -p .codeloop/lanes
  printf 'capacity:\n  gates_per_day: 8\n' > .codeloop/config.yaml
  printf 'id: market\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: brief, done: { cmd: "true" } }\n  - { id: draft, done: { cmd: "true" } }\n' > .codeloop/lanes/market.yaml
}

# --- project A connects, works, and the cloud page follows ---------------------------------
cd "$WORK/a" && lane
expect 0 "A: cloud connect uploads the board" sh -c "codeloop cloud connect --url '$URL' --key '$KEY' --workspace-name e2e | tee connect.out | grep -q 'board uploaded (revision 1)'"
expect 0 "A: the key is stored but never printed" sh -c "grep -q '\"key\"' .codeloop/cloud.json && ! grep -q '$KEY' connect.out"
expect 0 "A: cloud.json, local.yaml and the sync record are gitignored" sh -c "grep -qx 'cloud.json' .codeloop/.gitignore && grep -qx 'local.yaml' .codeloop/.gitignore && grep -qx 'state/sync.json' .codeloop/.gitignore"
expect 0 "A: sync.json records a page id, revision 1 and a content hash for config.yaml and the lane" sh -c "$(declare -f sync_entry); sync_entry config.yaml 'd.pageId && d.revision===1 && /^[a-f0-9]{64}\$/.test(d.hash)' && sync_entry lanes/market.yaml 'd.kind===\"lane\" && d.pageId && d.revision===1'"
json "A: status lists the board, config and lane as in-sync" "['cards.json','config.yaml','lanes/market.yaml'].every(p=>d.documents.find(x=>x.path===p).state==='in-sync')" codeloop cloud status --json
printf 'capacity:\n  gates_per_day: 2\ntoken: e2e-local-%s\n' "$STAMP" > .codeloop/local.yaml
expect 0 "A: local.yaml overrides config.yaml on this machine" test "$(codeloop config get capacity.gates_per_day)" = 2
json "A: local.yaml is not a synced document" "!d.documents.some(x=>x.path.includes('local.yaml'))" codeloop cloud status --json
rm .codeloop/local.yaml
expect 0 "A: start a card" codeloop start "Cloud card" --lane market
expect 0 "A: next moves it" codeloop next 1
json "A: status shows the page revision matching what this checkout last saw, in sync" "d.pageRevision===d.lastSeenRevision && d.pageRevision===3 && d.inSync && d.cards===1" codeloop cloud status --json
expect 0 "A: status does not print the key" sh -c "! codeloop cloud status | grep -q '$KEY'"

# --- project B holds a stale copy ----------------------------------------------------------
cd "$WORK/b" && lane
cp "$WORK/a/.codeloop/cards.json" .codeloop/cards.json
expect 0 "B: connect adopts the existing page and does not overwrite it" sh -c "codeloop cloud connect --url '$URL' --key '$KEY' | grep -q 'already exists (revision 3)'"
cd "$WORK/a"
expect 0 "A: writes again, so B's copy is now stale" codeloop next 1
cd "$WORK/b"
json "B: a board changed only in the cloud is pulled before the next command" "d.length===1 && d[0].stage==='done'" codeloop card list --json

# --- offline: the write is kept, marked pending, and pushed first by the next command ---------
go_offline
expect 0 "B offline: the card write is kept locally with a warning" sh -c "codeloop start 'From B offline' --lane market 2>&1 | grep -q 'saved locally only'"
expect 0 "B offline: sync.json marks the board pending" sh -c "$(declare -f sync_entry); sync_entry cards.json 'd.pending===true && d.revision===4'"
go_online
expect 0 "B online: the next command pushes the pending write first" sh -c "codeloop card list 2>&1 >/dev/null | grep -q 'pushed pending cards.json (revision 5)'"
json "B: board is in sync again with nothing pending" "d.inSync && d.pageRevision===5 && d.cards===2 && !d.documents.some(x=>x.pending)" codeloop cloud status --json

# --- a pending write against a board that moved is refused ------------------------------------
go_offline
expect 0 "B offline: a second write is kept locally" codeloop start "From B, stale" --lane market
go_online
cd "$WORK/a"
expect 0 "A: writes meanwhile, so B's pending write is against an old revision" codeloop start "From A" --lane market
cd "$WORK/b"
cp .codeloop/cards.json "$WORK/b-before.json"
expect 3 "B: the pending write from the stale copy is refused with exit 3" sh -c 'codeloop start "From B" --lane market > conflict.out 2>&1'
expect 0 "B: the conflict names VERSION_CONFLICT and says to pull" sh -c "grep -q 'VERSION_CONFLICT' conflict.out && grep -q 'codeloop cloud pull' conflict.out"
expect 0 "B: the local file is unchanged after the conflict" cmp -s .codeloop/cards.json "$WORK/b-before.json"
expect 0 "B: status shows the board as both-changed" sh -c "$(declare -f doc_state); test \"\$(doc_state cards.json)\" = both-changed"
expect 0 "B: cloud pull takes the current board" codeloop cloud pull
expect 0 "B: the same write now succeeds" codeloop start "From B" --lane market
json "B: board has A's cards, B's first offline card and B's new one" "d.cards===4 && d.inSync" codeloop cloud status --json

# --- config and lanes ------------------------------------------------------------------------
cd "$WORK/a"
printf 'capacity:\n  gates_per_day: 5\n' > .codeloop/config.yaml
expect 0 "A: status shows the edited config as local-ahead" sh -c "$(declare -f doc_state); test \"\$(doc_state config.yaml)\" = local-ahead"
expect 0 "A: the next command pushes the config edit" sh -c "codeloop card list 2>&1 >/dev/null | grep -q 'pushed config.yaml (revision 2)'"
cd "$WORK/b"
expect 0 "B: status shows the config as cloud-ahead" sh -c "$(declare -f doc_state); test \"\$(doc_state config.yaml)\" = cloud-ahead"
expect 0 "B: the config A changed is pulled before the next command" test "$(codeloop config get capacity.gates_per_day 2>/dev/null)" = 5
cp .codeloop/lanes/market.yaml "$WORK/lane.orig"
echo "# edited by hand in B" >> .codeloop/lanes/market.yaml
expect 0 "B: a plain edit to a lane file is reported and not pushed" sh -c "codeloop card list 2>&1 >/dev/null | grep -q 'lanes/market.yaml was edited here and is not pushed'"
expect 0 "B: the lane page is still at revision 1" sh -c "$(declare -f sync_entry doc_state); sync_entry lanes/market.yaml 'd.revision===1' && test \"\$(doc_state lanes/market.yaml)\" = local-ahead"
cp "$WORK/lane.orig" .codeloop/lanes/market.yaml
cd "$WORK/a"
mkdir -p .codeloop/proposals/market-notes
sed 's/^version: 1/version: 2/' .codeloop/lanes/market.yaml > .codeloop/proposals/market-notes/lane.yaml
expect 0 "A: lane eval is green for the proposal" codeloop lane eval market-notes
expect 0 "A: lane promote installs version 2" codeloop lane promote market-notes --as owner
expect 0 "A: the promote pushed the lane page" sh -c "$(declare -f sync_entry); sync_entry lanes/market.yaml 'd.revision===2 && !d.pending'"
cd "$WORK/b"
expect 0 "B: the promoted lane is pulled before the next command" sh -c "codeloop lane show market 2>/dev/null | grep -q '^version: 2'"

# --- wiki ----------------------------------------------------------------------------------
cd "$WORK/a"
expect 0 "A: wiki capture writes the page to the cloud" codeloop wiki capture --title "$GOTCHA" --scope "src/**" --body "Found by the cloud e2e at $STAMP."
found() { for _ in 1 2 3 4 5 6; do codeloop cloud search "$GOTCHA" | grep -q "$GOTCHA" && return 0; sleep 2; done; return 1; }
expect 0 "KNOWLEDGE_SEARCH finds the captured page" found
expect 0 "wiki inject stays local" sh -c "codeloop wiki inject --files src/x.ts | grep -q '$GOTCHA'"

# --- a wiki page changed on both sides is kept twice and listed in the inbox ------------------
PAGE=".codeloop/wiki/gotchas/cloud-e2e-gotcha-$STAMP.md"
cd "$WORK/b"
expect 0 "B: the page A captured is pulled before the next command" sh -c "codeloop wiki list 2>/dev/null | grep -q '$GOTCHA' && test -f '$PAGE'"
echo "Added in B." >> "$PAGE"
cd "$WORK/a"
echo "Added in A." >> "$PAGE"
expect 0 "A: the next command pushes the wiki edit" sh -c "codeloop wiki list 2>&1 >/dev/null | grep -q 'pushed wiki/gotchas/cloud-e2e-gotcha-$STAMP.md (revision 2)'"
cd "$WORK/b"
expect 0 "B: inbox lists the page under what is waiting, with the cloud copy beside it" sh -c "codeloop inbox 2>/dev/null | tee inbox.out | grep -q 'wiki  $PAGE: changed here and in the cloud' && grep -q 'Waiting for you (1)' inbox.out"
expect 0 "B: both versions are on disk" sh -c "grep -q 'Added in B.' '$PAGE' && grep -q 'Added in A.' '${PAGE%.md}.cloud.md' && ! grep -q 'Added in A.' '$PAGE'"
expect 0 "B: status shows the page as both-changed" sh -c "$(declare -f doc_state); test \"\$(doc_state wiki/gotchas/cloud-e2e-gotcha-$STAMP.md)\" = both-changed"
echo "Added in A." >> "$PAGE" && rm "${PAGE%.md}.cloud.md"
expect 0 "B: with the copy merged and removed, the next command pushes the merge" sh -c "codeloop wiki list 2>&1 >/dev/null | grep -q 'pushed wiki/gotchas/cloud-e2e-gotcha-$STAMP.md (revision 3)'"
cd "$WORK/a"
expect 0 "A: the merged page is pulled before the next command" sh -c "codeloop wiki list > /dev/null 2>&1 && grep -q 'Added in B.' '$PAGE'"

# --- disconnect restores the repo files ----------------------------------------------------
go_offline
expect 0 "A offline: a card write is kept locally" codeloop start "A, last offline" --lane market
go_online
expect 0 "A: disconnect pushes the pending write, pulls everything back and removes cloud.json" codeloop cloud disconnect
expect 0 "A: cloud.json and the sync record are gone" test ! -e .codeloop/cloud.json -a ! -e .codeloop/state/sync.json
json "A: cards.json now holds the board both checkouts wrote" "d.length===5 && d.some(c=>c.title==='From B') && d.some(c=>c.title==='A, last offline')" codeloop card list --json
expect 0 "A: the wiki page file is in the repo" sh -c "grep -rq '$GOTCHA' .codeloop/wiki/gotchas"
expect 0 "A: a card write after disconnect is local only" codeloop start "Local again" --lane market
cd "$WORK/b"
json "B: the write A pushed on disconnect is pulled before the next command" "d.length===5 && d.some(c=>c.title==='A, last offline')" codeloop card list --json
json "B: the cloud board did not change after A disconnected" "d.cards===5 && d.inSync" codeloop cloud status --json

echo
echo "workspace $WS, board page \"$CODELOOP_CLOUD_BOARD_TITLE\""
if [ "$fail" = 0 ]; then echo "CLOUD E2E PASS: $pass steps passed, 0 failed"; else echo "CLOUD E2E FAIL: $pass passed, $fail failed"; exit 1; fi
