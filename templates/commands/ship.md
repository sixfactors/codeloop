---
description: Close the loop — QA, deploy staging, deploy prod, verify, close task
argument-hint: [--from-staging] [--dry-run]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

<!-- codeloop-version: 0.2.0 -->

# /ship

Orchestrate the full pipeline from QA to production. Takes a task from code-complete to done.

## Usage

```bash
/ship                    # Full pipeline: QA → staging → prod → close
/ship --from-staging     # Skip QA + staging (already staging-verified)
/ship --dry-run          # Show what would happen without executing
```

## Overview

`/ship` chains together existing skills in sequence:

```
/qa → /deploy staging → /deploy prod → /manage close
```

Each step is a gate. If any step fails, the pipeline stops and creates a regression task.

## Phase 1: Pre-Flight

1. Read `.codeloop/config.yaml` — verify `deploy` section exists with non-empty staging and production commands (empty string = not configured → stop)
2. Read `.codeloop/board.json` — find the active task
3. If no active task → stop: "No active task found. Use `/plan` to create one."
4. Check current task labels to determine starting point:
   - Has `env:prod-pass` → "Task already production-verified. Use `/manage close` to finish."
   - Has `env:staging-pass` (or `--from-staging`) → skip to production deploy
   - Has `env:local-pass` → skip to staging deploy
   - No env labels → start from QA

5. If `--dry-run`, show the plan and stop:
   ```
   ## Ship Plan (dry run)

   **Task**: t-003 — Add user authentication
   **Starting from**: QA (no env labels)

   Steps:
   1. Run /qa (quality gate)
   2. Deploy to staging + verify
   3. Deploy to production + verify
   4. Close task + archive

   No actions taken.
   ```

## Phase 2: QA Gate

Skip if task already has `env:local-pass`.

1. Run the same checks as `/qa`:
   - Quality checks for active scopes
   - Diff scan
   - Test suite
   - Coverage gate
2. If **FAIL** → stop pipeline, report which check failed, create regression task
3. If **PASS** → add `env:local-pass` label, continue

Report progress:
```
## Ship Progress

[✓] QA gate passed
[ ] Deploy to staging
[ ] Deploy to production
[ ] Close task
```

## Phase 3: Deploy Staging

Skip if task already has `env:staging-pass`.

1. Run staging deploy command from config
2. If deploy fails → stop pipeline, add `env:staging-fail` label, create regression task
3. Wait 5 seconds, run staging verify command
4. If verify fails → stop pipeline, add `env:staging-fail` label, create regression task
5. If both succeed → add `env:staging-pass` label, continue

```
## Ship Progress

[✓] QA gate passed
[✓] Staging deployed + verified
[ ] Deploy to production
[ ] Close task
```

## Phase 4: Deploy Production

**Always confirm before production deploy:**

```
## Production Deploy

Task t-003 has passed QA and staging verification.

Ready to deploy to production?
```

Use AskUserQuestion: **Deploy to production** / **Stop here** / **Abort and rollback**

If confirmed:
1. Run production deploy command from config
2. If deploy fails → stop, add `env:prod-fail` label, create regression task
3. Wait 5 seconds, run production verify command
4. If verify fails → stop, add `env:prod-fail` label, create regression task
5. If both succeed → add `env:prod-pass` label, continue

```
## Ship Progress

[✓] QA gate passed
[✓] Staging deployed + verified
[✓] Production deployed + verified
[ ] Close task
```

## Phase 5: Close

1. Update the board task:
   - Set status to `done`
   - Add label: `shipped`
2. Archive the task file:
   - Move `tasks/todo.md` to `tasks/done/<task-slug>.md` (create dir if needed)
3. Final report

## Phase 6: Report

### On Success

```
## Shipped ✓

**Task**: t-003 — Add user authentication
**Pipeline**: QA → staging → production → done

| Stage | Status | Duration |
|-------|--------|----------|
| QA | ✓ pass | 12s |
| Staging | ✓ deployed + verified | 45s |
| Production | ✓ deployed + verified | 52s |

Task archived to `tasks/done/add-user-authentication.md`.
Board updated: t-003 → done.
```

### On Failure

```
## Ship Failed at: staging deploy

**Task**: t-003 — Add user authentication
**Failed step**: Deploy to staging
**Error**: Exit code 1 — "Error: no instances available"

Regression task t-006 created: "Fix: staging deploy failure for auth feature"
Pipeline stopped. Fix the issue and re-run `/ship --from-staging`.
```

## Regression Task Creation

When any step fails:
1. Create a new task on the board:
   - Title: "Fix: <failure summary>"
   - Status: `backlog`
   - Labels: `regression`, `env:<stage>-fail`
   - Description: full error output, which step failed, and the original task reference
2. The original task stays at its current status (not moved to done)

## Rules

- **Always confirm production.** Never auto-deploy to production — the human makes the final call.
- **The pipeline is sequential.** QA → staging → prod. No skipping without explicit flags.
- **Failure creates tracking.** Every failure gets a regression task — nothing falls through the cracks.
- **Idempotent resumption.** `/ship` checks labels and skips already-passed stages. Safe to re-run after fixing a failure.
- **`--from-staging` trusts staging.** Use when you've already verified staging manually or in a previous run.
