#!/usr/bin/env bash
# A founder's week with codeloop, start to finish, in a fresh temp project.
#   npm run build && bash scripts/demo-founder-week.sh
# A scripted stand-in plays the coding agent (as in scripts/e2e-founder-loop.sh). When a local Protobox
# answers on $PROTOBOX_MCP_PORT (default 4002) the project is connected to it; otherwise it runs local only.
# Every step checks what it claims: the first mismatch prints the evidence and exits 1.
# A saved run is in docs/artifacts/demo-founder-week.txt.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }

WORK="$(mktemp -d)"
SERVER_PID=""
trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null; rm -rf "$WORK"' EXIT
LOG="$WORK/step.log"
PROJECT="$WORK/exportly"
mkdir -p "$WORK/bin" "$WORK/site" "$PROJECT"
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE
cd "$PROJECT"

# --- output and assertions -------------------------------------------------------------------
claims=0
KEY=""
hide() { if [ -n "$KEY" ]; then sed "s/$KEY/<key>/g"; else cat; fi; }
die() { echo "  FAIL $1"; [ -f "$LOG" ] && hide < "$LOG" | sed 's/^/         /'; echo; echo "DEMO FAILED after $claims passed checks"; exit 1; }
ok() { echo "  ok   $1"; claims=$((claims + 1)); }
day() { echo; echo "== $1 =="; }
say() { echo; echo "$1"; }
# claim <what is claimed> <command...>: the command must exit 0.
claim() { local name=$1; shift; if "$@" > "$LOG" 2>&1; then ok "$name"; else die "$name"; fi; }
# claim_json <what is claimed> <js expression over `d`> <command...>: the command's JSON must satisfy it.
claim_json() {
  local name=$1 expr=$2; shift 2
  if "$@" 2> "$LOG" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!($expr)){console.error(JSON.stringify(d,null,1).slice(0,3000));process.exit(1)}" >> "$LOG" 2>&1; then ok "$name"; else die "$name"; fi
}
# show <command...>: prints the command and what it printed.
show() {
  local shown="" a
  for a in "$@"; do case "$a" in *' '*) shown="$shown \"$a\"" ;; *) shown="$shown $a" ;; esac; done
  echo "  \$$shown"
  "$@" 2>&1 | hide | sed 's/^/      /'
}
# card_id <lane> <title fragment>: the newest card in the lane whose title contains the fragment.
card_id() { CODELOOP_NO_SYNC=1 codeloop card list --json 2>/dev/null | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')).filter(c=>c.lane===process.argv[1]&&c.title.includes(process.argv[2])).at(-1); if(!c)process.exit(1); console.log(c.id)" "$1" "$2"; }
# The checks below read the board many times. They skip the sync step every codeloop command does
# when the cloud is on, because the workspace allows 60 requests a minute; what the founder and
# the schedule type still syncs.
card() { CODELOOP_NO_SYNC=1 codeloop card show "$1" --json; }
cards() { CODELOOP_NO_SYNC=1 codeloop card list --json; }

# --- the simulated clock: every command and every event carries this time ----------------------
at() { export CODELOOP_NOW="$1"; }
tick() { CODELOOP_NOW=$(node -e "const d=new Date(process.argv[1]);d.setMinutes(d.getMinutes()+30);const p=n=>String(n).padStart(2,'0');console.log(d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())+':00')" "$CODELOOP_NOW"); export CODELOOP_NOW; }
hm() { echo "${CODELOOP_NOW:11:5}"; }

# --- the people -------------------------------------------------------------------------------
approvals=0
rejections=0
# owner approve|reject <card> [note]: what the founder types. Counted, and checked against the cards at the end.
owner() {
  local verb=$1 id=$2 out; shift 2
  if [ "$verb" = approve ]; then approvals=$((approvals + 1)); else rejections=$((rejections + 1)); fi
  echo "  \$ codeloop $verb $id${1:+ \"$1\"}"
  out=$(codeloop "$verb" "$id" "$@" --as owner 2>&1) || { echo "$out" > "$LOG"; die "codeloop $verb $id"; }
  echo "$out" | hide | sed 's/^/      /'
}
# The schedule: `codeloop run --agent` every 30 minutes until a run starts no agent and moves nothing.
schedule() {
  local i=0 out seen="$WORK/seen.$$"
  : > "$seen"
  while :; do
    out=$(codeloop run --agent 2>&1) || { echo "$out" > "$LOG"; die "codeloop run --agent at $CODELOOP_NOW"; }
    if echo "$out" | grep -q ': stuck'; then echo "$out" > "$LOG"; die "a card is stuck at $CODELOOP_NOW"; fi
    echo "$out" | grep -E 'created |agent fake ran|: (moved|done|waiting for you)$|not started|skipped ' | sed -E 's/ \(exit 0, [0-9]+s, [^)]*\)//; s/^ +//' | while IFS= read -r line; do
      # A reason a card is held back is said once per stretch, not on every run.
      case "$line" in *'not started'*|skipped*) grep -qxF "$line" "$seen" && continue; echo "$line" >> "$seen" ;; esac
      echo "      $(hm)  $line"
    done
    tick
    echo "$out" | grep -qE 'created |agent fake ran|: (moved|done)$' || break
    i=$((i + 1))
    [ "$i" -lt 20 ] || { echo "$out" > "$LOG"; die "the schedule did not settle in 20 runs"; }
  done
  rm -f "$seen"
}

# =============================================================================================
day "Setup, Sunday evening"
at "2026-10-04T18:00:00"

claim "codeloop init installs the 8 shipped lanes; none is edited for this demo" sh -c "codeloop init --tools claude --starter generic && test \"\$(ls .codeloop/lanes/*.yaml | wc -l | tr -d ' ')\" = 8 && codeloop lane lint"
perl -pi -e 's/name: "my-project"/name: "exportly"/' .codeloop/config.yaml

# A small product: one function the build card has to write, and the test that proves it.
cat > package.json <<'JSON'
{ "name": "exportly", "private": true, "scripts": { "test": "node test.js" } }
JSON
cat > test.js <<'JS'
const assert = require('assert');
const { toCsv } = require('./src/export.js');
assert.strictEqual(toCsv([{ id: 1, name: 'Ada' }, { id: 2, name: 'Lin' }]), 'id,name\n1,Ada\n2,Lin\n');
console.log('export: 1 test passed');
JS
mkdir -p fixtures
cat > fixtures/issues.md <<'MD'
# Open issues
- #12 Dark theme for the dashboard
- #15 Export invoices as CSV
- #19 Dark theme for the dashboard
MD

# Stands in for a headless coding agent: reads the stage brief on stdin and writes what the stage asks for.
cat > fake-agent.sh <<'SH'
#!/bin/sh
brief=$(cat)
field() { printf '%s\n' "$brief" | sed -n "s/^$1: //p" | head -1; }
card=$(field Card); stage=$(field Stage); out=$(field Output); lane=$(field Lane | cut -d' ' -f1)
feedback=$(printf '%s\n' "$brief" | grep -E '^- (Stage note|Latest rejection|Earlier rejection): ')
rival=$(printf '%s\n' "$brief" | sed -n 's/^### \(.*\) (\.codeloop\/wiki\/competitors\/.*$/\1/p' | head -1)
rival_log=$(printf '%s\n' "$brief" | sed -n 's/^Changelog: //p' | head -1)
nnn=$(printf '%03d' "$(printf '%s' "$card" | tr -cd '0-9' | sed 's/^0*//')")
spec=$(ls -d specs/"$nnn"-* 2>/dev/null | head -1)
[ -n "$out" ] && mkdir -p "$(dirname "$out")"
echo "fake agent: $lane/$stage for $card"
case "$lane/$stage" in
  triage/capture) echo "sources: fixtures/issues.md, $(grep -c '^- #' fixtures/issues.md) open issues" > "$out" ;;
  triage/classify) { echo "category: feature-request"; sed -n 's/^- #\([0-9]*\) \(.*\)$/- #\1 feature-request: \2/p' fixtures/issues.md; } > "$out" ;;
  triage/dedupe) { echo "duplicates:"; sed -n 's/^- #\([0-9]*\) \(.*\)$/\1|\2/p' fixtures/issues.md | awk -F'|' 'seen[$2] { print "- #" $1 " repeats #" seen[$2] } !seen[$2] { seen[$2] = $1 }'; } > "$out" ;;
  triage/file)
    echo "proposals:" > "$out"
    sed -n 's/^- #\([0-9]*\) \(.*\)$/\1|\2/p' fixtures/issues.md | awk -F'|' '!seen[$2]++' | while IFS='|' read -r n title; do
      codeloop card propose plan "$title" --source "issues/$n" --description "Asked for in issue #$n." | head -1 | sed 's/^/- /' >> "$out"
    done ;;
  plan/gather) printf 'signals:\n- the card itself: %s\n- open proposals in the inbox\n' "$(field Title)" > "$out" ;;
  plan/research) printf '| %s | Ships bulk CSV export with scheduled delivery | %s |\n\nverdict: build\n' "${rival:-nobody}" "${rival_log:-none}" > "$out" ;;
  plan/rank) echo "rice: reach 400, impact 2, confidence 0.8, effort 3, score 213" > "$out" ;;
  plan/story) printf 'acceptance:\n- US1 Given a list with rows, when I press Export, then a CSV file with a header row downloads.\n' > "$out" ;;
  build/research)
    printf '| %s | Export button in the list toolbar, CSV only | %s |\n\n- source: %s — their release note for bulk export\n- source: https://example.test/forum/export-requests — eleven customers asked for it\n- source: https://example.test/support/tickets?tag=export — the workaround support gives today\n\nverdict: build\n' "$rival" "$rival_log" "$rival_log" >> "$out" ;;
  build/mock)
    perl -0pi -e 's/^screens:.*$/screens:\n- export-dialog\n- export-done/m' "$spec/spec.md"
    codeloop mock new "$card" --topic exports > /dev/null
    mock=$(ls docs/mocks/*/exports/"$card".html)
    perl -0pi -e 's#</main>#<section data-screen="export-dialog"><h2>Export dialog</h2><div class="frame"><div class="field"><label>Columns</label><select><option>All columns</option></select></div><div class="row"><button class="button">Export CSV</button><button class="button quiet">Cancel</button></div></div><p class="note">Opens from the list toolbar.</p></section>\n<section data-screen="export-done"><h2>Export done</h2><div class="frame"><span class="badge ok">Ready</span><p>invoices.csv, 214 rows</p></div></section>\n</main>#' "$mock" ;;
  build/spec)
    perl -pi -e 's/^Story: .*/Story: as an ops lead I can export any list to CSV, so that I can share it outside the app./; s/^- US1 .*/- US1 Given a list with rows, when I press Export, then a CSV file with a header row downloads./' "$spec/spec.md"
    printf -- '- [ ] T001 [US1] [api] toCsv in src/export.js\n- [ ] T002 [US1] [ui] Export dialog and done screen as drawn in the mock\n' >> "$out" ;;
  build/build)
    mkdir -p src
    printf "exports.toCsv = rows => [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\\\\n') + '\\\\n';\n" > src/export.js
    codeloop task done "$card" T001 && codeloop task done "$card" T002 ;;
  build/verify)
    mkdir -p "usecases/$nnn"
    printf 'id: uc-1\naccept: US1\nfailure_mode: "the CSV has no header row or drops a row"\nlayers:\n  cli: { run: "node test.js", expect: { exit: 0 } }\n' > "usecases/$nnn/uc-1.yaml" ;;
  build/review) printf 'Read the diff: one function, one test, no new dependency.\n\nverdict: approve\n' > "$out" ;;
  build/staging|deploy/staging|deploy/verify|deploy/smoke) echo "result: pass" > "$out" ;;
  build/live|deploy/prod) printf 'Released to production.\n\nresult: pass\n' > "$out" ;;
  market/brief) printf 'audience: ops leads who paste lists into spreadsheets\nclaim: any list, exported in one click\nmetric: signups from the launch post\n' > "$out" ;;
  market/draft)
    {
      case "$feedback" in *customer*) echo "An ops lead should not retype an invoice list." ;; *) echo "Export is here." ;; esac
      echo "claim: any list, exported in one click"
      # The number goes in only once someone has asked for it: in a rejection, or in the lane's notes.
      case "$feedback" in *number*) echo "proof: 214 rows exported in 0.4 seconds in our test run" ;; esac
    } > "$out" ;;
  market/publish) echo "url: https://example.test/blog/$card" > "$out" ;;
  market/measure) printf '37 exports in the first week.\n\nverdict: keep\n' > "$out" ;;
  analyze/pull) echo "north_star: weekly_exports 37" > "$out" ;;
  analyze/compare) echo "delta: +37 exports against 0 last week" > "$out" ;;
  analyze/judge) echo "verdict: keep the launch post, the export is being used" > "$out" ;;
  analyze/findings) printf 'findings:\n- 31 of 37 exports came from the invoices list; the other lists are barely exported.\n' > "$out" ;;
  *) echo "fake agent: no script for $lane/$stage"; exit 3 ;;
esac
SH
chmod +x fake-agent.sh

# The agent command is a path on this machine, so it goes in local.yaml, which is never synced.
cat > .codeloop/local.yaml <<'YAML'
agents:
  default: fake
  fake: { cmd: "./fake-agent.sh < {brief}", timeout_minutes: 2, max_runs_per_day: 100 }
YAML
claim "the agent is configured in local.yaml and codeloop reads it over config.yaml" sh -c "test \"\$(codeloop config get agents.default)\" = fake && grep -qx local.yaml .codeloop/.gitignore"
git init -q && git -c user.name=demo -c user.email=demo@example.test -c commit.gpgsign=false commit -q --allow-empty -m "start"

# --- cloud, when a local Protobox is up --------------------------------------------------------
PORT="${PROTOBOX_MCP_PORT:-4002}"
CACHE="${PROTOBOX_CACHE:-$HOME/Projects/protobox/.caches/protobox.json}"
CLOUD=off
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && [ -f "$CACHE" ]; then
  WS=$(node -e "console.log(require('$CACHE').test_workspace.id)")
  KEY=$(node -e "console.log(require('$CACHE').api_key)")
  STAMP=$(date +%s)
  export CODELOOP_CLOUD_BOARD_TITLE="codeloop demo $STAMP" CODELOOP_CLOUD_FOLDER="codeloop-demo-$STAMP"
  claim "cloud connect uploads the board, config.yaml and the 8 lanes to the local Protobox" sh -c "codeloop cloud connect --url 'http://localhost:$PORT/api/mcp/$WS' --key '$KEY' --workspace-name demo | grep -q 'board uploaded (revision 1)'"
  claim_json "cloud status: 10 documents, all in sync, and local.yaml is not one of them" "d.documents.length===10 && d.documents.every(x=>x.state==='in-sync') && !d.documents.some(x=>x.path.includes('local'))" codeloop cloud status --json
  CLOUD=on
  echo "  cloud: ON, workspace $WS on localhost:$PORT, board page \"$CODELOOP_CLOUD_BOARD_TITLE\""
else
  echo "  cloud: OFF, no local Protobox on port $PORT; this run is local files only"
fi

# --- one competitor, whose changelog is a page served on this machine ---------------------------
printf '# Rivalsoft changelog\n\n## September\n- Faster search\n' > "$WORK/site/changelog.md"
node -e "require('http').createServer((q,s)=>s.writeHead(200,{'content-type':'text/markdown'}).end(require('fs').readFileSync(process.argv[1]))).listen(0,'127.0.0.1',function(){console.log(this.address().port)})" "$WORK/site/changelog.md" > "$WORK/site/port" &
SERVER_PID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$WORK/site/port" ] && break; sleep 0.3; done
SITE="http://127.0.0.1:$(cat "$WORK/site/port")"
claim "the competitor gets a wiki page with its docs and changelog links" sh -c "codeloop wiki competitor add rivalsoft --title Rivalsoft --docs $SITE/docs --changelog $SITE/changelog && grep -q '^changelog: $SITE/changelog' .codeloop/wiki/competitors/rivalsoft.md"
claim "the first scan only stores what the changelog says today" sh -c "codeloop scan competitors | grep -q 'rivalsoft: first scan; stored as the baseline' && test \"\$(codeloop card list --json | node -e \"console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).length)\")\" = 0"

# =============================================================================================
day "Sunday night: nobody is at the keyboard"
at "2026-10-04T20:05:00"
say "The schedule runs \`codeloop run --agent\` every 30 minutes. The triage lane is due at 20:00."
schedule
TRIAGE=$(card_id triage "triage 2026-10-04") || die "no triage card was created"
claim_json "the triage card went through capture, classify, dedupe and file on four agent runs, and waits at its gate" "d.stage==='file' && d.gate==='proposals' && d.events.filter(e=>e.action==='agent-run').length===4" card "$TRIAGE"
claim_json "triage proposed one card per distinct issue: two cards from three issues, each naming its issue" "d.filter(c=>c.stage==='proposed').length===2 && d.filter(c=>c.stage==='proposed').every(c=>c.lane==='plan' && /^issues\/\d+$/.test(c.source) && c.gate==='proposal')" cards
claim "the duplicate issue was named, not proposed twice" grep -q '^- #19 repeats #12' "triage/$TRIAGE/deduped.md"

say "Monday 06:40: Rivalsoft publishes a release. The scan lane is due at 07:00."
printf '# Rivalsoft changelog\n\n## Bulk CSV export\n- Export any list to CSV\n- Scheduled exports by email\n\n## September\n- Faster search\n' > "$WORK/site/changelog.md"
at "2026-10-05T07:05:00"
schedule
SCAN=$(card_id scan "scan 2026-10-05") || die "no scan card was created"
RIVAL=$(card_id plan "Rivalsoft shipped") || die "the scan proposed nothing"
claim_json "the scan card is done, with no agent: its stage is the scan command" "d.stage==='done' && !d.events.some(e=>e.action==='agent-run')" card "$SCAN"
claim_json "the scan proposed one card: what shipped, the new lines and the source" "d.title==='Rivalsoft shipped: Bulk CSV export' && d.stage==='proposed' && d.description.includes('- Scheduled exports by email') && !d.description.includes('Faster search') && d.source==='$SITE/changelog'" card "$RIVAL"
claim "scanning again proposes nothing new" sh -c "codeloop scan competitors | grep -q 'rivalsoft: nothing new'"
claim_json "nothing started any proposal overnight: three proposals, none of them moved" "d.filter(c=>c.stage==='proposed').length===3 && d.filter(c=>c.stage==='proposed').every(c=>c.events.length===1)" cards

# =============================================================================================
day "Monday morning: the founder's ten minutes"
show codeloop inbox
claim_json "the inbox has four things waiting: the triage batch and three proposals" "d.needs_you.length===4 && d.needs_you.filter(n=>n.gate==='proposal').length===3" codeloop inbox --json
DARK=$(card_id plan "Dark theme") || die "no dark theme proposal"
say "The founder passes the triage batch, promotes the competitor card and drops the dark theme."
owner approve "$TRIAGE"
owner approve "$RIVAL"
owner reject "$DARK" "not this quarter"
claim_json "the triage card is done" "d.stage==='done'" card "$TRIAGE"
claim_json "the promoted card is in the plan lane's first stage and nothing has run on it yet" "d.stage==='gather' && !d.gate && d.events.at(-1).action==='promote' && d.events.at(-1).actor==='owner'" card "$RIVAL"
claim_json "the rejected proposal is dropped; the invoice one still waits" "d.find(c=>c.id==='$DARK').stage==='dropped' && d.filter(c=>c.stage==='proposed').length===1" cards

say "The plan lane works the promoted card: gather, research, rank, story."
schedule
claim_json "plan stopped at the backlog gate with the story written" "d.stage==='story' && d.gate==='backlog'" card "$RIVAL"
claim "the card was ranked" grep -q '^rice: .*score 213' "plan/$RIVAL/ranked.md"
claim "plan's research stage put its Rivalsoft finding on the competitor page" grep -q "^- $RIVAL Rivalsoft shipped: Bulk CSV export: Ships bulk CSV export" .codeloop/wiki/competitors/rivalsoft.md
claim_json "the weekly plan card (Monday 09:00) was held back: the lane works on one card at a time" "!d.some(c=>c.lane==='plan' && c.title==='plan 2026-10-05')" cards
owner approve "$RIVAL"
claim_json "the plan card is done" "d.stage==='done'" card "$RIVAL"

# =============================================================================================
day "Monday: one feature, from research to the spec gate"
say "The founder starts the build card. Agents take it through research, mock and spec."
show codeloop start "Bulk CSV export" --as owner
BUILD=$(card_id build "Bulk CSV export") || die "no build card"
NNN=$(printf '%03d' "$(echo "$BUILD" | tr -cd '0-9' | sed 's/^0*//')")
SPEC=$(ls -d specs/"$NNN"-*)
MOCK="docs/mocks/exportly/exports/$BUILD.html"
claim "the research check refuses the empty template" sh -c "! codeloop check research $BUILD"
schedule
WEEKLY=$(card_id plan "plan 2026-10-05") || die "the weekly plan card never started"
claim_json "the build card went research, mock, spec on three agent runs and stopped at the spec gate" "d.stage==='spec' && d.gate==='spec' && d.awaiting==='owner' && d.events.filter(e=>e.action==='agent-run').map(e=>e.stage).join()==='research,mock,spec'" card "$BUILD"
claim "research cites three sources and a verdict" codeloop check research "$BUILD" --min-sources 3
claim "the build card's Rivalsoft finding joined the plan card's on the competitor page" sh -c "grep -q '^- $BUILD Bulk CSV export: Export button in the list toolbar' .codeloop/wiki/competitors/rivalsoft.md && grep -q '^- $RIVAL Rivalsoft shipped' .codeloop/wiki/competitors/rivalsoft.md && test \"\$(grep -c '^- $BUILD ' .codeloop/wiki/competitors/rivalsoft.md)\" = 1"
claim "the mock is built from the shared template and draws both screens the spec names" sh -c "codeloop check mock $BUILD && grep -q 'data-screen=\"export-dialog\"' $MOCK && grep -q 'data-screen=\"export-done\"' $MOCK"
claim "the mock gallery lists it" sh -c "codeloop mocks index | grep -q '1 mock' && grep -q 'exportly/exports/$BUILD.html' docs/mocks/index.html"
claim_json "the weekly plan card started once the lane was free, and waits at its backlog gate" "d.stage==='story' && d.gate==='backlog'" card "$WEEKLY"
show codeloop inbox
claim "the inbox shows the spec to read and the mock path beside it" sh -c "codeloop inbox | grep -A2 '$BUILD  Bulk CSV export: build/spec, gate' | grep -q 'mock: $MOCK'"
claim "an agent cannot approve the gate" sh -c "! codeloop approve $BUILD --as agent"
owner approve "$BUILD"
owner approve "$WEEKLY"

# =============================================================================================
day "Monday afternoon: build, verify, review"
claim "before the agent builds, the product's test fails" sh -c "! npm test --silent"
schedule
claim_json "the agent built it and verify passed; the card waits at the local gate" "d.stage==='verify' && d.gate==='local' && d.evidence.includes('evidence/$NNN/verify.md')" card "$BUILD"
claim "the evidence says pass and names the use case" sh -c "grep -q 'result: pass' evidence/$NNN/verify.md && test -f evidence/$NNN/uc-1.json && npm test --silent | grep -q '1 test passed'"
show sed -n 1,12p "evidence/$NNN/verify.md"
owner approve "$BUILD"
schedule
claim_json "the review is written and the card waits for a reviewer, not the owner" "d.stage==='review' && d.gate==='pr' && d.awaiting==='reviewer'" card "$BUILD"
claim "the owner cannot pass the reviewer's gate" sh -c "! codeloop approve $BUILD --as owner"
echo "  \$ codeloop approve $BUILD --as reviewer"
approvals=$((approvals + 1))
claim "the reviewer approves and the card moves to staging" sh -c "codeloop approve $BUILD --as reviewer | grep -q '$BUILD moved to staging'"

# =============================================================================================
day "Monday, later: release. Public steps wait before they act"
say "The merge is tagged v0.1.0, which starts a card in the deploy lane."
git add -A && git -c user.name=demo -c user.email=demo@example.test -c commit.gpgsign=false commit -q -m "feat: bulk csv export" && git tag v0.1.0
schedule
DEPLOY=$(card_id deploy "deploy v0.1.0") || die "the tag started no deploy card"
claim_json "deploy did staging and verify, then stopped on entering prod" "d.stage==='prod' && d.gate==='prod' && d.events.filter(e=>e.action==='agent-run').map(e=>e.stage).join()==='staging,verify'" card "$DEPLOY"
claim "nothing was released: the prod step has not run and no agent was started for it" sh -c "test ! -e deploy/$DEPLOY/prod.md && codeloop inbox | grep -A1 '$DEPLOY  deploy v0.1.0' | grep -q 'not run yet (public step, approve first)'"
claim_json "the build card's own live stage waits the same way" "d.stage==='live' && d.gate==='prod'" card "$BUILD"
claim "its prod evidence does not exist either" test ! -e "evidence/$NNN/prod.md"
owner approve "$DEPLOY"
schedule
claim_json "after the approval the agent released and smoke-tested; the deploy card is done" "d.stage==='done' && d.events.filter(e=>e.action==='agent-run').map(e=>e.stage).join()==='staging,verify,prod,smoke'" card "$DEPLOY"
claim "the release evidence exists now" grep -q 'result: pass' "deploy/$DEPLOY/prod.md"
owner approve "$BUILD"
schedule
MARKET=$(card_id market "Bulk CSV export") || die "no market card started when the build card finished"
claim_json "the build card is done" "d.stage==='done'" card "$BUILD"
claim_json "a market card started by itself when it finished; nobody typed a command" "d.events[0].actor==='engine' && d.events[0].note==='started by $BUILD finishing lane build'" card "$MARKET"
claim_json "the agent wrote the brief and the launch post; the post waits at the copy gate" "d.stage==='draft' && d.gate==='copy'" card "$MARKET"

# =============================================================================================
day "Tuesday: the launch post is rejected once, redone, approved, published"
at "2026-10-06T08:00:00"
show cat "marketing/$MARKET/blog.md"
owner reject "$MARKET" "No number behind the claim: cite the measured export time."
schedule
claim_json "the next run gave the stage back to the agent with the note, and the post waits again" "d.stage==='draft' && d.gate==='copy' && d.events.filter(e=>e.action==='agent-run' && e.stage==='draft').length===2" card "$MARKET"
claim "the redone post has what the note asked for" grep -q '^proof: 214 rows exported in 0.4 seconds' "marketing/$MARKET/blog.md"
show cat "marketing/$MARKET/blog.md"
TRIAGE2=$(card_id triage "triage 2026-10-05") || die "Monday night's triage card is missing"
claim_json "Monday night's triage found the same issues and proposed nothing twice, not even the dropped one" "d.filter(c=>c.source && c.source.startsWith('issues/')).length===2" cards
owner approve "$MARKET"
claim_json "publishing is a public step: the card entered it and waits before anything is posted" "d.stage==='publish' && d.gate==='publish'" card "$MARKET"
claim "nothing is published yet" test ! -e "marketing/$MARKET/published.md"
owner approve "$MARKET"
owner approve "$TRIAGE2"
schedule
claim_json "published, measured, done" "d.stage==='done'" card "$MARKET"
claim "the published URL is recorded" grep -q "^url: https://example.test/blog/$MARKET" "marketing/$MARKET/published.md"

# =============================================================================================
day "Friday: the weekly growth review"
at "2026-10-09T09:05:00"
schedule
ANALYZE=$(card_id analyze "analyze 2026-10-09") || die "no analyze card on Friday"
claim_json "analyze pulled the numbers and compared them, and waits for the founder's verdicts" "d.stage==='judge' && d.gate==='verdicts'" card "$ANALYZE"
owner approve "$ANALYZE"
schedule
claim_json "analyze is done" "d.stage==='done'" card "$ANALYZE"
claim "it wrote its findings" grep -q '^- 31 of 37 exports came from the invoices list' "growth/$ANALYZE/findings.md"
FOLLOW=$(card_id plan "analyze 2026-10-09") || die "the findings opened no plan card"
claim_json "the findings opened exactly one plan card, linked to the analyze card that produced them" "d.filter(c=>c.lane==='plan' && c.events[0].note==='started by $ANALYZE finishing lane analyze').length===1" cards
claim_json "the plan lane has already taken it to the backlog gate" "d.stage==='story' && d.gate==='backlog'" card "$FOLLOW"

# =============================================================================================
day "Friday afternoon: the same gate is rejected again, so the lane changes"
show codeloop start "October changelog post" --lane market --as owner
POST=$(card_id market "October changelog post") || die "no second market card"
schedule
claim_json "the second post waits at the copy gate" "d.stage==='draft' && d.gate==='copy'" card "$POST"
claim "its first draft has no number either: Tuesday's lesson was only in a rejection note" sh -c "! grep -q '^proof:' marketing/$POST/blog.md"
owner reject "$POST" "Lead with the customer, not the feature."
claim "one more rejection is not enough for a proposal" sh -c "codeloop lane propose | grep -q 'no proposals'"
schedule
claim "the redo leads with the customer" grep -q '^An ops lead should not retype' "marketing/$POST/blog.md"
owner reject "$POST" "No number behind the claim, again."
say "Three rejections at market/draft on lane version 1. codeloop proposes a change to the lane."
show codeloop lane propose
P=.codeloop/proposals/market-draft-1
claim "the proposal cites both cards and all three notes, and carries them into the stage as notes" sh -c "grep -q '$MARKET' $P/why.md && grep -q '$POST' $P/why.md && grep -c 'No number behind the claim' $P/lane.yaml | grep -q 2 && grep -q '^version: 2' $P/lane.yaml"
say "The founder also tightens the check, and says how the new check can fail."
perl -pi -e "s/--has 'claim:'/--has 'claim:' 'proof:'/ if /blog\.md/" $P/lane.yaml
cat > $P/eval.yaml <<'YAML'
fixtures:
  - name: claim-without-proof
    setup: "mkdir -p marketing/eval-001 && echo 'claim: x' > marketing/eval-001/blog.md"
    expect: fail
  - name: claim-with-proof
    setup: "mkdir -p marketing/eval-001 && printf 'claim: x\nproof: y\n' > marketing/eval-001/blog.md"
    expect: pass
YAML
claim "the proposal now requires a proof line in the post" grep -q "blog.md --has 'claim:' 'proof:'" $P/lane.yaml
claim "promote is refused before the eval" sh -c "! codeloop lane promote market-draft-1 --as owner"
show codeloop lane eval market-draft-1
claim_json "eval is green: the new check fails its broken fixture, passes its good one, and Tuesday's published post still passes" "d.green && d.fixtures.length===2 && d.replayed.some(r=>r.card==='$MARKET' && r.passed)" cat $P/eval-result.json
claim "an agent cannot promote a lane change" sh -c "! codeloop lane promote market-draft-1 --as agent"
echo "  \$ codeloop lane promote market-draft-1"
lane_promotions=1
claim "the owner promotes it" sh -c "codeloop lane promote market-draft-1 --as owner | grep -q 'lane market promoted from v1 to v2'"
claim "the market lane is at version 2 and version 1 is kept" sh -c "codeloop lane show market | grep -q '^version: 2' && test -f .codeloop/lanes/.history/market.v1.yaml"
[ "$CLOUD" = on ] && claim "the promoted lane was pushed to the cloud page; the proposal's edits never were" sh -c "node -e \"const d=JSON.parse(require('fs').readFileSync('.codeloop/state/sync.json','utf8')).documents['lanes/market.yaml']; process.exit(d.revision===2 && !d.pending ? 0 : 1)\""
schedule
claim "the agent's next brief carried the lane's notes, and the post now passes the stricter check" sh -c "grep -q '^proof:' marketing/$POST/blog.md && grep -q 'Stage note: No number behind the claim' .codeloop/state/briefs/$POST-draft.md"
owner approve "$POST"
claim_json "the second post is approved and waits before publishing; it is left for Monday" "d.stage==='publish' && d.gate==='publish'" card "$POST"

# =============================================================================================
day "Friday, end of the week"
show codeloop inbox
claim_json "four things wait: the second post's publish step, Thursday night's triage batch, the new plan card and the invoice proposal" "d.needs_you.map(n=>n.gate).sort().join()==='backlog,proposal,proposals,publish'" codeloop inbox --json
show codeloop stats
show codeloop stats --lane market --compare v1 v2
if [ "$CLOUD" = on ]; then
  show codeloop cloud status
  claim_json "every document is in sync with the cloud and nothing is pending" "d.inSync && d.documents.every(x=>x.state==='in-sync' && !x.pending) && d.documents.some(x=>x.path==='wiki/competitors/rivalsoft.md')" codeloop cloud status --json
fi

# --- the week in numbers, taken from the cards and checked against what this script did --------
codeloop card list --json 2>/dev/null > "$WORK/cards.json"
codeloop lane list 2>/dev/null > "$WORK/lanes.txt"
node -e "
const cards = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
const [approvals, rejections, lanePromotions, cloud] = process.argv.slice(3);
const events = cards.flatMap(c => c.events);
const human = a => events.filter(e => e.human && a.includes(e.action)).length;
const byLane = {};
for (const c of cards) ((byLane[c.lane] ??= {})[c.gate ? c.stage + ' (waiting: ' + c.gate + ')' : c.stage] ??= []).push(c.id);
const lanes = require('fs').readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => l.trim().split(/\s+/)).map(([id, v]) => id + ' ' + v);
const out = [];
out.push('SUMMARY');
out.push('  cloud: ' + cloud);
out.push('  cards: ' + cards.length + ' (' + cards.filter(c => c.stage === 'done').length + ' done)');
for (const lane of Object.keys(byLane).sort()) out.push('    ' + lane.padEnd(8) + Object.entries(byLane[lane]).map(([stage, ids]) => stage + ' ' + ids.length).join(', '));
out.push('  human approvals: ' + (human(['approve', 'promote']) + Number(lanePromotions)) + ' (' + human(['approve']) + ' gates, ' + human(['promote']) + ' proposal promoted, ' + lanePromotions + ' lane change)');
out.push('  human rejections: ' + human(['reject']));
out.push('  agent runs: ' + events.filter(e => e.action === 'agent-run').length);
out.push('  lane versions: ' + lanes.join(', '));
console.log(out.join('\n'));
const mismatch = [];
if (human(['approve', 'promote']) !== Number(approvals)) mismatch.push('approvals typed ' + approvals + ', on the cards ' + human(['approve', 'promote']));
if (human(['reject']) !== Number(rejections)) mismatch.push('rejections typed ' + rejections + ', on the cards ' + human(['reject']));
if (events.some(e => e.action === 'stuck')) mismatch.push('a card was stuck during the week');
if (events.some(e => e.action === 'agent-run' && e.exit !== 0)) mismatch.push('an agent run exited non-zero');
if (mismatch.length) { console.error(mismatch.join('; ')); process.exit(1); }
" "$WORK/cards.json" "$WORK/lanes.txt" "$approvals" "$rejections" "${lane_promotions:-0}" "$([ "$CLOUD" = on ] && echo "on (local Protobox, workspace $WS)" || echo "off (local files only)")" > "$LOG" 2>&1 || die "the summary does not match what was typed this week"
echo
cat "$LOG"
ok "the approvals and rejections on the cards are exactly the ones the founder typed"
echo
echo "DEMO PASS: $claims checks passed, 0 failed"
