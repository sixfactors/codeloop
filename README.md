# codeloop

**The full dev lifecycle for AI coding agents.**

Your AI agent plans the work, tests it, reviews its own commits, deploys to staging, debugs production, and learns from every mistake — across sessions, across tools, without you babysitting it.

![Codeloop Board](https://codeloop.sixfactors.ai/board.png)

## The Problem

AI coding tools (Claude Code, Cursor, Codex) are stateless. Every session starts from zero. You've explained that `doc.save()` has race conditions six times. You've caught `console.log` in production code on every PR. The agent never learns, because it can't remember.

Worse — the agent can write code, but it can't test, deploy, or debug. You're still the glue between "code complete" and "live in production." That's where most of the time goes.

## The Pipeline

codeloop gives your project ten slash commands that cover the full development lifecycle:

```
/design → /plan → /manage → /test → /commit → /qa → /deploy → /debug → /reflect → /ship
```

| Command | What it does |
|---------|-------------|
| `/design` | Analyze the codebase, generate a lightweight architectural spec |
| `/plan` | Write a task plan with acceptance criteria, enter plan mode |
| `/manage` | Track steps, check off progress, manage the task board |
| `/test` | Run your test suite, parse results, track coverage over time |
| `/commit` | Three-phase commit: review diff against learned rubrics → reflect on session → commit |
| `/qa` | Quality gate: static analysis + tests + coverage threshold + integrity checks |
| `/deploy` | Deploy to staging or production with verification gates |
| `/debug` | Search production logs, check health, cross-reference with recent commits |
| `/reflect` | Deep session review: scan all work, propose lessons to save |
| `/ship` | Close the loop: QA → staging → production → verify → done |

Each command reads your project's config and knowledge files. No runtime, no server — just markdown and YAML that the LLM reads directly.

## How Knowledge Compounds

Every gotcha has a frequency counter:

```
Session 1: You discover that boolean query params need Transform decorators.
           /commit saves it → gotchas.md [freq:1]
           Next review: appears as a WARNING (non-blocking)

Session 4: It comes up again. /reflect increments → [freq:2]

Session 7: Third time. → [freq:3]
           Now it's CRITICAL. /commit blocks until you confirm it's handled.

Session 20: [freq:10+]
            codeloop status says: "promote this to rules.md?"
            It graduates from gotcha to non-negotiable rule.
```

**Frequency = severity.** The more something bites you, the harder the system fights to prevent it. No configuration needed — it emerges from use.

The review is scoped too. Changed a backend file? It loads backend gotchas. Frontend only? It skips database warnings. Scopes in your config control what's relevant:

```yaml
scopes:
  backend:
    paths: ["src/**", "lib/**"]
    gotcha_sections: ["Backend", "Database"]
  frontend:
    paths: ["app/**", "components/**"]
    gotcha_sections: ["Frontend", "React"]
```

## Quick Start

```bash
npm install -g @sixfactors-ai/codeloop
cd your-project
codeloop init
```

It asks which AI tools you use, detects your tech stack, and scaffolds:

```
.codeloop/
  config.yaml       ← Scopes, quality checks, deploy/test/debug config
  rules.md          ← Non-negotiable rules (always CRITICAL in review)
  gotchas.md        ← Discovered gotchas with frequency tracking
  patterns.md       ← Proven patterns with confidence levels
  principles.md     ← How you want the AI to operate

.claude/commands/   ← 10 slash commands (Claude Code)
.cursor/commands/   ← 10 slash commands (Cursor)
.agents/skills/     ← 10 skills (Codex)

tasks/todo.md       ← Current task plan
```

The knowledge base (`.codeloop/`) is shared across all tools. Doesn't matter if you use Claude Code on Monday and Cursor on Tuesday — same gotchas, same rules.

## The Config

`.codeloop/config.yaml` controls everything. The AI reads it directly.

```yaml
project:
  name: "my-api"

# Map file paths to knowledge sections
scopes:
  backend:
    paths: ["src/**"]
    gotcha_sections: ["Backend", "Database", "API"]
  tests:
    paths: ["**/*.test.*"]
    gotcha_sections: ["Testing"]

# Build/lint checks run during /commit and /qa
quality_checks:
  backend:
    - name: "Typecheck"
      command: "npx tsc --noEmit 2>&1 | tail -20"

# Patterns banned in diffs
diff_scan:
  - pattern: "console\\.log"
    files: "*.ts,*.js"
    exclude: "*.test.*"
    severity: CRITICAL
    message: "console.log in production code"

# Test runner config (used by /test and /qa)
test:
  command: "npm test"
  coverage_threshold: 80
  integrity_checks: true

# Deployment gates (used by /deploy and /ship)
deploy:
  staging:
    command: "make deploy-staging"
    verify: "curl -sf https://staging.example.com/health"
  production:
    command: "make deploy-prod"
    verify: "curl -sf https://example.com/health"
    requires: staging

# Production debugging (used by /debug)
debug:
  logs: "fly logs --app myapp"
  health: "curl -sf https://example.com/health"

# Frequency thresholds
codeloop:
  critical_frequency: 3
  promote_frequency: 10
```

## The Commit Flow

When you type `/commit`:

```
Phase 1: Review
  ├─ Map changed files → scopes
  ├─ Load gotchas (freq ≥ 3 = CRITICAL, 1-2 = WARNING)
  ├─ Load patterns (HIGH confidence = expected)
  ├─ Run quality checks for active scopes
  ├─ Scan diff for violations
  └─ Verdict: CLEAN / WARNINGS / BLOCKED

Phase 2: Reflect (lightweight)
  ├─ Scan session for new gotchas or patterns
  ├─ Propose saves (you pick what to keep)
  └─ Write to gotchas.md or patterns.md

Phase 3: Commit
  ├─ Stage files
  ├─ Generate conventional commit message
  └─ Create commit
```

If the review finds CRITICAL issues, it blocks. You can fix them, override, or abort.

## The Deployment Pipeline

`/qa` → `/deploy staging` → `/deploy prod` forms a gate chain:

```
/qa passes           → sets env:local-pass    → unlocks staging
/deploy staging      → sets env:staging-pass  → unlocks production
/deploy prod         → sets env:prod-pass     → task is done
```

`/ship` runs the full chain in one command. If any gate fails, it stops and creates a regression task on the board.

## Watch Mode

Monitor your project in the background:

```bash
codeloop watch                # Start watching
codeloop watch --with-serve   # Watch + board server (live UI)
```

Watch detects file changes, git commits, test results, and build errors. Events are logged to `.codeloop/watch.log` and pushed to the board UI via SSE when the server is running.

## Skill Registry

Install community skills or share your own:

```bash
codeloop search "deploy"              # Find skills
codeloop install review-checklist     # Install from registry
codeloop install github:user/repo     # Install from GitHub
codeloop install ./local-skill        # Install from local path
codeloop list                         # Show installed skills
codeloop remove review-checklist      # Uninstall
```

Every installed skill gets security-validated (no `exec()`, no credential access, no pipe-to-shell) and locked with integrity hashes in `.codeloop/skills.lock`.

## Works With Everything

codeloop auto-detects your stack and tools:

| Stack | Detected by | Starter config |
|-------|-------------|----------------|
| TypeScript | `tsconfig.json` | Typecheck, console.log scan, `any` warnings |
| Python | `pyproject.toml`, `setup.py` | mypy, ruff, print() detection, pdb scan |
| Go | `go.mod` | go vet, go build, fmt.Print detection |
| Generic | Fallback | Minimal — you configure |

| Tool | Commands installed to | Compatibility |
|------|---------------------|---------------|
| Claude Code | `.claude/commands/` | Full (primary target) |
| Cursor | `.cursor/commands/` | Knowledge + config (tool hints are Claude-specific) |
| Codex | `.agents/skills/` | Knowledge + config (tool hints are Claude-specific) |

**Note**: The `allowed-tools` frontmatter in skill files uses Claude Code tool names (Bash, Read, Edit, etc.). Cursor and Codex ignore this field — the skill instructions still work, but tool restrictions aren't enforced. The knowledge files (gotchas, patterns, rules) and config are fully portable across all tools.

## CLI Reference

```bash
# Project setup
codeloop init                         # Interactive setup
codeloop init --tools claude,cursor   # Skip tool prompt
codeloop init --starter python        # Force specific stack
codeloop status                       # Knowledge stats, version check
codeloop update                       # Update skills (never touches knowledge)

# Live monitoring
codeloop watch                        # Background file + git monitor
codeloop serve                        # Board UI server (http://localhost:4242)

# Skill registry
codeloop search <query>               # Search for skills
codeloop install <name>               # Install a skill
codeloop list                         # Show installed skills
codeloop remove <name>                # Uninstall a skill
codeloop publish                      # Publish your skill to the registry
codeloop login                        # Authenticate with GitHub
```

## The Knowledge Files

**`rules.md`** — Non-negotiable. Always loaded as CRITICAL. Start with universal rules, add yours.

**`gotchas.md`** — Discovered through work. Each entry has `[freq:N]`. Severity auto-scales with frequency. Organized by sections matching your scopes.

**`patterns.md`** — What works well. HIGH-confidence patterns become expectations — deviations trigger warnings during review.

**`principles.md`** — How you want the AI to operate. Plan first? Verify before done? Write it here once, it applies everywhere.

All plain markdown. No lock-in, no proprietary format. If you stop using codeloop tomorrow, the knowledge stays as useful documentation.

## License

MIT
