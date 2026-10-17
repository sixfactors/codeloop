#!/usr/bin/env bash
export CODELOOP_HOME="${CODELOOP_HOME:-$(mktemp -d)}"
# A trivial card goes create -> build -> verify -> done and writes no research.md or spec.md.
#   npm run build && bash scripts/e2e-trivial-ceremony.sh
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# CODELOOP_E2E_DIST points the steps at a separate build, so the live dist (the global npm link) is never touched.
DIST="${CODELOOP_E2E_DIST:-$ROOT/dist}"
case "$DIST" in /*) ;; *) DIST="$ROOT/$DIST" ;; esac
[ -f "$DIST/index.js" ] || { echo "FAIL  $DIST/index.js missing; run npm run build"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/project"
printf '#!/bin/sh\nexec node "%s/index.js" "$@"\n' "$DIST" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE CODELOOP_PROJECT_DIR CODELOOP_WORK_DIR CODELOOP_CARD CODELOOP_AGENT_RUN
cd "$WORK/project"

codeloop init --tools claude --starter generic > /dev/null
# The shipped build lane's stage checks need a real story; this lane keeps the shipped `when:` lines
# on the ceremony stages and makes every other check pass.
node -e "
const y=require('fs');
const stages=['research','interview','mock','spec','build','verify'].map(id=>'  - id: '+id+(['build','verify'].includes(id)?'':'\n    when: \"size >= S\"')+'\n    done: { cmd: \"true\" }').join('\n');
y.writeFileSync('.codeloop/lanes/quick.yaml','id: quick\nversion: 1\nmetric: { name: cycle_time_hours, source: cards }\nstages:\n'+stages+'\n');
"
grep -q 'when: "size >= S"' "$ROOT/templates/lanes/build.yaml" || { echo "FAIL  shipped build lane has no when: lines"; exit 1; }

codeloop card new quick "Fix the typo in the README" --size trivial --force --id c-001 > /dev/null
codeloop card advance c-001 > /dev/null
codeloop card advance c-001 > /dev/null

node -e "
const c=JSON.parse(require('fs').readFileSync('.codeloop/cards.json','utf8')).cards[0];
const seq=c.events.map(e=>e.action+':'+e.stage).join(' ');
if (seq!=='create:build advance:build advance:verify') { console.error('events: '+seq); process.exit(1); }
if (c.stage!=='done') { console.error('stage: '+c.stage); process.exit(1); }
"
for f in research.md spec.md; do
  if find . -name "$f" -not -path './.codeloop/*' | grep -q .; then echo "FAIL  $f was written"; exit 1; fi
done
echo "PASS  trivial card ran create -> build -> verify and wrote no research.md or spec.md"
