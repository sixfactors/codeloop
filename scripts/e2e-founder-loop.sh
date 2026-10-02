#!/usr/bin/env bash
# End-to-end proof of the lane engine, run against the built CLI in a fresh temp project.
#   npm run build && bash scripts/e2e-founder-loop.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }

WORK="$(mktemp -d)"
SERVE_PIDS=""
trap 'for p in $SERVE_PIDS; do kill "$p" 2>/dev/null; done; rm -rf "$WORK"' EXIT
LOG="$WORK/step.log"
PROJECT="$WORK/project"
mkdir -p "$WORK/bin" "$PROJECT"

# Lane done.cmd lines call `codeloop`, so the built CLI has to be on PATH under that name.
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE
cd "$PROJECT"

pass=0
fail=0
ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); sed 's/^/        /' "$LOG"; }

# expect <exit code> <step name> <command...>
expect() {
  local want=$1 name=$2 got=0
  shift 2
  "$@" > "$LOG" 2>&1 || got=$?
  if [ "$got" = "$want" ]; then ok "$name"; else echo "exit $got, wanted $want" >> "$LOG"; bad "$name"; fi
}

# json <step name> <js expression over `d`> <command...>: the command's JSON output must satisfy the expression.
json() {
  local name=$1 expr=$2
  shift 2
  if "$@" 2> "$LOG" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!($expr)){console.error(JSON.stringify(d,null,1));process.exit(1)}" >> "$LOG" 2>&1; then ok "$name"; else bad "$name"; fi
}

lane_count() { ls .codeloop/lanes/*.yaml 2>/dev/null | wc -l | tr -d ' '; }
cards_in() { codeloop card list --json | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.filter(c=>c.lane==='$1').length)"; }

# --- init installs the shipped lanes -------------------------------------------------------
expect 0 "init runs" codeloop init --tools claude --starter generic
expect 0 "init installed the 8 shipped lanes" test "$(lane_count)" = 8

# --- a fresh repo is usable straight after init --------------------------------------------
expect 0 "init wrote the skills index" test -s .codeloop/skills.index.yaml
expect 0 "init ends by saying what to type next" sh -c "codeloop init --tools claude --starter generic | grep -q 'codeloop start \"<your feature>\"'"
expect 0 "lane lint passes on the shipped lanes right after init" codeloop lane lint
expect 0 "pack build works right after init" codeloop pack build --out dist/fresh-pack.json
json "no packed skill has an empty description" "d.skills.length>=10 && d.skills.every(s=>s.description)" cat dist/fresh-pack.json
expect 2 "lane lint refuses skills that are not in an (empty) index" sh -c 'mkdir -p empty && codeloop adopt --from empty && codeloop lane lint'
expect 0 "adopt with the default dirs restores the index" sh -c 'codeloop adopt > /dev/null && codeloop lane lint'

# --- swap in small deterministic lanes ----------------------------------------------------
rm .codeloop/lanes/*.yaml
cat > .codeloop/lanes/build.yaml <<'YAML'
id: build
version: 1
metric: { name: cycle_time_days, source: cards }
trigger: { manual: true }
wip: 2
stages:
  - id: research
    skill: design
    output: "{spec}/research.md"
    done: { cmd: "codeloop check file {spec}/research.md --has verdict:" }
  - id: spec
    skill: plan
    output: "{spec}/tasks.md"
    done: { cmd: "codeloop spec check {id}" }
    gate: { name: spec, approver: owner }
  - id: ship
    skill: deploy
    done: { cmd: "codeloop task check {id} --all-done" }
on_done: { start: market }
YAML
cat > .codeloop/lanes/market.yaml <<'YAML'
id: market
version: 1
metric: { name: signups_from_launch, source: analytics }
trigger: { on: lane.done, lane: build }
stages:
  - id: brief
    skill: plan
    output: marketing/{id}/brief.md
    done: { cmd: "codeloop check file marketing/{id}/brief.md --has audience:" }
  - id: draft
    skill: design
    output: marketing/{id}/blog.md
    done: { cmd: "codeloop check file marketing/{id}/blog.md --has claim:" }
    gate: { name: copy, approver: owner }
  - id: publish
    skill: ship
    done: { cmd: "touch marketing/{id}/check-ran && codeloop check file marketing/{id}/published.md --has url:" }
    gate: { name: publish, approver: owner, outward: true }
YAML
cat > .codeloop/lanes/nightly.yaml <<'YAML'
id: nightly
version: 1
metric: { name: proposals_accepted_ratio, source: cards }
trigger: { cron: "30 3 * * *" }
stages:
  - id: capture
    skill: manage
    done: { cmd: "codeloop check file nightly/{id}.md" }
YAML
expect 0 "lane lint passes on the e2e lanes" codeloop lane lint

# --- build card: checks, spec gate, permissions --------------------------------------------
expect 0 "start creates the card, its spec folder and a Next line" sh -c "codeloop start 'Add CSV export' | tee start.out | grep -q '^Next: run the /design skill to write specs/001-add-csv-export/research.md, then .codeloop next c-001.'"
expect 0 "spec new on an existing spec folder changes nothing" sh -c "codeloop spec new c-001 | grep -q '(0 files created)'"
S=specs/001-add-csv-export
expect 0 "spec folder has four files and is recorded on the card" sh -c "test -f $S/research.md -a -f $S/spec.md -a -f $S/plan.md -a -f $S/tasks.md && codeloop card show c-001 --json | grep -q '\"spec\": \"$S\"'"
expect 2 "next with no id uses the one active card; the check fails" codeloop next
expect 0 "the failed check ends with what is missing, the skill and the retry command" sh -c "codeloop next 1 | tail -1 | grep -q '^Next: .*research.md is missing.*The /design skill produces.*codeloop next c-001'"
echo "verdict: build it" >> $S/research.md
expect 0 "next accepts the bare number and moves research to spec" codeloop next 001
expect 2 "spec check refuses the unfilled template" codeloop spec check 001
printf -- '- [ ] T001 [US1] [api] Export endpoint in src/export.ts\n- [ ] T002 [US1] Wire the export button\n' >> $S/tasks.md
expect 2 "advance past spec refused with an untagged task" codeloop card advance c-001
expect 0 "spec check names the untagged line" sh -c "codeloop spec check 001 2>&1 | grep -q 'untagged task.*T002'"
sed -i.bak 's/T002 \[US1\] Wire/T002 [US1] [ui] Wire/' $S/tasks.md && rm $S/tasks.md.bak
expect 0 "spec check passes once every task is tagged" codeloop spec check 001
expect 0 "task list --layer ui shows only the ui task" sh -c "codeloop task list 001 --layer ui | grep -q T002 && ! codeloop task list 001 --layer ui | grep -q T001"
expect 0 "advance parks the card on the spec gate" codeloop card advance c-001
json "card is parked on gate spec awaiting owner" "d.stage==='spec' && d.gate==='spec' && d.awaiting==='owner'" codeloop card show c-001 --json
expect 2 "a parked card cannot advance" codeloop card advance c-001
expect 2 "agent approve is refused" codeloop card approve c-001 --as agent
expect 2 "approve with no role is refused" codeloop card approve c-001
expect 0 "at the gate the Next line says to approve" sh -c "codeloop card show C-001 | tail -1 | grep -q 'codeloop approve c-001'"
expect 0 "owner approve also advances the card" sh -c "codeloop approve 1 --as owner | grep -q 'c-001 moved to ship'"
json "card is at ship after the approval" "d.stage==='ship' && !d.gate" codeloop card show c-001 --json
expect 1 "task check fails while tasks are open" codeloop task check 001 --all-done
expect 2 "advance refused while tasks are open" codeloop card advance c-001
expect 0 "task done ticks both tasks" sh -c "codeloop task done 001 T001 && codeloop task done 001 T002"
expect 0 "task check passes with all tasks done" codeloop task check 001 --all-done
expect 0 "advance finishes the build card" codeloop card advance c-001
json "build card is done" "d.stage==='done'" codeloop card show c-001 --json

# --- check file does not pass on an empty file -----------------------------------------------
: > empty.md
expect 1 "check file with no --has fails on an empty file" codeloop check file empty.md

# --- a hostile card id never reaches a shell ------------------------------------------------
expect 2 "a card id carrying shell syntax is refused" codeloop card new build x --id 'c-9;touch PWNED;echo'
expect 0 "nothing was executed and no card was created" sh -c "test ! -e PWNED && ! codeloop card list --json | grep -q PWNED"

# --- on_done starts a market card; inbox shows it ------------------------------------------
json "on_done created a market card" "d.lane==='market' && d.stage==='brief'" codeloop card show c-002 --json
expect 0 "on_done plus the lane.done trigger made one market card, not two" test "$(cards_in market)" = 1
json "inbox shows the shipped build card and the active market card" \
  "d.shipped.some(c=>c.id==='c-001') && d.numbers.find(n=>n.lane==='market').active===1" codeloop inbox --json
mkdir -p marketing/c-002
echo "audience: founders" > marketing/c-002/brief.md
expect 0 "market card advances to draft" codeloop card advance c-002
echo "claim: export in one click" > marketing/c-002/blog.md
expect 0 "market card parks on the copy gate" codeloop card advance c-002
expect 0 "inbox opens with the counts and tells what to read" sh -c "codeloop inbox > inbox.out && head -1 inbox.out | grep -q '1 shipped this week, 1 waiting on you, oldest today' && grep -q 'read: marketing/c-002/blog.md   last check: passed' inbox.out"
json "inbox needs_you lists the copy gate" "d.needs_you.some(c=>c.id==='c-002' && c.gate==='copy')" codeloop inbox --json

# --- three rejections raise a proposal -----------------------------------------------------
expect 0 "reject copy gate (1)" codeloop card reject c-002 --note "no proof for the claim" --as owner
expect 0 "lane propose stays quiet at one rejection" test "$(codeloop lane propose >/dev/null; ls .codeloop/proposals 2>/dev/null | wc -l | tr -d ' ')" = 0
codeloop card advance c-002 > /dev/null 2>&1
expect 0 "reject copy gate (2)" codeloop card reject c-002 --note "no proof for the claim" --as owner
codeloop card advance c-002 > /dev/null 2>&1
expect 0 "reject copy gate (3), short form with the note as an argument" codeloop reject 2 "claim needs a number" --as owner
json "rejection notes are readable on the card" "d.brief.rejections.length===3" codeloop card show c-002 --json
expect 0 "lane propose" codeloop lane propose
P=.codeloop/proposals/market-draft-1
expect 0 "proposal has why.md, lane.yaml and eval.yaml" test -f $P/why.md -a -f $P/lane.yaml -a -f $P/eval.yaml
expect 0 "why.md cites the card and a rejection note" sh -c "grep -q c-002 $P/why.md && grep -q 'claim needs a number' $P/why.md"
expect 0 "proposed lane carries the notes and version 2" sh -c "grep -q 'version: 2' $P/lane.yaml && grep -q 'no proof for the claim' $P/lane.yaml"

# --- eval: a check that cannot fail is refused, a real one goes green ----------------------
expect 2 "promote refused before any eval" codeloop lane promote market-draft-1 --as owner
sed -i.bak 's/--has claim:/--has claim: proof:/' $P/lane.yaml && rm $P/lane.yaml.bak
expect 0 "proposal tightens the draft check" grep -q -e '--has claim: proof:' $P/lane.yaml
expect 4 "eval refuses the unfilled fixture template" codeloop lane eval market-draft-1
cat > $P/eval.yaml <<'YAML'
fixtures:
  - name: claim-with-proof
    setup: "mkdir -p marketing/eval-001 && printf 'claim: x\nproof: y\n' > marketing/eval-001/blog.md"
    expect: fail
YAML
expect 4 "eval refuses a check that passes on its failing fixture" codeloop lane eval market-draft-1
expect 2 "promote refused on a red eval" codeloop lane promote market-draft-1 --as owner
cat > $P/eval.yaml <<'YAML'
fixtures:
  - name: claim-without-proof
    setup: "mkdir -p marketing/eval-001 && echo 'claim: x' > marketing/eval-001/blog.md"
    expect: fail
  - name: claim-with-proof
    setup: "mkdir -p marketing/eval-001 && printf 'claim: x\nproof: y\n' > marketing/eval-001/blog.md"
    expect: pass
YAML
expect 0 "lane eval green with a real failing fixture" codeloop lane eval market-draft-1
json "eval-result.json is green" "d.green===true && d.fixtures.length===2" cat $P/eval-result.json

# --- promote and rollback ------------------------------------------------------------------
expect 2 "agent promote is refused" codeloop lane promote market-draft-1 --as agent
expect 0 "owner promote" codeloop lane promote market-draft-1 --as owner
expect 0 "lane show reports version 2" sh -c "codeloop lane show market | grep -q '^version: 2'"
expect 0 "previous version kept in .history" test -f .codeloop/lanes/.history/market.v1.yaml
expect 2 "lane rollback is refused for an agent" codeloop lane rollback market
expect 0 "lane rollback as owner" codeloop lane rollback market --as owner
expect 0 "lane show reports version 1 again" sh -c "codeloop lane show market | grep -q '^version: 1'"

# --- outward gate: approval comes before the act --------------------------------------------
codeloop card advance c-002 > /dev/null 2>&1
expect 0 "owner approves the copy gate; the card enters the public step and waits" sh -c "codeloop approve c-002 --as owner | grep -q 'public step and has not run'"
json "card parked on the outward publish gate on entry" "d.stage==='publish' && d.gate==='publish' && d.awaiting==='owner'" codeloop card show c-002 --json
expect 2 "parked outward card cannot advance" codeloop card advance c-002
expect 0 "the publish check never ran while parked" test ! -e marketing/c-002/check-ran
expect 0 "owner approves the publish gate" codeloop card approve c-002 --as owner
json "approving a public step does not run its check" "d.stage==='publish' && !d.gate && !d.retries.publish" codeloop card show c-002 --json
expect 2 "after approval the publish check still has to pass" codeloop card advance c-002
expect 0 "the publish check ran only after approval" test -e marketing/c-002/check-ran
echo "url: https://example.test/export" > marketing/c-002/published.md
expect 0 "advance finishes the market card without parking again" codeloop card advance c-002
json "market card is done" "d.stage==='done' && !d.gate" codeloop card show c-002 --json

# --- replay: a stricter check is run against finished cards --------------------------------
P2=.codeloop/proposals/market-strict
mkdir -p $P2
sed 's/^version: 1/version: 2/; s/--has audience:/--has audience: metric:/' .codeloop/lanes/market.yaml > $P2/lane.yaml
cat > $P2/eval.yaml <<'YAML'
fixtures:
  - name: brief-without-metric
    setup: "mkdir -p marketing/eval-001 && echo 'audience: x' > marketing/eval-001/brief.md"
    expect: fail
YAML
expect 1 "eval fails: finished card c-002 does not pass the stricter brief check" codeloop lane eval market-strict
expect 0 "eval names the card and stage" sh -c "codeloop lane eval market-strict 2>&1 | grep -q 'card c-002 finished, but its brief output fails'"
echo "accept_regressions: [c-002]" >> $P2/eval.yaml
expect 0 "eval green once the regression is accepted" codeloop lane eval market-strict
json "eval-result.json records the per-card replay" "d.green && d.replayed.some(r=>r.card==='c-002' && r.stage==='brief' && !r.passed && r.accepted)" cat $P2/eval-result.json

# --- cron: one card per due slot -----------------------------------------------------------
expect 0 "run --due at a due slot names the trigger" sh -c "codeloop run --due --now 2026-10-07T03:31:00 | grep -q 'in nightly (trigger: cron 30 3 \* \* \*)'"
expect 0 "run --due created one nightly card" test "$(cards_in nightly)" = 1
expect 0 "run with no flag, again in the same slot" codeloop run --now 2026-10-07T03:45:00
json "a failing card whose output is unchanged does not use up a retry" "d.retries.capture===1" codeloop card show "$(codeloop card list --json | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.find(c=>c.lane==='nightly').id)")" --json
expect 0 "second run created no card" test "$(cards_in nightly)" = 1

# --- git trigger: one card per new HEAD ----------------------------------------------------
cat > .codeloop/lanes/release.yaml <<'YAML'
id: release
version: 1
metric: { name: change_failure_rate, source: cards }
trigger: { on: git.commit }
stages:
  - id: staging
    skill: deploy
    done: { cmd: "codeloop check file release/{id}.md" }
YAML
commit() { git -c user.name=e2e -c user.email=e2e@example.test -c commit.gpgsign=false commit -q --allow-empty -m "$1"; }
git init -q && commit one
expect 0 "lane lint accepts the git.commit trigger" codeloop lane lint
expect 0 "run --due with a new HEAD" codeloop run --due --now 2026-10-07T04:00:00
expect 0 "run --due created one release card" test "$(cards_in release)" = 1
expect 0 "run --due again on the same HEAD" codeloop run --due --now 2026-10-07T04:05:00
expect 0 "same HEAD created no card" test "$(cards_in release)" = 1
commit two
expect 0 "run --due after a new commit" codeloop run --due --now 2026-10-07T04:10:00
expect 0 "new commit created a second release card" test "$(cards_in release)" = 2

# --- verify: use cases, evidence, mutate; stats; commit-msg hook ----------------------------
expect 2 "verify refuses: acceptance line US1 has no use case" codeloop verify 001
mkdir -p usecases/001
cat > usecases/001/uc-1.yaml <<'YAML'
id: uc-1
accept: US1
failure_mode: "the export file is never written"
layers:
  cli: { run: "test -f feature-marker.txt", expect: { exit: 0 } }
YAML
expect 1 "verify fails while the use case fails" codeloop verify 001
expect 0 "evidence says result: fail" grep -q 'result: fail' evidence/001/verify.md
expect 0 "init --hooks installs the commit-msg hook" codeloop init --hooks
git checkout -q -b feat/c-001-csv-export
echo "exported" > feature-marker.txt
git add feature-marker.txt && commit "feat: csv export"
expect 0 "hook added the Feature trailer from the branch name" sh -c "git log -1 --format=%B | grep -q '^Feature: c-001$'"
expect 0 "verify passes once the use case passes" codeloop verify 001
json "evidence json carries the sha and the layer result" "d.pass && d.sha.length===40 && d.layers[0].layer==='cli'" cat evidence/001/uc-1.json
json "verify evidence is attached to the card" "d.evidence.includes('evidence/001/verify.md')" codeloop card show c-001 --json
expect 0 "verify --mutate: the use case fails before the feature commit" codeloop verify 001 --mutate
cat > usecases/001/uc-2.yaml <<'YAML'
id: uc-2
accept: US1
failure_mode: "a check that cannot fail"
layers:
  cli: { run: "true" }
YAML
expect 4 "verify --mutate refuses a use case that passes without the feature" codeloop verify 001 --mutate
expect 0 "mutate left no worktree behind" test "$(git worktree list | wc -l | tr -d ' ')" = 1
json "stats counts human turns from card events" "d.cards>=2 && d.human_turns_per_card>0 && d.first_pass_rate_by_gate['market/copy']===0" codeloop stats --json
json "stats --compare splits by lane version" "d.v1.cards>=1 && d.v2.cards===0" codeloop stats --lane market --compare v1 v2 --json

# --- wiki: capture, inject, critical gotchas block until acknowledged ------------------------
gotcha() { codeloop wiki capture --title "CSV export needs a BOM for Excel" --scope "src/export/**" --body "Write the BOM first."; }
expect 0 "wiki capture writes a page" gotcha
expect 0 "inject returns the page for a matching file" sh -c "codeloop wiki inject --files src/export/csv.ts | grep -q 'needs a BOM'"
expect 0 "inject returns nothing for an unrelated file" sh -c "codeloop wiki inject --files site/page.tsx | grep -q 'no wiki pages apply'"
expect 0 "a warning gotcha does not block" codeloop check gotchas --files src/export/csv.ts
gotcha > /dev/null && gotcha > /dev/null
expect 0 "third capture makes the page critical" sh -c "codeloop wiki list | grep -q 'critical.*freq 3'"
expect 1 "critical gotcha blocks a change to a matching file" codeloop check gotchas --files src/export/csv.ts
expect 0 "acknowledging it by title unblocks" codeloop check gotchas --files src/export/csv.ts --ack "CSV export needs a BOM for Excel"
expect 0 "wiki lint passes" codeloop wiki lint
echo "See [missing](../concepts/nope.md)." >> .codeloop/wiki/gotchas/csv-export-needs-a-bom-for-excel.md
expect 1 "wiki lint fails on a broken link" codeloop wiki lint

# --- import from Spec Kit and BMAD ---------------------------------------------------------
mkdir -p "$WORK/kit/specs/001-login" "$WORK/kit/specs/002-billing" "$WORK/bmad/docs"
printf '# Feature Specification: Login\n\n### User Story 1 - Sign in (Priority: P1)\n' > "$WORK/kit/specs/001-login/spec.md"
printf -- '- [ ] T001 [P] [US1] Create the session model in src/models/session.py\n' > "$WORK/kit/specs/001-login/tasks.md"
printf '# Feature Specification: Billing\n\n### User Story 1 - Pay an invoice (Priority: P1)\n' > "$WORK/kit/specs/002-billing/spec.md"
printf -- '- [x] T001 [US1] Add the invoice page\n' > "$WORK/kit/specs/002-billing/tasks.md"
cp "$WORK/kit/specs/001-login/tasks.md" "$WORK/kit-tasks.orig"
printf 'development_status:\n  epic-1: in-progress\n  1-1-auth: done\n  1-2-account: in-progress\n  1-3-billing: backlog\n' > "$WORK/bmad/docs/sprint-status.yaml"
printf '# Story 1.2: Account settings\n' > "$WORK/bmad/docs/1-2-account.md"
imported() { codeloop card list --json | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.filter(c=>c.events[0].action==='import'&&c.events[0].note.startsWith('$1')).map(c=>c.id+':'+c.stage).join(' '))"; }
expect 0 "import speckit" codeloop import speckit "$WORK/kit"
kit_cards=$(imported speckit)
expect 0 "speckit import created two cards" test "$(echo $kit_cards | wc -w | tr -d ' ')" = 2
first_kit=${kit_cards%%:*}
expect 2 "imported spec fails the check until its [?] tags are filled" codeloop spec check "$first_kit"
sed -i.bak 's/\[?\]/[api]/' specs/$first_kit-login/tasks.md && rm specs/$first_kit-login/tasks.md.bak
expect 0 "imported spec passes once the flagged tag is filled" codeloop spec check "$first_kit"
expect 0 "speckit source files are untouched" cmp -s "$WORK/kit/specs/001-login/tasks.md" "$WORK/kit-tasks.orig"
expect 0 "import bmad" codeloop import bmad "$WORK/bmad"
expect 0 "bmad import created three cards: done maps to done, unknown stages to the first" test "$(imported bmad | sed 's/[^ ]*://g')" = "done research research"

# --- hosts, MCP, CI --------------------------------------------------------------------------
expect 0 "render writes agents, rules, skills and the AGENTS.md block" sh -c "codeloop render && test -f .claude/agents/codeloop-market-publish.md -a -f .cursor/rules/codeloop-market.mdc -a -f .agents/skills/codeloop-market/SKILL.md && grep -q 'codeloop:start' AGENTS.md"
expect 0 "the publish agent is told to wait for approval before acting" grep -q 'Do nothing until a person has approved it' .claude/agents/codeloop-market-publish.md
git add -A
expect 0 "a second render produces no diff" sh -c "codeloop render | grep -q '^  0 written' && git diff --exit-code --quiet"
expect 0 "gate check passes for an approved gate and warns that it is a local approval" sh -c "codeloop gate check c-001 --require spec | grep -q 'Local roles are not authenticated'"
expect 2 "gate check refuses a card with no approval for the gate" codeloop gate check "$first_kit" --require spec
expect 0 "init --ci github writes the three workflows" sh -c "codeloop init --ci github && test -f .github/workflows/codeloop-pr.yml -a -f .github/workflows/codeloop-staging.yml -a -f .github/workflows/codeloop-prod.yml"
expect 0 "the prod workflow waits on the production environment" grep -q 'environment: production' .github/workflows/codeloop-prod.yml
mcp() { (printf '%s\n' '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"e2e","version":"0"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' "$1"; sleep 1) | codeloop mcp; }
json_lines() { node -e "const l=require('fs').readFileSync(0,'utf8').trim().split('\n').map(x=>JSON.parse(x)); const d=l.find(m=>m.id===1); if(!($1)){console.error(JSON.stringify(d));process.exit(1)}"; }
expect 0 "mcp tools/list returns the nine tools over stdio" bash -c "$(declare -f mcp json_lines); mcp '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}' | json_lines 'd.result.tools.length===9 && d.result.tools.some(t=>t.name===\"get_card\")'"
expect 0 "mcp get_card returns the card" bash -c "$(declare -f mcp json_lines); mcp '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"id\":\"c-001\"}}}' | json_lines 'JSON.parse(d.result.content[0].text).id===\"c-001\"'"

# --- board: cards on the web, approve only with --owner ------------------------------------
# http <wanted status> <url> [method] [json body]: prints the body, fails on another status.
http() { node -e "const [want,u,m,b]=process.argv.slice(1); fetch(u,{method:m||'GET',headers:{'content-type':process.env.CTYPE||'application/json','x-codeloop-token':process.env.TOKEN||'',...(process.env.ORIGIN?{origin:process.env.ORIGIN}:{})},body:b}).then(async r=>{console.log(await r.text()); process.exit(r.status===Number(want)?0:1)}).catch(e=>{console.error(e.message);process.exit(1)})" "$@"; }
up() { for _ in 1 2 3 4 5 6 7 8 9 10; do http 200 "$1/api/cards" > /dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
rm -f .codeloop/board.json
RO=$((20000 + RANDOM % 10000)); OW=$((RO + 1))
codeloop serve --port $RO > serve-ro.log 2>&1 & SERVE_PIDS="$SERVE_PIDS $!"
codeloop serve --port $OW --owner > serve-owner.log 2>&1 & SERVE_PIDS="$SERVE_PIDS $!"
expect 0 "serve starts with no board.json" up "http://127.0.0.1:$RO"
expect 0 "serve --owner starts" up "http://127.0.0.1:$OW"
RO_TOKEN=$(grep -o 'token=[a-f0-9]*' serve-ro.log | head -1 | cut -d= -f2)
OW_TOKEN=$(grep -o 'token=[a-f0-9]*' serve-owner.log | head -1 | cut -d= -f2)
expect 0 "serve prints a URL with a token and listens on 127.0.0.1" sh -c "test -n '$OW_TOKEN' && grep -q 'http://127.0.0.1:$OW/?token=' serve-owner.log"
# as <token> <origin> <content-type> <wanted status> <url> [method] [body]
as() { TOKEN="$1" ORIGIN="$2" CTYPE="$3" http "${@:4}"; }
expect 0 "the board page loads" bash -c "$(declare -f http); http 200 http://127.0.0.1:$RO/ | grep -q 'Codeloop Board'"
json "/api/cards returns cards, lanes and the inbox summary" "d.cards.some(c=>c.id==='c-001') && d.lanes.some(l=>l.id==='market') && /waiting on you/.test(d.inbox.summary)" http 200 "http://127.0.0.1:$RO/api/cards"
codeloop start "Board approval" --lane market --id c-900 > /dev/null
mkdir -p marketing/c-900 && echo "audience: founders" > marketing/c-900/brief.md && echo "claim: x" > marketing/c-900/blog.md
codeloop next c-900 > /dev/null && codeloop next c-900 > /dev/null
json "the card is waiting for you at the copy gate" "d.gate==='copy'" codeloop card show c-900 --json
expect 0 "approve from a board without --owner is refused with 403" as "$RO_TOKEN" "" "" 403 "http://127.0.0.1:$RO/api/cards/c-900/approve" POST '{}'
expect 0 "owner board: a POST with no token is refused with 403" as "" "" "" 403 "http://127.0.0.1:$OW/api/cards/c-900/approve" POST '{}'
expect 0 "owner board: a POST from another origin is refused with 403, token or not" as "$OW_TOKEN" "https://evil.example" "" 403 "http://127.0.0.1:$OW/api/cards/c-900/approve" POST '{}'
expect 0 "owner board: a text/plain POST is refused with 415" as "$OW_TOKEN" "" "text/plain" 415 "http://127.0.0.1:$OW/api/cards/c-900/approve" POST '{}'
expect 0 "the server sends no CORS header" node -e "fetch('http://127.0.0.1:$OW/api/cards').then(r=>process.exit(r.headers.get('access-control-allow-origin')?1:0))"
json "the refused approve changed nothing" "d.gate==='copy'" codeloop card show c-900 --json
expect 0 "reject from the owner board needs a note" as "$OW_TOKEN" "" "" 400 "http://127.0.0.1:$OW/api/cards/c-900/reject" POST '{}'
expect 0 "approve from the owner board, with the token, goes through the engine" as "$OW_TOKEN" "" "" 200 "http://127.0.0.1:$OW/api/cards/c-900/approve" POST '{}'
json "the approved card moved on to the public step" "d.stage==='publish' && d.gate==='publish' && d.events.some(e=>e.action==='approve' && e.actor==='owner')" codeloop card show c-900 --json

# --- pack ----------------------------------------------------------------------------------
lane_skills=$(grep -h 'skill:' .codeloop/lanes/*.yaml | sed 's/.*skill: *//' | sort -u | wc -l | tr -d ' ')
want=$((lane_skills + 1))
expect 0 "pack build" codeloop pack build --out dist/pack.json
json "manifest has $want skills ($lane_skills from lanes + codeloop_guide) in the Protobox shape" \
  "d.skills.find(s=>s.skillId==='codeloop_guide').content.includes('approve before') && d.kind==='platform' && d.auth[0].type==='none' && d.availability==='available' && d.skills.length===$want && d.skills.some(s=>s.skillId==='codeloop_guide') && d.skills.every(s=>/^[a-z][a-z0-9_]*$/.test(s.skillId) && s.content && Array.isArray(s.toolDeps))" \
  cat dist/pack.json

# --- run --agent: a fake agent does each stage, the engine checks it and stops at the gate ---
mkdir "$WORK/unattended" && cd "$WORK/unattended"
codeloop init --tools claude --starter generic > /dev/null
rm .codeloop/lanes/*.yaml
cat > .codeloop/lanes/build.yaml <<'YAML'
id: build
version: 1
metric: { name: cycle_time_days, source: cards }
trigger: { manual: true }
stages:
  - id: research
    skill: design
    output: "{spec}/research.md"
    done: { cmd: "codeloop check file {spec}/research.md --has verdict:" }
  - id: spec
    skill: plan
    output: "{spec}/tasks.md"
    done: { cmd: "codeloop spec check {id}" }
    gate: { name: spec, approver: owner }
  - id: ship
    skill: deploy
    done: { cmd: "codeloop task check {id} --all-done" }
YAML
# Stands in for a headless coding agent: reads the stage brief on stdin and writes the output it names.
cat > fake-agent.sh <<'SH'
#!/bin/sh
brief=$(cat)
field() { printf '%s\n' "$brief" | sed -n "s/^$1: //p" | head -1; }
card=$(field Card); stage=$(field Stage); out=$(field Output)
echo "fake agent: $card $stage, role $CODELOOP_ROLE"
case "$stage" in
  research) echo "verdict: build it" >> "$out" ;;
  spec) printf -- '- [ ] T001 [US1] [api] Export endpoint in src/export.ts\n' >> "$out" ;;
  ship) codeloop task done "$card" T001; codeloop approve "$card" --as owner 2>&1; echo "approve from inside the agent: exit $?" ;;
esac
SH
chmod +x fake-agent.sh
expect 2 "run --agent with no agent configured is refused" codeloop run --agent
cat >> .codeloop/config.yaml <<'YAML'
agents:
  default: fake
  fake: { cmd: "./fake-agent.sh < {brief}", timeout_minutes: 1 }
  broken: { cmd: "echo cannot reach the model; exit 7" }
YAML
RUNS=.codeloop/state/agent-runs
codeloop start "Agent export" > /dev/null
expect 0 "brief names the output and the check and carries the skill text" sh -c "codeloop brief 1 --out brief.md > /dev/null && grep -q '^Output: specs/001-agent-export/research.md' brief.md && grep -q 'codeloop check file specs/001-agent-export/research.md --has verdict:' brief.md && grep -q '^## Skill: design' brief.md && grep -q 'Do not run .codeloop approve' brief.md"
expect 0 "run --agent --dry-run says what would start and starts nothing" sh -c "codeloop run --agent fake --dry-run | grep -q 'c-001: would start agent fake on research' && test ! -e .codeloop/state"
expect 0 "run --agent: the agent does research, the check passes, the card moves" sh -c "codeloop run --agent fake | tee run1.out | grep -q 'c-001: agent fake ran research (exit 0' && grep -q 'c-001: moved' run1.out"
json "the card is at spec with an agent-run event and its log" "d.stage==='spec' && !d.gate && d.events.some(e=>e.action==='agent-run' && e.agent==='fake' && e.exit===0 && e.log==='$RUNS/c-001-research-1.log')" codeloop card show c-001 --json
expect 0 "the agent ran as CODELOOP_ROLE=agent" grep -q 'fake agent: c-001 research, role agent' $RUNS/c-001-research-1.log
expect 0 "run --agent again: the agent writes the spec and the card stops at the gate" sh -c "codeloop run --agent fake | tee run2.out | grep -q 'c-001: agent fake ran spec (exit 0' && grep -q 'c-001: waiting for you' run2.out"
json "the card waits for the owner at the spec gate" "d.stage==='spec' && d.gate==='spec' && d.awaiting==='owner'" codeloop card show c-001 --json
expect 0 "run --agent while the card waits starts no agent" sh -c "codeloop run --agent fake | grep -q '0 advanced, 0 agent runs' && test \"\$(ls $RUNS | wc -l | tr -d ' ')\" = 2"
expect 0 "the owner approves the spec" sh -c "codeloop approve 1 --as owner | grep -q 'c-001 moved to ship'"
expect 0 "run --agent after the approval: the agent ships and the card finishes" sh -c "codeloop run --agent fake | tee run3.out | grep -q 'c-001: agent fake ran ship (exit 0' && grep -q 'c-001: done' run3.out"
expect 0 "an approve typed by the agent with --as owner was refused" sh -c "grep -q 'refused: .*acts as agent' $RUNS/c-001-ship-1.log && grep -q 'approve from inside the agent: exit 2' $RUNS/c-001-ship-1.log"
json "the card got from research to done on three agent runs and one approval" "d.stage==='done' && d.events.filter(e=>e.action==='agent-run').length===3 && d.events.filter(e=>e.action==='approve').length===1" codeloop card show c-001 --json
codeloop start "Second export" > /dev/null
expect 0 "a failing agent leaves the card where it is and the Next line names its log" sh -c "codeloop run --agent broken | tee run4.out | grep -q 'c-002: failed' && grep -q 'Next: .*Agent broken exited 7; its output is in $RUNS/c-002-research-1.log' run4.out && grep -q 'cannot reach the model' $RUNS/c-002-research-1.log"
json "the failed agent run counted as a retry" "d.stage==='research' && d.retries.research===1" codeloop card show c-002 --json
printf '#!/bin/sh\nif [ "$1" = "-l" ]; then cat "%s/crontab.txt" 2>/dev/null; else cat > "%s/crontab.txt"; fi\n' "$WORK" "$WORK" > "$WORK/bin/fake-crontab"
chmod +x "$WORK/bin/fake-crontab"
export CODELOOP_CRONTAB="$WORK/bin/fake-crontab"
expect 0 "schedule install --print prints the crontab line and installs nothing" sh -c "codeloop schedule install --every 30m --print | grep -q '^\*/30 \* \* \* \* cd .* run --agent >> .codeloop/state/run.log 2>&1 # codeloop:' && test ! -e '$WORK/crontab.txt'"
expect 0 "schedule install, status and remove go through the crontab command" sh -c "codeloop schedule install --cron '0 3 * * *' --agent fake > /dev/null && grep -q '^0 3 \* \* \* .* run --agent fake ' '$WORK/crontab.txt' && codeloop schedule status | grep -q 'installed: 0 3' && codeloop schedule remove && ! grep -q codeloop '$WORK/crontab.txt'"
unset CODELOOP_CRONTAB

# --- shipped build lane: research sources, competitor pages, the mock stage -------------------
mkdir "$WORK/shipped" && cd "$WORK/shipped"
codeloop init --tools claude --starter generic > /dev/null
expect 0 "wiki competitor add writes the page with its links" sh -c "codeloop wiki competitor add acme --docs https://acme.test/docs --changelog https://acme.test/changelog | grep -q '.codeloop/wiki/competitors/acme.md' && grep -q '^changelog: https://acme.test/changelog' .codeloop/wiki/competitors/acme.md"
codeloop start "Add CSV export" > /dev/null
R=specs/001-add-csv-export
M=docs/mocks/my-project/exports/c-001.html
expect 0 "the research brief carries the competitor page" sh -c "codeloop brief 1 | grep -q '^### acme (.codeloop/wiki/competitors/acme.md)'"
expect 1 "check research fails on the unfilled template" codeloop check research 1
printf 'verdict: build\n- source: https://acme.test/docs/export — toolbar button\n- source: https://globex.test/changelog — bulk export\n' >> $R/research.md
expect 0 "check research names the count when two of three sources are cited" sh -c "codeloop check research 1 2>&1 | grep -q 'cites 2 sources, needs 3'"
expect 2 "next refuses the research stage with two sources" codeloop next 1
printf -- '- source: http://127.0.0.1:1/forum — users ask for a column picker\n| acme | Export button in the toolbar | https://acme.test/docs/export |\n' >> $R/research.md
expect 0 "check research passes offline with a verdict and three sources" codeloop check research 1
expect 1 "check research --online fails on a source that does not answer" codeloop check research 1 --online
expect 0 "next moves research to the mock stage" sh -c "codeloop next 1 | grep -q 'c-001 moved to mock'"
expect 0 "the acme row was appended to the competitor page" grep -q '^- c-001 Add CSV export: Export button in the toolbar' .codeloop/wiki/competitors/acme.md
json "the card records which competitor page gained findings" "d.events.some(e=>e.action==='findings' && e.note==='.codeloop/wiki/competitors/acme.md')" codeloop card show 1 --json
expect 2 "the mock stage refuses while the spec names no screens" codeloop next 1
perl -0pi -e 's/^screens:.*$/screens:\n- export-dialog/m' $R/spec.md
expect 0 "mock new creates the mock from the shared template" sh -c "codeloop mock new 1 --topic exports | grep -q 'created $M' && grep -q 'codeloop-mock-template: 1' $M"
expect 0 "check mock names the screen with no section" sh -c "codeloop check mock 1 2>&1 | grep -q 'has no <section data-screen=\"export-dialog\">'"
perl -0pi -e 's#</main>#<section data-screen="export-dialog"><h2>Export</h2><div class="frame" style="color: \#cc0000">CSV</div></section>\n</main>#' $M
expect 1 "check mock fails on a colour outside the tokens" codeloop check mock 1
expect 0 "it names the colour" sh -c "codeloop check mock 1 2>&1 | grep -q 'uses colours outside the tokens block: #cc0000'"
perl -pi -e 's/ style="color: #cc0000"//' $M
cp $M "$WORK/mock.good"
perl -pi -e 's/--accent: #2f5fd0/--accent: #ff00ff/' $M
expect 0 "check mock fails when the tokens block was edited" sh -c "codeloop check mock 1 2>&1 | grep -q 'the tokens block differs'"
cp "$WORK/mock.good" $M
expect 0 "check mock passes once the screen is drawn from the tokens" codeloop check mock 1
expect 0 "next moves mock to spec" sh -c "codeloop next 1 | grep -q 'c-001 moved to spec'"
printf -- '- [ ] T001 [US1] [ui] Export dialog in src/export.tsx\n' >> $R/tasks.md
expect 0 "the card waits at the spec gate" sh -c "codeloop next 1 | grep -q 'waiting for you at spec'"
expect 0 "inbox shows the mock path with the spec gate" sh -c "codeloop inbox | grep -q '        mock: $M'"
expect 0 "mocks index writes the gallery" sh -c "codeloop mocks index | grep -q 'docs/mocks/index.html: 1 mock' && grep -q 'href=\"my-project/exports/c-001.html\"' docs/mocks/index.html"
MP=$((RO + 2))
codeloop serve --port $MP > serve-mocks.log 2>&1 & SERVE_PIDS="$SERVE_PIDS $!"
expect 0 "serve starts in the project with mocks" up "http://127.0.0.1:$MP"
expect 0 "serve answers /mocks/ with the gallery" bash -c "$(declare -f http); http 200 http://127.0.0.1:$MP/mocks/ | grep -q 'my-project/exports/c-001.html'"
expect 0 "serve answers the card's mock" bash -c "$(declare -f http); http 200 http://127.0.0.1:$MP/mocks/my-project/exports/c-001.html | grep -q 'data-screen=\"export-dialog\"'"
json "the card on the board links its mock" "d.cards.find(c=>c.id==='c-001').mock==='/mocks/my-project/exports/c-001.html'" http 200 "http://127.0.0.1:$MP/api/cards"

# --- competitor scan: one proposed plan card per change, never started by itself --------------
printf '# Changelog\n\n## September\n- Faster search\n' > changelog-v1.txt
printf '# Changelog\n\n## Bulk CSV export\n- Export any list to CSV\n\n## September\n- Faster search\n' > changelog-v2.txt
expect 0 "the first scan stores a baseline and proposes nothing" bash -c "$(declare -f cards_in); codeloop scan competitors --from-file changelog-v1.txt | grep -q 'acme: first scan; stored as the baseline' && test -s .codeloop/state/scan/acme.txt && test \"\$(cards_in plan)\" = 0"
expect 0 "a scan that finds new text proposes one plan card" sh -c "codeloop scan competitors --from-file changelog-v2.txt | grep -q 'acme: proposed c-002'"
json "the proposal names what shipped, carries the excerpt and the source, and waits for the owner" "d.lane==='plan' && d.stage==='proposed' && d.gate==='proposal' && d.awaiting==='owner' && d.title==='acme shipped: Bulk CSV export' && d.description.includes('- Export any list to CSV') && d.source==='https://acme.test/changelog'" codeloop card show c-002 --json
expect 0 "the same change scanned again creates no second card" bash -c "$(declare -f cards_in); codeloop scan competitors --from-file changelog-v2.txt | grep -q 'acme: nothing new' && test \"\$(cards_in plan)\" = 1"
expect 0 "inbox lists the proposal with how to promote or drop it" sh -c "codeloop inbox | grep -q 'codeloop approve c-002   puts it in the plan lane'"
expect 2 "a proposal cannot be advanced" codeloop next c-002
expect 2 "an agent cannot promote a proposal" codeloop approve c-002 --as agent
expect 0 "a run at the scan lane's weekly slot runs the scan stage and leaves the proposal alone" sh -c "codeloop run --now 2026-10-05T07:05:00 > run-scan.out 2>&1; grep -q 'in scan (trigger: cron 0 7 \* \* MON)' run-scan.out"
json "the scan card finished although the changelog could not be fetched, and the proposal is still a proposal" "d.some(c=>c.lane==='scan' && c.stage==='done') && d.find(c=>c.id==='c-002').stage==='proposed' && d.filter(c=>c.stage==='proposed').length===1" codeloop card list --json
expect 0 "the owner promotes the proposal into the plan lane's first stage" sh -c "codeloop approve c-002 --as owner | grep -q 'c-002 promoted to plan/gather'"
json "the promoted card is in the plan lane and its check has not run" "d.stage==='gather' && !d.gate && !d.retries.gather" codeloop card show c-002 --json
expect 0 "a second proposal is dropped by a rejection" sh -c "codeloop card propose plan 'Try a dark theme' --source issues/12 | grep -q '^proposed' && codeloop reject \"\$(codeloop card list --json | node -e \"console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).find(c=>c.title==='Try a dark theme').id)\")\" 'not now' --as owner | grep -q 'dropped'"
cd "$PROJECT"

echo
if [ "$fail" = 0 ]; then echo "E2E PASS: $pass steps passed, 0 failed"; else echo "E2E FAIL: $pass passed, $fail failed"; exit 1; fi
