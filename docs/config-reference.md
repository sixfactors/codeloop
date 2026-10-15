# Configuration Reference

All configuration lives in `.codeloop/config.yaml`.

## Full Schema

```yaml
# Project identity
project:
  name: "my-project"           # Project name (used in status output)

# Scopes map file paths to knowledge sections.
# /commit uses scopes to determine which gotchas/patterns to load.
scopes:
  <scope-name>:
    paths: ["glob/**"]           # File patterns that belong to this scope
    gotcha_sections: ["Section"] # Gotcha sections to load for this scope
    pattern_sections: ["Section"] # Pattern sections to load for this scope

# Quality checks run during /commit Phase 1.
# Organized by scope - only runs checks for active scopes.
quality_checks:
  <scope-name>:
    - name: "Check Name"         # Display name
      command: "shell command"    # Command to run (exit 0 = pass, non-zero = fail)

# Diff scan rules check the actual diff content.
# Applied globally (not scoped).
diff_scan:
  - pattern: "regex"             # Regex pattern to search for in diff
    files: "*.ts,*.js"           # Comma-separated file globs to check
    exclude: "*.test.*"          # Comma-separated file globs to exclude
    severity: CRITICAL           # CRITICAL or WARNING
    message: "Human-readable"    # Message shown in review output

# Testing - used by /test and /qa
test:
  command: "npm test"            # Test runner command (auto-detected if omitted)
  coverage_threshold: 80         # Min coverage % for /qa gate (optional)
  integrity_checks: true         # Scan for fake-pass patterns in /qa

# Deployment - used by /deploy and /ship
deploy:
  staging:
    command: "make deploy-stg"   # Command to deploy to staging
    verify: "make smoke-stg"    # Post-deploy verification command
  production:
    command: "make deploy-prod"  # Command to deploy to production
    verify: "make smoke-prod"   # Post-deploy verification command
    requires: staging            # Must pass staging before prod

# Debugging - used by /debug
debug:
  logs: "fly logs --app myapp"   # Command to tail production logs
  health: "curl -sf url/health" # Health check command

# Conventional commit configuration.
commit:
  types: [feat, fix, ...]       # Allowed commit type prefixes
  format: "type(scope): msg"    # Commit message format hint

# Codeloop behavior settings.
codeloop:
  critical_frequency: 3          # Gotcha freq at or above this → CRITICAL in review
  promote_frequency: 10          # Suggest promoting to rules.md at this freq
  max_knowledge_lines: 200       # Warn when knowledge files exceed this line count
```

## Scopes

Scopes are the key mechanism for keeping reviews focused. When you commit, `/commit` maps each changed file to scopes, then loads only the matching gotcha and pattern sections.

Example: If you only changed files in `app/`, and your config has:

```yaml
scopes:
  frontend:
    paths: ["app/**", "components/**"]
    gotcha_sections: ["Frontend", "React"]
```

Then `/commit` only loads gotchas from the "Frontend" and "React" sections - not backend gotchas.

### Path Matching

Paths use glob patterns. A file matches a scope if it matches any of the scope's path patterns.

### Multiple Scopes

A file can match multiple scopes. All matching scopes' sections are loaded.

### No Config Fallback

If `config.yaml` doesn't exist or has no scopes, `/commit` loads all gotchas and patterns (equivalent to a single "all" scope).

## Quality Checks

Quality checks are shell commands that should exit 0 on success. Any non-zero exit is reported as a CRITICAL finding.

Pipe output through `| tail -20` to keep the review output manageable.

## Diff Scan

Diff scan rules search the actual diff content (not just file names). They're useful for catching:

- Debug statements (console.log, print, pdb)
- Security issues (.env files, hardcoded secrets)
- Style violations (explicit `any` types, TODO comments)

The `exclude` field prevents false positives in test files.

## Test

The `test` section configures how `/test` and `/qa` run your test suite.

```yaml
test:
  command: "npm test"         # Shell command to run tests
  coverage_threshold: 80      # Min coverage % for /qa gate
  integrity_checks: true      # Scan for fake-pass patterns
```

| Field | Default | Description |
|-------|---------|-------------|
| `command` | Auto-detected | Test runner command. If omitted, `/test` detects from project files (vitest, jest, pytest, go test, cargo test) |
| `coverage_threshold` | None | Minimum coverage percentage for `/qa` gate. Omit to skip coverage checking |
| `integrity_checks` | `false` | If true, `/qa` scans test output for suspicious patterns (zero assertions, no-op expects, swallowed exceptions) |

## Deploy

The `deploy` section configures `/deploy` and `/ship` with per-environment commands.

```yaml
deploy:
  staging:
    command: "make deploy-staging"
    verify: "curl -sf https://staging.example.com/health"
  production:
    command: "make deploy-prod"
    verify: "curl -sf https://example.com/health"
    requires: staging
```

| Field | Description |
|-------|-------------|
| `staging.command` | Shell command to deploy to staging |
| `staging.verify` | Post-deploy verification command (exit 0 = pass) |
| `production.command` | Shell command to deploy to production |
| `production.verify` | Post-deploy verification command |
| `production.requires` | Gate: must have `env:<value>-pass` label before prod deploy |

**Gate chain**: `/qa` sets `env:local-pass` → `/deploy staging` sets `env:staging-pass` → `/deploy prod` sets `env:prod-pass`.

## Debug

The `debug` section configures `/debug` for production investigation.

```yaml
debug:
  logs: "fly logs --app myapp"
  health: "curl -sf https://example.com/health"
```

| Field | Description |
|-------|-------------|
| `logs` | Command to tail recent production logs. When `/debug <pattern>` is used, the output is piped through `grep` automatically |
| `health` | Health check command (exit 0 = healthy) |

All fields are optional. `/debug` reports which commands are missing and guides setup.

## Watch

The `watch` section configures `codeloop watch` - a background daemon that monitors the project.

```yaml
watch:
  enabled: true
  idle_timeout: 300
  signals:
    file_change: true
    git_commit: true
    test_result: true
    build_status: true
    idle: true
  ignore:
    - node_modules
    - dist
    - .git
    - "*.log"
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master switch for watch mode |
| `idle_timeout` | `300` | Seconds of inactivity before idle signal fires |
| `signals.file_change` | `true` | Track file saves |
| `signals.git_commit` | `true` | Detect new git commits (polled every 5s) |
| `signals.test_result` | `true` | Track test runner output |
| `signals.build_status` | `true` | Track build errors |
| `signals.idle` | `true` | Fire after idle_timeout seconds of inactivity |
| `ignore` | See starter | File/directory patterns to ignore (in addition to built-in: node_modules, .git) |

Watch logs are written to `.codeloop/watch.log`. If `codeloop serve` is running, changes are also pushed via SSE.

## Agents

Used by `codeloop run --agent` and `codeloop schedule install`. With no `agents:` key, `codeloop run` only checks and advances cards.

```yaml
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 20
    max_runs_per_day: 10
  codex:
    cmd: "codex exec - < {brief}"
run:
  agent: true
```

| Key | Default | Meaning |
|---|---|---|
| `agents.default` | the only agent, when one is configured | Agent used by `run --agent` with no name. |
| `agents.<name>.cmd` | required | Shell command run in the project directory. `{brief}` is replaced with the shell-quoted path of the stage brief. |
| `agents.<name>.timeout_minutes` | 20 | The agent and its child processes are killed after this. |
| `agents.<name>.max_runs_per_day` | 10 | Starts of this agent across the project in any 24 hours. |
| `run.agent` | false | `true` makes plain `codeloop run` start agents; `--no-agent` turns it off for one run. |

## Orchestrator

Unreleased (0.5.0). Used by `codeloop orch`.

```yaml
orch:
  isolation: tree        # tree | worktree | auto
  max_builders: 2
  on_conflict: wait      # wait | worktree
  wait_minutes: 120
  lock_wait_minutes: 10
  budget: { turns: 12, agentStarts: 6, wallMinutes: 90, perStageFails: 3 }
```

| Key | Default | Meaning |
|---|---|---|
| `orch.isolation` | `tree` | `tree` runs each builder in the checked-out tree under a lease on its plan's files; `worktree` gives each story its own worktree and merges it after the gate; `auto` uses a worktree for an L story only. |
| `orch.max_builders` | 2 | Builders running at once; one over the cap is `queued` until a slot frees. |
| `orch.on_conflict` | `wait` | A story whose plan overlaps a held lease waits (`waiting-lease`); `worktree` takes a worktree instead. |
| `orch.wait_minutes` | 120 | How long `--builder session:<x>` or `person` waits for a hand-back. |
| `orch.lock_wait_minutes` | 10 | How long a second caller waits for the repo lock before stopping with `locked`. |
| `orch.budget` | 12 turns, 6 agent starts, 90 minutes, 3 fails on one stage | One budget per `orch run`, `run --due`, doctor tick and card run; the first limit reached stops it with the reason recorded. |

## Store

Unreleased (0.5.0).

| Key | Default | Meaning |
|---|---|---|
| `store.layout` | `dotfolder` | `dotfolder` keeps specs, evidence, shape, use cases, mocks and artifacts under `.codeloop/`. `root` is the pre-0.5 layout; a project that still has root folders is read as `root` until `codeloop store move --layout dotfolder`. |
| `store.home` | `repo` | `user` keeps the board and story files under `~/.codeloop/projects/<id>/`, shared by every worktree. |
| `store.move` | all | With `store.home: user`, which of cards, state, mocks, specs, shape, evidence and docs-mocks move. |

## Limits, activity and monitor

Unreleased (0.5.0).

| Key | Default | Meaning |
|---|---|---|
| `limits.max_memory_mb` | 2048 | New codeloop processes and agents wait while the codeloop processes already hold more than this; `codeloop ps --total` shows the sum. |
| `activity` | on | `activity: off` stops recording the per-story activity stream. |
| `monitor.stall_minutes` | 30 | A builder holding a card that writes nothing for this long is flagged stalled. `monitor: off` turns the monitor off. |

There is no `doctor.every` key. The doctor tick runs from the hourly `codeloop run --agent` crontab entry that the monitor installs (`codeloop schedule remove` stops it), or on demand with `codeloop doctor`.

## Codeloop Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `critical_frequency` | 3 | Gotchas at this freq → CRITICAL in review |
| `promote_frequency` | 10 | Suggest moving to rules.md |
| `max_knowledge_lines` | 200 | Warn in `codeloop status` if exceeded |
