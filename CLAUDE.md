# CLAUDE.md

Quick reference for the **codeloop** project.

---

## What Is This?

A CLI tool (`codeloop`) that gives AI coding agents a self-improving workflow: **Plan → Build → Commit → Reflect**. Knowledge files (gotchas, patterns, rules) accumulate automatically through use, and frequency-driven severity escalation makes the loop smarter over time.

---

## Tech Stack

| Item | Value |
|------|-------|
| Language | TypeScript (strict, ES2022) |
| Module system | ESM (`"type": "module"`) |
| CLI framework | Commander.js |
| File ops | fs-extra |
| Config format | YAML |
| Test framework | Vitest |
| Build | `tsc` → `dist/` |
| Package manager | npm |

---

## Quick Commands

```bash
npm run build         # Compile TypeScript → dist/
npm run dev           # Watch mode compilation
npm test              # Run tests (vitest)
npm run test:coverage # Coverage report
```

---

## Project Structure

```
codeloop/
├── src/
│   ├── index.ts                  # CLI entry point (commander)
│   ├── commands/
│   │   ├── init.ts               # `codeloop init` — scaffold project
│   │   ├── status.ts             # `codeloop status` — show knowledge stats
│   │   ├── update.ts             # `codeloop update` — refresh skills
│   │   ├── serve.ts              # `codeloop serve` — visual board server
│   │   ├── lane.ts               # `codeloop lane list|show|lint|propose|eval|promote|rollback`
│   │   ├── card.ts               # `codeloop card new|show|list|advance|approve|reject`
│   │   ├── inbox.ts              # `codeloop inbox` — gates waiting, shipped, numbers
│   │   ├── run.ts                # `codeloop run [--agent] [--dry-run]` — cron lanes, agents, advance
│   │   ├── brief.ts              # `codeloop brief <card>` — the stage brief an agent is given
│   │   ├── schedule.ts           # `codeloop schedule install|remove|status` — crontab entry
│   │   ├── adopt.ts              # `codeloop adopt` — index existing skills
│   │   ├── check.ts              # `codeloop check file|gotchas|research|mock` — done-check helpers
│   │   ├── scan.ts               # `codeloop scan competitors` — changelog changes become proposed plan cards
│   │   ├── mock.ts               # `codeloop mock new`, `codeloop mocks index`
│   │   ├── pack.ts               # `codeloop pack build` — Protobox manifest
│   │   ├── spec.ts               # `codeloop spec new|check`, `codeloop task list|done|check`
│   │   ├── import.ts             # `codeloop import speckit|bmad`
│   │   ├── verify.ts             # `codeloop verify`, `codeloop stats`
│   │   ├── wiki.ts               # `codeloop wiki capture|inject|list|lint`, `codeloop learn`
│   │   ├── render.ts             # `codeloop render`, `mcp`, `gate check`, `config get`
│   │   ├── cloud.ts              # `codeloop cloud connect|status|push|pull|disconnect` (optional)
│   │   └── guard.ts              # Exit codes: 2 refusal, 3 version conflict
│   └── lib/
│       ├── board.ts              # Board data model + CRUD (immutable)
│       ├── lane.ts               # Load + lint .codeloop/lanes/*.yaml
│       ├── cards.ts              # Card store (.codeloop/cards.json), compare-and-swap writes
│       ├── engine.ts             # The only code that moves a card: create/advance/approve/reject
│       ├── cron.ts               # 5-field cron matcher (lists, ranges, steps, day names)
│       ├── clock.ts              # The current time; CODELOOP_NOW replaces it for tests and the demo
│       ├── lock.ts               # Exclusive lock file around every read-check-write
│       ├── run.ts                # Due cron slots, one agent start and one advance per card
│       ├── agent.ts              # Agent config, stage brief, headless agent process with timeout
│       ├── schedule.ts           # Crontab line for `run --agent`; install, remove, status
│       ├── inbox.ts              # Inbox lists and per-lane numbers
│       ├── skills.ts             # Skill scan, index, duplicates, done-check gaps
│       ├── proposals.ts          # Lane propose / eval / promote / rollback
│       ├── pack.ts               # Lanes + skills → Protobox skills-only manifest
│       ├── shell.ts              # PATH shim so done checks can call `codeloop`
│       ├── glob.ts               # `**` and `*` path globs
│       ├── spec.ts               # Spec folders, acceptance lines, task grammar
│       ├── import.ts             # Spec Kit and BMAD import
│       ├── verify.ts             # Use-case runners, evidence, --mutate
│       ├── stats.ts              # Numbers from card events
│       ├── wiki.ts               # Wiki pages, inject, learn thresholds, lint
│       ├── competitors.ts        # Competitor wiki pages; findings appended after a research stage
│       ├── scan.ts               # Changelog text, diff against the last scan, one proposal per competitor
│       ├── research.ts           # `check research`: verdict line, source lines, optional online check
│       ├── mock.ts               # Mock from the shared template, `check mock`, gallery index
│       ├── render.ts             # Lane stages → Claude agents, Cursor rules, Codex skills, AGENTS.md
│       ├── mcp.ts                # MCP server over stdio (same engine as the CLI)
│       ├── flow.ts               # start, approve-then-advance, and the `Next:` line
│       ├── cloud.ts              # Optional Protobox copy of the board, wiki, config and lanes; sync record (must not import cards.ts)
│       ├── config.ts             # config.yaml with the machine-only local.yaml laid over it
│       ├── detect.ts             # Stack detection (TS/Python/Go/generic)
│       ├── scaffold.ts           # File scaffolding (templates → project)
│       ├── server.ts             # Hono server + REST API + SSE
│       └── version.ts            # Semver comparison + version parsing
├── templates/
│   ├── codeloop/                 # Knowledge file templates (.codeloop/)
│   │   ├── rules.md
│   │   ├── gotchas.md
│   │   ├── patterns.md
│   │   ├── principles.md
│   │   └── board.json            # Empty board template
│   ├── lanes/                    # Lane files installed into .codeloop/lanes/ (never overwritten)
│   ├── spec/                     # research, spec, plan, tasks templates for `spec new`
│   ├── mock/template.html        # The one page shell and tokens block every mock starts from
│   ├── hooks/commit-msg          # Adds the `Feature: <card-id>` trailer from the branch name
│   ├── ci/                       # GitHub workflows written by `init --ci github`
│   ├── commands/                 # Skill templates (slash commands)
│   │   ├── plan.md
│   │   ├── manage.md
│   │   ├── commit.md
│   │   └── reflect.md
│   └── tasks/
│       └── todo.md               # Empty task plan template
├── starters/                     # Stack-specific config.yaml templates
│   ├── generic.yaml
│   ├── node-typescript.yaml
│   ├── python.yaml
│   └── go.yaml
├── specs/, usecases/, evidence/  # codeloop's own cards: spec folder, use cases, verify output
├── scripts/
│   ├── e2e-founder-loop.sh       # End-to-end proof of the lane engine against dist/
│   ├── e2e-agent-real.sh         # One stage with a real `claude -p`; SKIP unless CODELOOP_E2E_REAL_AGENT=1
│   ├── e2e-cloud.sh              # Cloud store against a local Protobox; SKIP when none runs
│   └── demo-founder-week.sh      # A whole week with a stand-in agent; every step asserted; saved run in docs/artifacts/
└── ui/                           # Next.js static kanban board (visual dashboard)
```

---

## Architecture Principles

### Immutable Board Operations
All board CRUD functions (`addTask`, `updateTask`, `moveTask`, `deleteTask`) return a **new board** — never mutate the input. This makes it safe for concurrent reads.

### Knowledge-Is-Sacred Rule
`codeloop init` and `codeloop update` **never overwrite** existing knowledge files (gotchas.md, patterns.md, rules.md, board.json). Only skill templates (.claude/commands/*.md) get updated.

### The Engine Is the Only Thing That Moves a Card
`src/lib/engine.ts` moves cards (create, propose, advance, approve, reject), and only by executing the lane file: a stage's `done.cmd` exit code decides, gates park the card for a named approver, and every action is appended to `card.events`. Writes to `cards.json` go through `writeCards`, which refuses a write made from a stale read (`ConflictError`). Lanes change only through `lane propose` → `lane eval` → `lane promote`. Run `bash scripts/e2e-founder-loop.sh` after touching any of it.

### Agents Do the Work, the Engine Still Decides
`codeloop run --agent` starts a headless agent per stage (`src/lib/agent.ts`, `src/lib/run.ts`) and then calls the same `advanceCard`. The start is written to the card as an `agent-start` event before the process runs: `max_runs_per_day` and "another run is already on this stage" are both read from those events, in the same compare-and-swap write. No agent starts for a card at a gate or for an unapproved `outward` stage. The agent process has `CODELOOP_AGENT_RUN` set, which makes `resolveRole` refuse any role but agent.

### Writes Take the Lock
Any file that is read, decided on and written back goes through `withLock` in `src/lib/lock.ts`: `cards.json`, `state/last-run.json`, `state/lane-changes.json`, the skills index, `cloud.json` and `state/sync.json`, `tasks.md`, wiki captures. A read-then-rename without it loses writes under concurrent processes.

### Nothing From a Card Reaches a Shell Unquoted
Card ids must match letters-dash-digits, and `substitute(..., { shell: true })` quotes every placeholder that is not plainly path-safe. Lane, proposal and use-case ids go through `safeName` before they become path components.

### The Board Server Has No Login
`codeloop serve` binds 127.0.0.1, answers only to a localhost host name, sends no CORS headers, and needs the start-up token, a JSON content type and a same-origin request for every write. Keep all four when adding a route.

### Checks Must Be Able to Fail
A done check or use case that cannot fail is worse than none. `lane eval` refuses a changed check with no failing fixture, `verify --mutate` refuses a use case that passes without the feature, and a use case with no runnable layer counts as a failure. In shell use cases put each assertion on its own line: under `set -e` a failing test inside an `&&` list does not stop the script.

### Frequency = Severity
Gotchas start at `[freq:1]` (WARNING). Re-encountered → frequency increments. At `freq >= 3` → CRITICAL (blocks commits). At `freq >= 10` → promote to rules.md.

### Scope-Based Context Loading
`/commit` maps changed files to scopes (from config.yaml), then loads only relevant gotcha/pattern sections. No wasted context.

### Skills Are Platform-Agnostic
Same markdown template goes to `.claude/commands/`, `.cursor/commands/`, `.agents/skills/`. Version tracked via `<!-- codeloop-version: X.Y.Z -->` HTML comments.

---

## Key Patterns

### Adding a New CLI Command

1. Create `src/commands/mycommand.ts` with `export const myCommand = new Command('mycommand')`
2. Register in `src/index.ts`: `program.addCommand(myCommand)`
3. Use `.js` extension in imports (ESM requirement)

### Adding a New Template File

1. Add the file to `templates/codeloop/` (or appropriate subdirectory)
2. Add a `ScaffoldFile` entry in `scaffold.ts` → `getKnowledgeFiles()`
3. Set `overwrite: false` for knowledge files (sacred)
4. Update the `files` array in `package.json` if needed for npm distribution

### Version Tags in Templates

Every command template must have: `<!-- codeloop-version: X.Y.Z -->`
This enables `codeloop update` to detect and refresh outdated skill installations.

---

## Testing

Tests live alongside source in `src/lib/__tests__/` and use Vitest.

```bash
npm test                    # Run all tests
npm test -- --watch         # Watch mode
npm run test:coverage       # Coverage report
```

### TDD Workflow
1. Write failing test (RED)
2. Write minimum code to pass (GREEN)
3. Refactor while tests stay green

---

## Hard Rules

1. **ESM only** — Use `.js` extensions in all imports, `"type": "module"` in package.json
2. **Immutable board ops** — Never mutate input boards/tasks
3. **Never overwrite knowledge** — `overwrite: false` on all knowledge files in scaffold
4. **Atomic file writes** — Write board.json via temp file + rename (not direct write)
5. **No `doc.save()` pattern** — Return new objects, don't mutate in place
