#!/usr/bin/env bash
export CODELOOP_HOME="${CODELOOP_HOME:-$(mktemp -d)}"  # keep test projects out of ~/.codeloop/projects.json
# End-to-end proof of `codeloop orch`: one story goes through every build-lane stage with a scripted
# builder (no model calls). Every stage check, rubric and gate is the real one.
#   npm run build && bash scripts/e2e-orch-full-lane.sh      (or: npm run e2e:orch)
# E2E_DROP_SOURCE=1 removes one research source on purpose, so the run must fail at research.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }

WORK="$(mktemp -d)"
trap '[ -n "${E2E_KEEP:-}" ] && echo "kept $WORK" || rm -rf "$WORK"' EXIT
LOG="$WORK/step.log"
PROJECT="$WORK/app"
mkdir -p "$WORK/bin" "$PROJECT"

# Lane done.cmd lines call `codeloop`, so the built CLI has to be on PATH under that name.
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE CODELOOP_WORK_DIR CODELOOP_PROJECT_DIR CODELOOP_CARD
export GIT_AUTHOR_NAME=owner GIT_AUTHOR_EMAIL=owner@example.test GIT_COMMITTER_NAME=owner GIT_COMMITTER_EMAIL=owner@example.test

pass=0
fail=0
ok() { echo "PASS  $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  $1"; fail=$((fail + 1)); sed 's/^/        /' "$LOG" | tail -40; }

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

# ------------------------------------------------------------------------------------------------
# The scripted builder. It reads the brief on stdin, finds the `Stage:` line and writes exactly what
# that stage's check and rubric ask for into the worktree, commits with a Card trailer and hands back.
# ------------------------------------------------------------------------------------------------
cat > "$WORK/fake-builder.sh" <<'FAKE_EOF'
#!/usr/bin/env bash
set -eu
BRIEF="$(cat)"
STAGE="$(printf '%s\n' "$BRIEF" | sed -n 's/^Stage: //p' | head -1)"
ID="${CODELOOP_CARD:?}"
SPEC="$(ls -d specs/*/ | head -1)"; SPEC="${SPEC%/}"
NNN="${SPEC#specs/}"; NNN="${NNN%%-*}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
MOCKDIR="app/mocks/${SPEC#specs/}"

export GIT_AUTHOR_NAME=scripted-builder GIT_AUTHOR_EMAIL=builder@example.test GIT_COMMITTER_NAME=scripted-builder GIT_COMMITTER_EMAIL=builder@example.test
commit() { # subject, body
  git add -A -- . ':!.codeloop'
  git commit -qm "$1

$2

Card: $ID"
}
handback() { # proof, left
  codeloop card handback "$ID" --branch "$BRANCH" --head "$(git rev-parse HEAD)" --proof "$1" --left "$2" --blocked "" --worktree "$PWD"
}
# One real HTTP round trip against the store the story built; prints `GET <url> <status>`.
walk_call() {
  node -e '
    const http = require("http"), fs = require("fs");
    const srv = http.createServer((req, res) => { res.setHeader("content-type", "application/json"); res.end(fs.readFileSync("src/store/records.json")); });
    srv.listen(0, "127.0.0.1", async () => {
      const url = "http://localhost:" + srv.address().port + "/records";
      const r = await fetch(url);
      console.log("- GET " + url + " " + r.status);
      srv.close();
    });'
}

case "$STAGE" in
research)
  cat > "$SPEC/research.md" <<EOF
# Research: $ID saved records list

exists: unlock src/existing-service.ts
pain: a founder loses saved records between sessions (source: docs/interviews.md)
verdict: build

- source: https://example.test/acme/docs - Acme lists records but has no export
- source: https://example.test/globex/changelog - Globex added saved views, still no plain list
- source: src/existing-service.ts - the service already reads records, only the list is missing

## Competitors

| acme | plain records list, no export |
| globex | saved views only, no list |

## Options

- Extend the in-repo store behind \`src/existing-service.ts\`. Chosen: reuses what exists and adds no dependency.
- Adopt a hosted database. Rejected: adds an account and a network hop for a few hundred records.

## Open questions

- Should the list paginate past fifty records?

## Rubric

- R2 pass: \`grep -rn records src/\` finds src/existing-service.ts:1 and no list view anywhere
- R5 pass: two options compared under ## Options in $SPEC/research.md, the hosted database lost on cost
- R7 pass: the pagination question is listed under ## Open questions in $SPEC/research.md
EOF
  if [ "${E2E_DROP_SOURCE:-}" = 1 ]; then sed -i.bak '/globex\/changelog/d' "$SPEC/research.md" && rm "$SPEC/research.md.bak"; fi
  commit "docs(research): records list research" "Compared extending the in-repo store with a hosted database; the in-repo store wins."
  handback "codeloop check research $ID --min-sources 3 && codeloop check wiki-landed $ID --stage research && codeloop check rubric $ID" "$SPEC/research.md"
  ;;
interview)
  if ! grep -q '^answer: .' "$CODELOOP_PROJECT_DIR/$SPEC/interview.md" 2>/dev/null; then
    Q="$(mktemp)"
    cat > "$Q" <<'EOF'
## Q1 [scope] Should the list paginate past fifty records?
options:
- A: Show every record on one page
- B: Paginate at fifty records
recommended: A
answer:

## Q2 [acceptance] What does the list show for a founder with no saved records?
options:
- A: An empty state that says how to save the first record
- B: A blank page
recommended: A
answer:

## Q3 [risk] What happens when the store file is missing or damaged?
recommended: Return an empty list and log the error, never throw on the page
answer:
EOF
    codeloop ask "$ID" --file "$Q"
    exit 0
  fi
  cp "$CODELOOP_PROJECT_DIR/$SPEC/interview.md" "$SPEC/interview.md"
  cat >> "$SPEC/interview.md" <<EOF

## Rubric

- I2 pass: Q1 and Q2 and Q3 carry [scope], [acceptance] and [risk] tags in $SPEC/interview.md:1
- I4 pass: the pagination open question from research is Q1 in $SPEC/interview.md:1
- I6 pass: the answers are folded into $SPEC/spec.md by the spec stage, see \`grep -n Q1 $SPEC/spec.md\`
EOF
  commit "docs(interview): records list interview answered" "Three questions asked with recommended answers; the owner accepted them."
  handback "codeloop check questions $ID --min 3 && codeloop check rubric $ID" "$SPEC/interview.md"
  ;;
mock)
  codeloop mock new "$ID" --topic records
  F="$MOCKDIR/page.tsx"
  cat > "$F" <<'EOF'
'use client';

import { RecordsList } from '@/components/shared/records-list';
import { screens } from './mock-data';

export default function MockRecordsPage() {
  return (
    <main style={{ display: 'grid', gap: 24, padding: 24 }}>
      <section data-screen="Records list">
        <h2>Records list</h2>
        <RecordsList rows={screens['Records list'].rows} />
      </section>
      <section data-screen="Empty state">
        <h2>Empty state</h2>
        <RecordsList rows={screens['Empty state'].rows} emptyText="Save your first record to see it here." />
      </section>
    </main>
  );
}
EOF
  cat > "$MOCKDIR/mock-data.ts" <<'EOF'
export const screens = {
  'Records list': { rows: [{ id: 'r1', name: 'First record' }, { id: 'r2', name: 'Second record' }] },
  'Empty state': { rows: [] as { id: string; name: string }[] },
};
EOF
  mkdir -p components/shared
  cat > components/shared/records-list.tsx <<'EOF'
export function RecordsList({ rows, emptyText = 'No records yet.' }: { rows: { id: string; name: string }[]; emptyText?: string }) {
  return rows.length ? <ul>{rows.map(r => <li key={r.id}>{r.name}</li>)}</ul> : <p>{emptyText}</p>;
}
EOF
  cat > "$SPEC/rubric-mock.md" <<EOF
# Mock rubric evidence

## Rubric

- M2 pass: one frame per state, Records list and Empty state, in $MOCKDIR/page.tsx:8 and $MOCKDIR/page.tsx:13
- M4 pass: US1 is the Records list frame and US2 the Empty state frame, see $MOCKDIR/page.tsx
EOF
  commit "feat(mock): records list mock page" "In-app mock under app/mocks composed from components/shared."
  handback "codeloop check mock $ID && codeloop check rubric $ID" "$MOCKDIR/page.tsx"
  ;;
spec)
  cat > "$SPEC/spec.md" <<EOF
# $ID spec: Saved records list

Story: As a founder, I can see my saved records in one list, so that I stop losing them between sessions.

size: M
metric: cycle_time_days
done_when: npm test

acceptance:
- US1 Given a saved record in the store, when the service lists records, then the record is returned.
- US2 Given the records page, when I open it, then I see the saved records in a list.

screens:
- Records list
- Empty state

entities:
- Record

mock: keep

## Not building

- Pagination: Q1 answer is to show every record on one page.
- Editing or deleting records.

## Failure modes

- The store file is missing or damaged: Q3 answer is an empty list, never a thrown error.
EOF
  cat > "$SPEC/plan.md" <<EOF
# $ID plan: Saved records list

## Layers touched

data, api, ui

## Files

- src/store/records.json
- src/records-service.ts
- components/shared/records-list.tsx
- app/records/page.tsx
- $MOCKDIR/

## Risks

- None beyond the store being a plain file.
EOF
  cat > "$SPEC/tasks.md" <<EOF
# $ID tasks: Saved records list

- [ ] T001 [US1] [data] Create the store \`src/store/records.json\` as a JSON array of records
- [ ] T002 [US1] [api] Add \`src/records-service.ts\` listing records from \`src/store/records.json\`
- [ ] T003 [US2] [ui] Add \`components/shared/records-list.tsx\` and \`app/records/page.tsx\` rendering the list

## Rubric

- S3 pass: Q1 is folded into \`$SPEC/spec.md\` under Not building, Q2 into US2, Q3 under Failure modes
- S6 pass: the not_building list is the ## Not building section at $SPEC/spec.md:20
EOF
  commit "docs(spec): records list spec, plan and tasks" "Acceptance US1 and US2, three layer-tagged tasks, and the plan's file list."
  handback "codeloop spec check $ID && codeloop check rubric $ID" "$SPEC/tasks.md"
  ;;
data-model)
  cat > "$SPEC/data-model.md" <<'EOF'
# Data model: saved records list

## Entities

- Record: id, name, createdAt

## Stores

- records -> `records.json`

## Indexes

- none: the list is read whole, a few hundred records at most

## Migration

- none: records.json is created on first write, there is nothing to move
EOF
  commit "docs(data-model): records store" "One entity in the records.json store that the architecture page already names."
  handback "codeloop check data-model $ID && codeloop check rubric $ID" "$SPEC/data-model.md"
  ;;
build)
  if [ ! -f src/unplanned-helper.ts ]; then
    # Red first: the service does not exist yet, so the check for it fails.
    if node -e "require('fs').accessSync('src/records-service.ts')" 2>/dev/null; then echo "red check unexpectedly green" >&2; exit 1; fi
    mkdir -p src/store app/records components/shared
    echo '[{"id":"r1","name":"First record","createdAt":"2026-01-01"}]' > src/store/records.json
    cat > src/records-service.ts <<'EOF'
import records from './store/records.json';

export function listRecords() {
  return records;
}
EOF
    cat > app/records/page.tsx <<'EOF'
import { RecordsList } from '@/components/shared/records-list';
import { listRecords } from '@/src/records-service';

export default function RecordsPage() {
  return <RecordsList rows={listRecords()} />;
}
EOF
    # Green: the same check now passes.
    node -e "require('fs').accessSync('src/records-service.ts')"
    # One file the plan does not list: `check scope` and rubric row B4 must catch it.
    echo "export const formatName = (n: string) => n.trim();" > src/unplanned-helper.ts
    perl -pi -e 's/^- \[ \] T/- [x] T/' "$SPEC/tasks.md"
    cat > "$SPEC/rubric-build.md" <<EOF
# Build rubric evidence

## Rubric

- B2 pass: \`node -e "require('fs').accessSync('src/records-service.ts')"\` failed with ENOENT before the service was written and exits 0 after
- B5 pass: no wiki gotcha page applies to src/ or app/, \`codeloop check gotchas --files src/records-service.ts\` exits 0
EOF
    commit "feat(records): records store, service and page" "Adds the store, the service that lists it and the page that renders it, plus a helper outside the plan."
  else
    # The gate named the unplanned file: answer it in review.md's Scope table, where the review stage picks it up.
    mkdir -p "evidence/$NNN"
    cat > "evidence/$NNN/review.md" <<'EOF'
# Review

## Scope

| file | verdict | reason |
| --- | --- | --- |
| src/unplanned-helper.ts | keep | small name formatter the service will call once names need trimming, kept to avoid a second commit later |
EOF
    commit "docs(review): scope row for the helper" "The helper is outside the plan's file list; review.md now says why it stays."
  fi
  handback "codeloop task check $ID --all-done && npm test && codeloop check rubric $ID" "src/records-service.ts"
  ;;
verify)
  mkdir -p "usecases/$NNN" "evidence/$NNN"
  cat > "usecases/$NNN/uc-$NNN-01.yaml" <<'EOF'
id: uc-001-01
accept: US1
failure_mode: the store is missing or not an array, so the service throws and the page is blank
layers:
  cli:
    run: |
      node -e "const r=JSON.parse(require('fs').readFileSync('src/store/records.json','utf8')); if(!Array.isArray(r)||!r.length) process.exit(1)" && test -f src/records-service.ts
    expect: { exit: 0 }
EOF
  cat > "usecases/$NNN/uc-$NNN-02.yaml" <<'EOF'
id: uc-001-02
accept: US2
failure_mode: the page renders without the shared list component, so a founder sees no records
layers:
  cli:
    run: grep -q RecordsList app/records/page.tsx && grep -q listRecords app/records/page.tsx
    expect: { exit: 0 }
EOF
  # Each use case must fail on a tree without the feature.
  EMPTY="$(mktemp -d)"
  for f in "usecases/$NNN"/*.yaml; do
    CMD="$(node -e "console.log(require('yaml').parse(require('fs').readFileSync('$f','utf8')).layers.cli.run)" 2>/dev/null || true)"
    [ -n "$CMD" ] || continue
    if (cd "$EMPTY" && sh -c "$CMD") >/dev/null 2>&1; then echo "use case $f passes on an empty tree" >&2; exit 1; fi
  done
  CALL="$(walk_call)"
  cat > "evidence/$NNN/verify.md" <<EOF
## Live walk

stack: npm run dev
url: http://localhost:3000/records
steps:
- opened the records page and saw the First record row from the store
- reloaded the page and saw the same row, nothing was lost
network:
$CALL
external: none: the page reads src/store/records.json and calls nothing outside this repo
EOF
  codeloop verify "$ID" > /dev/null
  cat >> "evidence/$NNN/verify.md" <<EOF

## Rubric

- V4 pass: \`cd "\$(mktemp -d)" && grep -q RecordsList app/records/page.tsx\` exits 1 on an empty tree for both use cases in usecases/$NNN/
- V6 pass: every claim has a file, evidence/$NNN/uc-001-01.json and evidence/$NNN/uc-001-02.json
EOF
  commit "test(verify): use cases and live walk for the records list" "One use case per acceptance line, each seen failing on an empty tree, and the walk against the real store."
  handback "codeloop verify $ID && codeloop check rubric $ID" "evidence/$NNN/verify.md"
  ;;
review)
  CALL="$(walk_call)"
  cat > "evidence/$NNN/review.md" <<EOF
# Review $ID

verdict: approve

## Findings

| finding | verdict | evidence |
| --- | --- | --- |
| the unplanned helper in src/ | unnecessary | kept, see the Scope table below |

## Scope

| file | verdict | reason |
| --- | --- | --- |
| src/unplanned-helper.ts | keep | small name formatter the service will call once names need trimming, kept to avoid a second commit later |

## Rubric

- W2 pass: repeated the walk step, \`$CALL\` answered from the real store
- W3 pass: every finding in the table above has a verdict and evidence at evidence/$NNN/review.md:7
- W4 pass: no fix-now findings, \`codeloop verify $ID\` still says result: pass in evidence/$NNN/verify.md
- W5 pass: no deferred findings, so no proposed cards are owed, \`codeloop card list\`
EOF
  commit "docs(review): records list review approved" "Findings triaged, the one out-of-plan file kept with a reason, one walk step repeated."
  handback "codeloop check file evidence/$NNN/review.md --has 'verdict: approve' && codeloop check scope $ID && codeloop check wiki-landed $ID --stage review && codeloop check rubric $ID" "evidence/$NNN/review.md"
  ;;
staging)
  npm test >/dev/null
  cat > "evidence/$NNN/staging.md" <<'EOF'
# Staging

result: pass
checked: `npm test` exited 0 on the merged tree
note: scripted run, nothing was deployed
EOF
  commit "docs(staging): staging evidence" "Staging check recorded by the scripted builder."
  handback "codeloop check file evidence/$NNN/staging.md --has 'result: pass' && codeloop check rubric $ID" "evidence/$NNN/staging.md"
  ;;
live)
  cat > "evidence/$NNN/prod.md" <<'EOF'
# Production

result: pass
note: scripted run, nothing was deployed
EOF
  commit "docs(live): production evidence" "Production check recorded by the scripted builder."
  handback "codeloop check file evidence/$NNN/prod.md --has 'result: pass' && codeloop check rubric $ID" "evidence/$NNN/prod.md"
  ;;
*)
  echo "scripted builder has no step for stage '$STAGE'" >&2
  exit 1
  ;;
esac
FAKE_EOF
chmod +x "$WORK/fake-builder.sh"

# ------------------------------------------------------------------------------------------------
# A small Next.js-shaped repo
# ------------------------------------------------------------------------------------------------
cd "$PROJECT"
git init -q -b main
mkdir -p app components/shared src
cat > package.json <<'EOF'
{
  "name": "records-app",
  "private": true,
  "dependencies": { "next": "14.2.0", "react": "18.2.0", "react-dom": "18.2.0" },
  "scripts": { "test": "node -e \"process.exit(0)\"" }
}
EOF
cat > app/layout.tsx <<'EOF'
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>;
}
EOF
echo 'export default function Home() { return <p>Records</p>; }' > app/page.tsx
echo 'export function Card({ children }: { children: React.ReactNode }) { return <div>{children}</div>; }' > components/shared/card.tsx
echo 'export const records = [];' > src/existing-service.ts
printf 'node_modules\n.codeloop/state/\n.after-merge\n' > .gitignore

expect 0 "init runs" codeloop init --tools claude --starter generic
cat > .codeloop/config.yaml <<EOF
project:
  name: "records-app"
agents:
  default: fake
  fake:
    cmd: "$WORK/fake-builder.sh < {brief}"
    timeout_minutes: 2
layers:
  ui: ["app/**", "components/**"]
  api: ["src/**"]
git:
  trunk: main
verify:
  setup: ""
orch:
  after_merge:
    build: "echo built > .after-merge"
EOF
expect 0 "lane lint passes on the shipped lanes" codeloop lane lint
expect 0 "competitor pages added" sh -c "codeloop wiki competitor add acme --docs https://example.test/acme/docs && codeloop wiki competitor add globex --changelog https://example.test/globex/changelog"
mkdir -p .codeloop/wiki/architecture
cat > .codeloop/wiki/architecture/data-model.md <<'EOF'
# Data model

The app keeps records in one JSON file, `src/store/records.json`, read whole by `src/records-service.ts`.

| store | holds |
| --- | --- |
| records.json | the saved records |
EOF
expect 0 "start creates c-001 in the build lane" codeloop start "Saved records list" --persona founder --can "see my saved records in one list" --so "I stop losing them between sessions" --size M
SPECDIR="$(ls -d specs/*/ | head -1)"; SPECDIR="${SPECDIR%/}"
perl -0pi -e 's/^screens:[ \t]*\n/screens:\n- Records list\n- Empty state\n/m' "$SPECDIR/spec.md"
printf '\nentities:\n- Record\n' >> "$SPECDIR/spec.md"
git add -A && git commit -qm "chore: init codeloop, card c-001 and its draft spec"
expect 0 "main has the draft spec committed" test -z "$(git status --porcelain -- specs)"

orch_json() { cat .codeloop/state/orch/c-001.json; }
card_json() { codeloop card show c-001 --json; }
card_stage() { card_json | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.stage+(d.gate?'|'+d.gate:''))"; }
# last_turn <stage> <field expression over t>
last_turn() { orch_json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); const t=[...r.turns].reverse().find(x=>x.stage==='$1'&&x.outcome==='merged'); console.log(t?($2):'')"; }

# settled <stage>: the stage's merged turn is on main, its record says merged, and the card moved on.
settled() {
  local stage=$1 sha outcome
  sha="$(last_turn "$stage" t.merge.sha)"
  outcome="$(last_turn "$stage" t.outcome)"
  if [ "$outcome" = merged ]; then ok "$stage: orch record says merged"; else echo "no merged turn for $stage" > "$LOG"; bad "$stage: orch record says merged"; fi
  expect 0 "$stage: merge sha is on main" sh -c "git merge-base --is-ancestor '$sha' main && test -n '$sha'"
}


# reached <card stage|gate> <step name>: after an orch run; a miss ends the script with the run's output, since later stages cannot pass.
reached() {
  local want=$1 name=$2 got
  got="$(card_stage)"
  if [ "$got" = "$want" ]; then ok "$name"; return; fi
  echo "card is at $got, wanted $want" >> "$LOG"
  # The last gate record holds the check output the orch findings leave out.
  node -e "
const fs=require('fs'),d='.codeloop/state/gates';
const f=fs.existsSync(d)?fs.readdirSync(d).filter(x=>x.startsWith('c-001-')).map(x=>({x,t:fs.statSync(d+'/'+x).mtimeMs})).sort((a,b)=>b.t-a.t)[0]:null;
if(f){const g=JSON.parse(fs.readFileSync(d+'/'+f.x,'utf8'));console.log('last gate ('+g.stage+', '+g.verdict+'): '+(g.check.output||g.proof.output).trim().split('\\n').slice(-6).join(' | '));}" >> "$LOG" 2>&1
  bad "$name"
  echo; echo "stopping: later stages cannot run"
  finish
  exit 1
}
finish() {
  echo
  echo "stage          turn  outcome        merged"
  orch_json | node -e "
const r=JSON.parse(require('fs').readFileSync(0,'utf8'));
for (const t of r.turns) console.log(t.stage.padEnd(14), String(t.n).padEnd(5), t.outcome.padEnd(14), t.merge ? t.merge.sha.slice(0,8)+' ('+t.merge.mode+')' : '-');
"
  echo
  echo "card now: $(card_stage)"
  echo "RESULT: $pass passed, $fail failed"
}

ORCH_OUT="$WORK/orch.out"
drive() { # drive <extra orch args...>: one orch run, output kept
  codeloop orch run c-001 --builder agent:fake "$@" > "$ORCH_OUT" 2>&1
  echo "orch exit $?" >> "$ORCH_OUT"
}

# ------------------------------------------------------------------------------------------------
# research, then the interview parks on questions
# ------------------------------------------------------------------------------------------------
drive --until live
cp "$ORCH_OUT" "$LOG"
reached "interview" "run advanced past research and stopped at interview"

settled research
expect 0 "research: wiki decision page exists and carries c-001" sh -c "grep -rl 'c-001' .codeloop/wiki/decisions | head -1 | grep -q ."
expect 0 "research: check wiki-landed passes" codeloop check wiki-landed c-001 --stage research
expect 0 "research: acme competitor row matched" sh -c "grep -q '^- c-001 .*plain records list' .codeloop/wiki/competitors/acme.md"
expect 0 "research: globex competitor row matched" sh -c "grep -q '^- c-001 .*saved views only' .codeloop/wiki/competitors/globex.md"
expect 0 "research: after_merge marker file exists" test -f .after-merge
rm -f .after-merge

json "interview: first turn ended as questions with no retry" "d.turns.some(t=>t.stage==='interview'&&t.outcome==='questions')" cat .codeloop/state/orch/c-001.json
expect 0 "interview: run says it is waiting for answers" sh -c "grep -q 'waiting for answers' '$ORCH_OUT'"
expect 0 "interview: three questions with options are open" sh -c "test \"\$(grep -c '^## Q' $SPECDIR/interview.md)\" = 3 && grep -q '^options:' $SPECDIR/interview.md"
expect 0 "owner accepts every recommended answer" codeloop answer c-001 --accept-all
git add specs && git commit -qm "chore: owner answers on c-001 interview"

# ------------------------------------------------------------------------------------------------
# interview, mock, spec; park at the spec gate
# ------------------------------------------------------------------------------------------------
drive --until live
cp "$ORCH_OUT" "$LOG"
reached "spec|spec" "run advanced through interview, mock and spec and parked at the spec gate"
settled interview
settled mock
settled spec
expect 0 "mock: in-app mock page exists under app/mocks" sh -c "ls app/mocks/*/page.tsx"
expect 0 "mock: check mock passes" codeloop check mock c-001
expect 0 "spec: spec check passes the layer rule" codeloop spec check c-001
expect 0 "spec: a task naming a file in the wrong layer is refused" sh -c "cp $SPECDIR/tasks.md $WORK/tasks.bak && echo '- [ ] T009 [US1] [ui] Wrong layer \`src/records-service.ts\`' >> $SPECDIR/tasks.md && ! codeloop spec check c-001 2>&1 | tee $WORK/layer.out >/dev/null && grep -q 'is in the api layer' $WORK/layer.out; cp $WORK/tasks.bak $SPECDIR/tasks.md"
expect 0 "owner approves the spec gate" codeloop approve c-001 --as owner

# ------------------------------------------------------------------------------------------------
# data-model, build (one scope failure), verify; park at the local gate
# ------------------------------------------------------------------------------------------------
drive --until live
cp "$ORCH_OUT" "$LOG"
reached "verify|local" "run advanced through data-model, build and verify and parked at the local gate"
settled data-model
expect 0 "data-model: check data-model passes" codeloop check data-model c-001
json "build: first turn failed on the scope check, the second merged" "d.turns.filter(t=>t.stage==='build').map(t=>t.outcome).join()==='failed,merged'" cat .codeloop/state/orch/c-001.json
json "build: the failing turn's findings name the out-of-plan file and the missing Scope row" "(f=>f.includes('src/unplanned-helper.ts')&&f.includes('## Scope'))(d.turns.find(t=>t.stage==='build'&&t.outcome==='failed').findings.join(' '))" cat .codeloop/state/orch/c-001.json
settled build
settled verify
expect 0 "build: every task is ticked on main" codeloop task check c-001 --all-done
expect 0 "verify: verify.md carries a budget line" grep -q '^budget: ' evidence/001/verify.md
expect 0 "verify: verify.md carries a health line" grep -q '^health: ' evidence/001/verify.md
expect 0 "verify: verify.md says result: pass" grep -q '^result: pass' evidence/001/verify.md
expect 0 "owner approves the local gate" codeloop approve c-001 --as owner

# ------------------------------------------------------------------------------------------------
# review; park at the pr gate
# ------------------------------------------------------------------------------------------------
drive --until live
cp "$ORCH_OUT" "$LOG"
reached "review|pr" "run advanced through review and parked at the pr gate"
settled review
expect 0 "review: review.md has the Scope table row for the unplanned file" grep -q 'src/unplanned-helper.ts | keep' evidence/001/review.md
expect 0 "review: check scope passes" codeloop check scope c-001
expect 0 "reviewer approves the pr gate" codeloop approve c-001 --as reviewer

# ------------------------------------------------------------------------------------------------
# staging; the outward prod gate parks on entry to live, so the owner approves it before live runs
# ------------------------------------------------------------------------------------------------
drive --until live
cp "$ORCH_OUT" "$LOG"
reached "live|prod" "run advanced through staging and the card is parked at the prod gate"
settled staging
expect 0 "prod gate: the live stage has not run while parked" test ! -e evidence/001/prod.md
expect 0 "owner approves the prod gate (the scripted builder deploys nothing)" codeloop approve c-001 --as owner
drive
cp "$ORCH_OUT" "$LOG"
reached "done" "live stage ran after the approval and the card is done"
settled live

# ------------------------------------------------------------------------------------------------
# the whole story
# ------------------------------------------------------------------------------------------------
expect 0 "after_merge marker file exists after the last merge" test -f .after-merge
expect 0 "card show lists every builder commit as merged" sh -c "built=\$(git log main --author=scripted-builder --format=%H | wc -l | tr -d ' '); listed=\$(codeloop card show c-001 | grep -c '  merged\$'); test \"\$built\" -gt 0 && test \"\$built\" = \"\$listed\""
expect 0 "every builder commit on main carries the Card trailer" sh -c "built=\$(git log main --author=scripted-builder --format=%H | wc -l | tr -d ' '); trailed=\$(git log main --author=scripted-builder --grep='^Card: c-001\$' --format=%H | wc -l | tr -d ' '); test \"\$built\" -gt 0 && test \"\$built\" = \"\$trailed\""

finish
[ "$fail" = 0 ]
