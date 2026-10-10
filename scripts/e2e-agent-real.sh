#!/usr/bin/env bash
# One real stage done by a real headless agent, in a temp project: `codeloop run --agent claude`
# has to get a research card past a check that wants `verdict:` in its output file.
#   npm run build && CODELOOP_E2E_REAL_AGENT=1 bash scripts/e2e-agent-real.sh
# It spends model tokens, so it runs only when asked for and when `claude` is on PATH.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ "${CODELOOP_E2E_REAL_AGENT:-}" = 1 ] || { echo "SKIP: set CODELOOP_E2E_REAL_AGENT=1 to run a real agent"; exit 0; }
command -v claude > /dev/null || { echo "SKIP: claude is not on PATH"; exit 0; }
[ -f "$ROOT/dist/index.js" ] || { echo "FAIL  dist/index.js missing; run npm run build"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin" "$WORK/project/.codeloop/lanes"
printf '#!/bin/sh\nexec node "%s/dist/index.js" "$@"\n' "$ROOT" > "$WORK/bin/codeloop"
chmod +x "$WORK/bin/codeloop"
export PATH="$WORK/bin:$PATH"
unset CODELOOP_ROLE
cd "$WORK/project"
git init -q

cat > .codeloop/lanes/research.yaml <<'YAML'
id: research
version: 1
metric: { name: cycle_time_days, source: cards }
trigger: { manual: true }
stages:
  - id: research
    output: research/{id}.md
    done: { cmd: "codeloop check file research/{id}.md --has verdict:" }
YAML
cat > .codeloop/config.yaml <<'YAML'
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 4
YAML

codeloop card new research "Should a todo CLI store its data as JSON or SQLite? Three sentences, then a line starting with verdict:" --id c-001 > /dev/null
codeloop run --agent claude | tee run.out
LOG=.codeloop/state/agent-runs/c-001-research-1.log
STAGE=$(codeloop card show c-001 --json | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')).stage)")
if [ "$STAGE" = done ] && grep -q 'verdict:' research/c-001.md && grep -q 'agent claude ran research' run.out; then
  echo "--- research/c-001.md"
  cat research/c-001.md
  echo "REAL AGENT PASS: claude wrote research/c-001.md, the check passed, the card is done"
else
  echo "--- $LOG"
  cat "$LOG" 2>/dev/null
  echo "REAL AGENT FAIL: card is at \"$STAGE\""
  exit 1
fi
