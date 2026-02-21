---
description: Investigate production issues — search logs, check health, create regression tasks
argument-hint: [pattern] [--health] [--recent]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

<!-- codeloop-version: 0.2.0 -->

# /debug

Investigate production issues using configured log and health commands.

## Usage

```bash
/debug                   # Check health + show recent errors
/debug <pattern>         # Search logs for a specific pattern
/debug --health          # Health check only
/debug --recent          # Show recent log entries (last 50 lines)
```

## Phase 1: Load Config

1. Read `.codeloop/config.yaml` — load the `debug` section:
   ```yaml
   debug:
     logs: "fly logs --app myapp"
     health: "curl -sf https://myapp.fly.dev/health"
   ```

2. If no `debug` section → stop with:
   "No debug commands configured. Add them to `.codeloop/config.yaml` under `debug`."

3. Read `.codeloop/board.json` — find the active task for context

## Phase 2: Health Check

If `debug.health` is configured (always run unless `<pattern>` provided without `--health`):

1. Run the health command
2. Parse the response:
   - Exit 0 + valid response → HEALTHY
   - Non-zero exit or timeout → UNHEALTHY
3. Report:
   ```
   **Health**: ✓ healthy (200 OK, 120ms)
   ```
   or:
   ```
   **Health**: ✗ unhealthy (connection refused)
   ```

## Phase 3: Search Logs

### Default (no pattern)

Run `debug.logs` and capture the last 50 lines. Scan for common error patterns:
- `Error`, `ERROR`, `Exception`, `FATAL`
- Stack traces (indented lines starting with `at ` or `Traceback`)
- HTTP 5xx status codes
- Connection refused / timeout patterns

Summarize findings:
```
## Recent Errors (last 50 lines)

Found 3 error entries:

1. **TypeError: Cannot read property 'id' of undefined**
   at src/auth/middleware.ts:42
   Occurred 2x in last 50 lines

2. **MongoServerError: connection pool closed**
   at node_modules/mongodb/...
   Occurred 1x
```

### With pattern

Run the `debug.logs` command and pipe through `grep` with the user's pattern:
```bash
fly logs --app myapp | grep "auth"
```

Show matching lines and context. Summarize:
- How many matches found
- Timestamps of first and last match
- Common patterns in matches

## Phase 4: Cross-Reference

If the active task has commits:
1. List recent commits from the task
2. Check if any error patterns correlate with recently changed files
3. Report correlations:
   ```
   ### Possible Correlation

   Error in `src/auth/middleware.ts:42` — this file was modified in commit abc1234
   ("feat(auth): add token refresh") from the current task.
   ```

## Phase 5: Regression Task

If issues are found, use AskUserQuestion:

- **Create regression task** — add a new task to the board
- **Investigate further** — continue debugging with another pattern
- **No action** — acknowledge and stop

If creating a regression task:
1. Read `.codeloop/board.json`
2. Add a new task:
   - Title: "Fix: <error summary>"
   - Status: `backlog`
   - Labels: `regression`, `env:prod-fail` (or appropriate env)
   - Description: error details, log excerpt, and correlation info
3. Write updated board
4. Report: "Regression task t-XXX created on the board."

## Phase 6: Report

```
## Debug Summary

**Environment**: production
**Health**: ✓ healthy
**Errors found**: 3 in last 50 lines
**Pattern searched**: "auth"
**Matches**: 7 entries

### Action Taken
Created regression task t-005: "Fix: TypeError in auth middleware"
```

## Rules

- **Read-only by default.** This skill investigates — it doesn't fix or deploy.
- **Respect rate limits.** Don't hammer log endpoints. One query per debug session unless the user asks for more.
- **Surface correlations, don't blame.** "This file was changed recently" ≠ "this commit caused the bug."
- **Create tasks, not panic.** Regressions get tracked on the board — systematic, not reactive.
- **Config is required.** Without debug commands in config, this skill can't do anything. Guide the user to set them up.
