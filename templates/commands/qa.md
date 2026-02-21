---
description: Quality gate — run all checks before promoting a task
argument-hint: [--strict] [--skip-tests]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

<!-- codeloop-version: 0.2.0 -->

# /qa

The quality gate between coding and deployment. Runs all configured checks and gates task promotion.

> **When to use `/qa` vs `/test`**: `/test` is for quick dev feedback — run a suite, check coverage, iterate. `/qa` is the formal gate — it runs everything (`quality_checks` + `diff_scan` + full test suite + coverage threshold + integrity checks) and sets the `env:local-pass` label that unlocks `/deploy staging`. Use `/qa` when the task is code-complete and ready for promotion.

## Usage

```bash
/qa                # Run full QA suite for active task
/qa --strict       # Fail on warnings too (not just errors)
/qa --skip-tests   # Skip test suite (only run static checks)
```

## Phase 1: Gather Context

1. Read `.codeloop/config.yaml` — load `test`, `quality_checks`, `diff_scan` sections
2. Read `.codeloop/board.json` — find the active task (first `in_progress`, then `planned`)
3. Get the git diff since the task started:
   - If the task has commits, diff from the first commit to HEAD
   - If no commits yet, diff from HEAD (unstaged + staged changes)
4. Map changed files to scopes (same logic as `/commit` Phase 1)

## Phase 2: Run Checks

Execute each check category in order. A failure in any REQUIRED check blocks promotion.

### 2.1 Static Analysis

Run `quality_checks` from config for active scopes:

```yaml
quality_checks:
  backend:
    - name: "Typecheck"
      command: "npx tsc --noEmit 2>&1 | tail -20"
```

Each check: run command, capture output, exit 0 = PASS, non-zero = FAIL.

### 2.2 Diff Scan

Run `diff_scan` rules from config against the diff (same as `/commit` Phase 1.5):

```yaml
diff_scan:
  - pattern: "console\\.log"
    files: "*.ts,*.js"
    severity: CRITICAL
    message: "console.log in production code"
```

### 2.3 Test Suite

Run the test command from config (same as `/test`):

```yaml
test:
  command: "npm test"
  coverage_threshold: 80
  integrity_checks: true
```

Parse results: pass/fail/skip counts and coverage percentage.

If `integrity_checks: true`, scan test output for suspicious patterns:
- Tests with zero assertions
- `expect(true).toBe(true)` or equivalent no-op assertions
- Skipped tests (`.skip`, `@pytest.mark.skip`) — count but don't fail
- Caught exceptions that are silently swallowed

### 2.4 Coverage Gate

If `test.coverage_threshold` is set:
- Coverage >= threshold → PASS
- Coverage < threshold → FAIL with gap report

Pass `--skip-tests` to bypass 2.3 and 2.4 (only run static checks).

## Phase 3: Report

```
## QA Report

**Task**: t-003 — Add user authentication
**Scopes**: backend, tests
**Mode**: standard (--strict would fail on warnings too)

### Results

| Check | Status | Details |
|-------|--------|---------|
| Typecheck | ✓ PASS | Clean |
| Lint | ✓ PASS | Clean |
| Diff scan | ⚠ WARN | 1 TODO comment found |
| Tests | ✓ PASS | 42/42 passed (3.2s) |
| Coverage | ✓ PASS | 84% (threshold: 80%) |
| Integrity | ✓ PASS | No suspicious patterns |

### Verdict: PASS (1 warning)

Ready to promote to review.
```

Verdicts:
- **PASS** — all required checks pass, warnings are informational
- **WARN** — warnings present but no failures (blocked in `--strict` mode)
- **FAIL** — one or more required checks failed, promotion blocked

### On FAIL

Show each failure with details:
- What failed and why
- The specific output or pattern that triggered it
- Suggestion for how to fix

Use AskUserQuestion:
- **Fix issues** — stop, user fixes and re-runs `/qa`
- **Override and promote** — bypass the gate (adds `qa:override` label)
- **Abort** — stop entirely

### On PASS

Continue to Phase 4.

## Phase 4: Promote

If all checks pass (or user overrides):

1. **Board sync** — update the active task:
   - Set status to `review`
   - Add label: `env:local-pass`
   - Add label: `qa:pass` (or `qa:override` if overridden)
   - Remove any existing `qa:fail` label
   - Write updated board

2. **History** — append to `.codeloop/test-history.json` if tests were run

3. Report: "Task t-003 promoted to review. Ready for `/deploy staging`."

## Rules

- **The gate is the contract.** `/qa` is what prevents "it works on my machine."
- **Don't skip tests unless asked.** The `--skip-tests` flag exists for iteration speed, not for cheating.
- **Warnings are informational in standard mode.** They don't block unless `--strict`.
- **Override is tracked.** `qa:override` label is visible on the board — it's a code smell, not a secret.
- **Run before every deploy.** `/deploy` checks for the `env:local-pass` label.
