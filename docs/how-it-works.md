# How It Works

## The Codeloop

The core idea: development lessons compound. Every session makes the next one better.

```
Plan → Manage (Tasks) → Commit → Reflect
  ↑                                    |
  └────────────────────────────────────┘
        (lessons inform next plan)
```

### Phase 1: Plan (`/plan`)

Before building, write a plan:

1. Scan `.codeloop/gotchas.md` for relevant warnings
2. Check `.codeloop/patterns.md` for established approaches
3. Write the plan to `tasks/todo.md`
4. Enter plan mode, get user approval

### Phase 2: Manage (`/manage`)

Track progress as you build:

1. Read `tasks/todo.md` for current status
2. Mark steps complete as you go
3. Generate summaries for context

### Phase 3: Commit (`/commit`)

Three-phase commit with config-driven review:

1. **Review** — Map changed files to scopes (from `config.yaml`), load matching rubrics from gotchas.md and patterns.md, run quality checks, scan diff for violations
2. **Reflect** — Quick scan for new gotchas or patterns worth capturing
3. **Commit** — Stage, build message (conventional commits), commit

### Phase 4: Reflect (`/reflect`)

Deep session review (standalone, for multi-commit sessions):

1. Identify gotchas, patterns, and better approaches
2. Check for existing entries to increment frequency
3. Propose changes, get user approval, apply

## The Learning Loop

Frequency = severity. The more a gotcha recurs, the more seriously it's treated:

| Frequency | Severity in `/commit` | Action |
|-----------|----------------------|--------|
| 1-2 | WARNING | Non-blocking suggestion |
| 3-9 | CRITICAL | Blocks commit (user can override) |
| 10+ | CRITICAL | `codeloop status` suggests promoting to rules.md |

Rules in `rules.md` are always CRITICAL — they represent battle-tested, non-negotiable standards.

## Configuration-Driven

Everything is configured in `.codeloop/config.yaml`:

- **Scopes** map file paths to knowledge sections — `/commit` only loads relevant rubrics
- **Quality checks** run build/lint/type commands per scope
- **Diff scan** rules check the actual diff for pattern violations
- **Commit types** define allowed conventional commit prefixes

The config is read directly by the AI coding tool (it's a YAML file the LLM parses). No runtime needed.

## Knowledge Files

| File | Purpose | Written by |
|------|---------|------------|
| `.codeloop/rules.md` | Non-negotiable rules (always CRITICAL) | User + promoted gotchas |
| `.codeloop/gotchas.md` | Discovered gotchas with frequency tracking | `/commit` + `/reflect` |
| `.codeloop/patterns.md` | Proven patterns with confidence levels | `/commit` + `/reflect` |
| `.codeloop/principles.md` | Operating principles for the AI agent | User |
| `.codeloop/config.yaml` | Project configuration | `codeloop init` + user edits |

Knowledge files are **never overwritten** by `codeloop update`. They belong to the project.
