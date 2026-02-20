# codeloop

Your AI coding agent makes the same mistake twice. You explain the fix. Next week, it makes it again. New session, clean slate, lesson lost.

**codeloop** fixes this. It gives your project a memory that survives across sessions — and gets smarter every time you commit.

## The Problem

AI coding tools (Claude Code, Cursor, Codex) are stateless. Every session starts from zero. You've explained that `doc.save()` has race conditions six times. You've caught `console.log` in production code on every PR. The agent never learns, because it can't remember.

Your team's hard-won knowledge — the gotchas, the patterns, the "don't do that, here's why" — lives in people's heads. Not where the AI can use it.

## The Loop

codeloop creates a closed feedback loop between you and your AI agent:

```
Plan → Build → Commit → Reflect
  ↑                         |
  └─────────────────────────┘
      lessons feed back in
```

Four slash commands. That's the entire interface.

**`/plan`** reads your project's known gotchas before you start. "Last time we touched auth, we forgot to scope queries by workspace." The agent plans around landmines it hasn't personally stepped on yet.

**`/commit`** does a three-phase commit: first it **reviews** your diff against learned rubrics (not just lint rules — *your team's actual mistakes*), then it **reflects** on what happened this session ("we discovered that collection names are inconsistent — save this?"), then it commits. One command, three layers of quality.

**`/reflect`** is the deep version. End of a long session, multiple commits, hard-fought bugs. It scans everything that happened and proposes lessons to save. You pick what matters. It writes to your knowledge base.

**`/manage`** tracks the plan. Check off steps, add new ones, get a summary of where things stand.

## How Knowledge Compounds

Here's where it gets interesting. Every gotcha has a frequency counter:

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

The review isn't one-size-fits-all either. Changed a backend file? It loads backend gotchas. Frontend only? It skips database warnings entirely. Scopes in your config file control what's relevant:

```yaml
scopes:
  backend:
    paths: ["src/**", "lib/**"]
    gotcha_sections: ["Backend", "Database"]
  frontend:
    paths: ["app/**", "components/**"]
    gotcha_sections: ["Frontend", "React"]
```

## What Gets Created

```bash
npm install -g codeloop
cd your-project
codeloop init
```

It asks which AI tools you use, detects your tech stack, and scaffolds:

```
.codeloop/
  config.yaml       ← Scopes, quality checks, diff scan rules
  rules.md          ← Non-negotiable rules (always CRITICAL)
  gotchas.md        ← Discovered gotchas with frequency tracking
  patterns.md       ← Proven patterns with confidence levels
  principles.md     ← Operating principles for the AI agent

.claude/commands/   ← Slash commands (Claude Code)
.cursor/commands/   ← Slash commands (Cursor)
.agents/skills/     ← Skills (Codex)

tasks/todo.md       ← Current task plan
```

The knowledge base (`.codeloop/`) is shared across all tools. Doesn't matter if you use Claude Code on Monday and Cursor on Tuesday — same gotchas, same patterns, same rules.

## The Config

`.codeloop/config.yaml` is the brain. The AI reads it directly — no runtime, no server, just a YAML file the LLM parses.

```yaml
project:
  name: "my-api"

scopes:
  backend:
    paths: ["src/**"]
    gotcha_sections: ["Backend", "Database", "API"]
    pattern_sections: ["Backend", "Error Handling"]
  tests:
    paths: ["**/*.test.*", "**/*.spec.*"]
    gotcha_sections: ["Testing"]

quality_checks:
  backend:
    - name: "Typecheck"
      command: "npx tsc --noEmit 2>&1 | tail -20"

diff_scan:
  - pattern: "console\\.log"
    files: "*.ts,*.js"
    exclude: "*.test.*"
    severity: CRITICAL
    message: "console.log in production code"

codeloop:
  critical_frequency: 3
  promote_frequency: 10
```

**Scopes** connect file paths to knowledge sections — so `/commit` only loads relevant rubrics.

**Quality checks** run build/lint/type commands and report failures as CRITICAL.

**Diff scan** searches the actual diff for patterns you've banned (debug statements, .env files, explicit `any` types).

## The Commit Flow

When you type `/commit`, this happens:

```
Phase 1: Review
  ├─ Map changed files → scopes (from config.yaml)
  ├─ Load gotchas for those scopes (freq ≥ 3 = CRITICAL, 1-2 = WARNING)
  ├─ Load patterns (HIGH confidence = expected, deviation = WARNING)
  ├─ Load rules (always CRITICAL)
  ├─ Run quality checks for active scopes
  ├─ Scan diff for violations
  └─ Verdict: CLEAN / WARNINGS / BLOCKED

Phase 2: Reflect (lightweight)
  ├─ Scan session for new gotchas or patterns
  ├─ Propose saves (you pick what to keep)
  └─ Write to .codeloop/gotchas.md or patterns.md

Phase 3: Commit
  ├─ Stage files
  ├─ Generate conventional commit message
  └─ Create commit
```

If the review finds CRITICAL issues, it blocks. You can fix them, override, or abort. No silent failures.

## Works With Everything

codeloop auto-detects your stack and your tools:

| Stack | Detected by | Starter config |
|-------|-------------|----------------|
| TypeScript | `tsconfig.json` | Typecheck, console.log scan, `any` warnings |
| Python | `pyproject.toml`, `setup.py` | mypy, ruff, print() detection, pdb scan |
| Go | `go.mod` | go vet, go build, fmt.Print detection |
| Generic | Fallback | Minimal — you configure |

| Tool | Commands go to | Format |
|------|---------------|--------|
| Claude Code | `.claude/commands/` | Markdown + frontmatter |
| Cursor | `.cursor/commands/` | Markdown + frontmatter |
| Codex | `.agents/skills/` | SKILL.md with YAML frontmatter |

## CLI

```bash
codeloop init                        # Interactive setup
codeloop init --tools claude,cursor  # Skip tool prompt
codeloop init --starter python       # Force specific stack

codeloop status                      # Knowledge stats, version check
codeloop update                      # Update skills (never touches knowledge)
codeloop update --dry-run            # Preview what would change
```

`init` never overwrites existing knowledge files. Your gotchas and patterns are sacred.

`update` refreshes the slash commands to the latest version (version-tagged with `<!-- codeloop-version: X.Y.Z -->`). Knowledge files are never touched.

## The Knowledge Files

These are the files that make your project smarter:

**`rules.md`** — Non-negotiable. Always loaded as CRITICAL. Start with 4 universal rules, add yours.

**`gotchas.md`** — Discovered through work. Each entry has `[freq:N]`. The system auto-promotes severity as frequency climbs. Organized by sections that match your scopes.

**`patterns.md`** — What works well. HIGH-confidence patterns become expectations — deviations trigger warnings during review.

**`principles.md`** — How you want the AI to operate. Plan first? Verify before done? Subagents for research? Write it here once, it applies everywhere.

All of these are plain markdown. No lock-in, no proprietary format. If you stop using codeloop tomorrow, the knowledge stays in your repo as useful documentation.

## License

MIT
