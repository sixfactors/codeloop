---
description: Deploy to staging or production with verification gates
argument-hint: <staging|prod> [--force]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

<!-- codeloop-version: 0.2.0 -->

# /deploy

Deploy to staging or production with pre-deploy gates and post-deploy verification.

## Usage

```bash
/deploy staging          # Deploy to staging + verify
/deploy prod             # Deploy to production (requires staging pass)
/deploy staging --force  # Skip pre-deploy gate check
/deploy prod --force     # Skip staging requirement (use with caution)
```

## Phase 1: Pre-Deploy Gate

1. Read `.codeloop/config.yaml` — load the `deploy` section:
   ```yaml
   deploy:
     staging:
       command: "make deploy-staging"
       verify: "make smoke-test-staging"
     production:
       command: "make deploy-prod"
       verify: "make smoke-test-prod"
       requires: staging
   ```

2. If no `deploy` section, no command for the target environment, or the command is an empty string → stop with:
   "No deploy command configured for `<env>`. Add it to `.codeloop/config.yaml` under `deploy.<env>.command`."
   **Important**: An empty string (`command: ""`) means "not configured" — do NOT execute it.

3. Read `.codeloop/board.json` — find the active task

4. **Gate checks** (skip with `--force`):
   - For `staging`: task must have `env:local-pass` label (set by `/qa`)
   - For `prod`: task must have `env:staging-pass` label AND the `production.requires` field is checked
   - If gate fails → show what's missing and stop

5. Show the deploy plan and confirm:
   ```
   ## Deploy Plan

   **Target**: staging
   **Task**: t-003 — Add user authentication
   **Command**: make deploy-staging
   **Verify**: make smoke-test-staging

   Proceed?
   ```
   Use AskUserQuestion: **Deploy** / **Abort**

## Phase 2: Deploy

1. Run the deploy command from config
2. Capture stdout/stderr
3. If command exits non-zero → report failure and stop:
   ```
   ## Deploy Failed

   **Target**: staging
   **Exit code**: 1
   **Output**: (last 30 lines)
   ...

   Deploy aborted. Fix the issue and retry with `/deploy staging`.
   ```

## Phase 3: Verify

If a `verify` command is configured for this environment:

1. Wait 5 seconds for the deployment to stabilize (configurable services may need warm-up)
2. Run the verify command
3. If verify exits non-zero → report failure:
   ```
   ## Verification Failed

   **Target**: staging
   **Deploy**: succeeded
   **Verify**: FAILED
   **Output**: (last 30 lines)
   ...

   The deployment succeeded but verification failed.
   Check the verify command output and re-run `/deploy staging` after fixing.
   ```

If no verify command → skip verification, report deploy-only result.

## Phase 4: Board Sync

On successful deploy + verify:

1. Update the active task in `.codeloop/board.json`:
   - For staging: add label `env:staging-pass`, remove any `env:staging-fail`
   - For prod: add label `env:prod-pass`, remove any `env:prod-fail`
   - Write updated board

2. On failure:
   - Add label `env:staging-fail` or `env:prod-fail`
   - Write updated board

## Phase 5: Report

```
## Deploy Complete

**Target**: staging
**Task**: t-003 — Add user authentication
**Deploy**: ✓ succeeded
**Verify**: ✓ passed
**Label**: env:staging-pass

Next: `/deploy prod` when ready.
```

Or for production:
```
## Deploy Complete

**Target**: production
**Task**: t-003 — Add user authentication
**Deploy**: ✓ succeeded
**Verify**: ✓ passed
**Label**: env:prod-pass

Task is production-verified. Close with `/manage close` or `/ship`.
```

## Rules

- **Never deploy without confirmation.** Always show the plan and ask.
- **Respect the gate chain.** `local-pass` → `staging-pass` → `prod-pass`. Don't skip stages without `--force`.
- **`--force` is tracked.** If used, add a `deploy:forced` label to the task — visible on the board.
- **Verify is not optional.** If a verify command is configured, it runs. Failures are reported even though the deploy succeeded.
- **This skill runs commands — it doesn't know your infra.** The user is responsible for configuring correct deploy and verify commands.
