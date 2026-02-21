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
# Organized by scope — only runs checks for active scopes.
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

# Testing — used by /test and /qa
test:
  command: "npm test"            # Test runner command (auto-detected if omitted)
  coverage_threshold: 80         # Min coverage % for /qa gate (optional)
  integrity_checks: true         # Scan for fake-pass patterns in /qa

# Deployment — used by /deploy and /ship
deploy:
  staging:
    command: "make deploy-stg"   # Command to deploy to staging
    verify: "make smoke-stg"    # Post-deploy verification command
  production:
    command: "make deploy-prod"  # Command to deploy to production
    verify: "make smoke-prod"   # Post-deploy verification command
    requires: staging            # Must pass staging before prod

# Debugging — used by /debug
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

Then `/commit` only loads gotchas from the "Frontend" and "React" sections — not backend gotchas.

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

The `watch` section configures `codeloop watch` — a background daemon that monitors the project.

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

## Codeloop Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `critical_frequency` | 3 | Gotchas at this freq → CRITICAL in review |
| `promote_frequency` | 10 | Suggest moving to rules.md |
| `max_knowledge_lines` | 200 | Warn in `codeloop status` if exceeded |
