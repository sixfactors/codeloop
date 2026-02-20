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
│   │   └── serve.ts              # `codeloop serve` — visual board server
│   └── lib/
│       ├── board.ts              # Board data model + CRUD (immutable)
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
└── ui/                           # Next.js static kanban board (visual dashboard)
```

---

## Architecture Principles

### Immutable Board Operations
All board CRUD functions (`addTask`, `updateTask`, `moveTask`, `deleteTask`) return a **new board** — never mutate the input. This makes it safe for concurrent reads.

### Knowledge-Is-Sacred Rule
`codeloop init` and `codeloop update` **never overwrite** existing knowledge files (gotchas.md, patterns.md, rules.md, board.json). Only skill templates (.claude/commands/*.md) get updated.

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
