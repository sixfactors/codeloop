---
description: Review + reflect + commit in one flow
argument-hint: [type] [scope] [message] OR [--wip]
allowed-tools: Bash(git:*), Read, Edit, Write, Glob, Grep, AskUserQuestion
---

<!-- codeloop-version: 0.2.0 -->

# /commit

Three-phase commit: **Review → Reflect → Commit**.

## Quick Usage

```bash
/commit                                       # Full flow: review → reflect → commit (auto-generate message)
/commit feat auth "add login endpoints"       # Full flow with explicit message
/commit --wip                                 # Skip review + reflect, WIP commit with --no-verify
```

---

## Phase 1: Review

### 1.1 Get the diff

```bash
git diff HEAD --name-only
git status --short
```

If nothing to commit → say "Nothing to commit" and **stop**.

### 1.2 Determine scopes from changed paths

Read `.codeloop/config.yaml` and map changed files to scopes using the `scopes` section:

```yaml
scopes:
  backend:
    paths: ["src/**", "lib/**"]
    gotcha_sections: ["Backend", "Database"]
    pattern_sections: ["Backend", "API"]
```

Match each changed file against scope paths. A file can match multiple scopes.

If no config.yaml exists, use a single "all" scope that loads everything.

### 1.3 Load dynamic rubrics

Read these files and extract rules matching the active scopes:

1. **`.codeloop/rules.md`** — all rules are always CRITICAL
2. **`.codeloop/gotchas.md`** — items with `freq >= 3` in matching sections → CRITICAL; `freq 1-2` → WARNING
3. **`.codeloop/patterns.md`** — HIGH-confidence patterns in matching sections → expectations (deviation = WARNING)

Only load sections relevant to the active scopes. Don't review the entire gotchas file for a docs-only change.

**Scope → rubric section mapping** comes from `config.yaml`:
- `gotcha_sections` defines which gotcha sections to load for that scope
- `pattern_sections` defines which pattern sections to load for that scope

### 1.4 Quality checks

Read `quality_checks` from `.codeloop/config.yaml` and run checks for active scopes:

```yaml
quality_checks:
  backend:
    - name: "Typecheck"
      command: "npx tsc --noEmit 2>&1 | tail -20"
```

If any check **fails** → report as a CRITICAL finding.

If no quality_checks defined → skip silently.

### 1.5 Scan diff for violations

Read `diff_scan` rules from `.codeloop/config.yaml`:

```yaml
diff_scan:
  - pattern: "console\\.log"
    files: "*.ts,*.js"
    exclude: "*.test.*"
    severity: CRITICAL
    message: "console.log in production code"
```

For each rule, scan the actual diff content for matches.

If no diff_scan rules → skip silently.

### 1.6 Output findings

```
## Review

**Scopes**: backend, frontend
**Rubrics loaded**: 6 CRITICAL, 3 WARNING from gotchas; 4 patterns checked

| Sev | Finding | File |
|-----|---------|------|
| CRITICAL | console.log in service code | src/foo/bar.ts:42 |
| CRITICAL | Typecheck failed (2 errors) | — |
| WARNING | Hardcoded string | src/foo/bar.ts:18 |
| CLEAN | Build passed | — |

**Verdict**: BLOCKED (2 critical)
```

Verdicts:
- **CLEAN** — no issues, proceed
- **WARNINGS** — non-blocking suggestions, proceed to commit
- **BLOCKED** — critical issues found, must fix before commit

### 1.7 If BLOCKED

Use AskUserQuestion with options:
- **Fix issues** — stop here, user fixes and re-runs `/commit`
- **Commit anyway** — override, proceed to Phase 2
- **Abort** — stop entirely

---

## Phase 2: Reflect (lightweight)

Quickly scan this session for:
1. **Gotchas** — unexpected behavior, hidden dependencies, bugs found
2. **Patterns** — approaches that worked well, shortcuts discovered

If anything found → use AskUserQuestion with multiSelect to let user pick what to save.

Save selected items to `.codeloop/gotchas.md` or `.codeloop/patterns.md`.

New gotchas get `[freq:1]`. Place them in the appropriate section (create section if needed).

If nothing worth saving → skip silently, move to Phase 3.

---

## Phase 3: Commit

### 3.1 Stage files

```bash
git add -A
git status --short
```

Show what will be committed.

### 3.2 Build commit message

**If type/scope/message provided as arguments:**
```
$TYPE($SCOPE): $MESSAGE
```

**If auto-generating**, analyze the staged diff:
- **Type**: Read allowed types from `commit.types` in config.yaml (default: feat, fix, refactor, docs, test, chore, perf)
- **Scope**: primary directory/feature from changed files
- **Message**: brief description of the "why", not the "what"

For large commits (10+ files or multiple features), include a body with grouped bullet points.

### 3.3 Create commit

```bash
git commit -m "$(cat <<'EOF'
type(scope): message

optional body
EOF
)"
```

### 3.4 Board sync

If `.codeloop/board.json` exists:
- Read the board JSON
- Find the active task: first task with status `in_progress`, then `review`, then `planned` (in that priority order)
- If no task found, warn: "Board sync skipped — no active task found in board.json" (non-blocking, commit still succeeds)
- Append the new commit SHA to the task's `commits` array
- Write the updated board back to `.codeloop/board.json`

### 3.5 Report result

```
## Committed

**Hash**: abc1234
**Message**: feat(auth): add login endpoints
**Files**: 5 changed, +120, -30
```

---

## WIP Mode (`--wip`)

Skip Phase 1 and Phase 2 entirely:

```bash
git add -A
git commit -m "chore: WIP" --no-verify
```

Report the commit hash and stop.

---

## Rubric Evolution

The review gets smarter over time:

```
Session work → discover gotcha → Phase 2 saves to gotchas.md (freq:1)
  → re-encountered in future sessions → freq increases via /reflect
  → next /commit Phase 1 picks it up at higher severity (freq >= 3 = CRITICAL)
```

No separate rubrics file. `gotchas.md` IS the rubrics source. Frequency = severity.

---

## Commit Types

| Type | When |
|------|------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring, no behavior change |
| `docs` | Documentation only |
| `test` | Adding/updating tests |
| `chore` | Maintenance, deps, config |
| `perf` | Performance improvement |

## Safety Rules

1. **ALWAYS `git add -A` first** — never leave uncommitted work
2. **Never amend pushed commits**
3. **Never skip hooks** (except `--wip`)
4. **Never push** — `/commit` only creates local commits
