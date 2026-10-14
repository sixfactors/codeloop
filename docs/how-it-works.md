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

## Orchestrator

`codeloop orch <card>` runs one story stage as seven steps: worktree, brief, builder, hand-back, gate, merge, record. The builder is the configured agent started inside the story's worktree with `CODELOOP_CARD` and `CODELOOP_PROJECT_DIR` set, so its hand-back lands on the main tree's board. The brief ends with the orchestration rules and the exact `codeloop card handback ... --worktree` line the builder must finish with. A turn that merges advances the card; a turn that fails keeps its findings for the next brief and costs one of the lane's retries, and the last one parks the story stuck. Each turn is recorded in `.codeloop/state/orch/<card>.json` and as an `orch` activity line. `--until <gate>` keeps going stage by stage; any gate stops the run. `codeloop orch status` and `codeloop orch report <card>` show where each story stands.

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

## Health score

`codeloop health` scores the project from 0 to 100; `codeloop verify` scores the story's base (the merge-base with `git.trunk` when the story is on its own branch, else the commit before its first `Card:` commit) and HEAD, writes a `health:` line to `evidence/NNN/verify.md`, and fails when the score falls by more than `health.tolerance` (default 1.0 point, so a single TODO line does not block a merge). `codeloop card health <id>` shows the same numbers. Both sides are measured on a git export of the commit, so they are comparable.

| Input | How it is counted |
|---|---|
| tests | files matching `health.tests` (default `**/*.test.{ts,js,py}`, `**/__tests__/**`) and the `it(`, `test(` and `def test_` lines in them |
| lint | errors from `health.lint_cmd`; skipped when unset |
| types | `error TS` lines from `health.types_cmd`; default `npx tsc --noEmit` when `tsconfig.json` exists |
| gotchas | wiki gotcha pages with severity critical |
| todo | TODO and FIXME lines in non-test files matching `health.source` (default `src/**`) |

Formula: `t = w.tests * cases`, `tests = t / (t + 10)`, `penalty = w.lint*lint + w.types*types + w.gotchas*gotchas + w.todo*todo`, `score = 100 * tests / (1 + penalty / 10)`. Defaults for `health.weights`: tests 1, lint 1, types 1, gotchas 2, todo 0.2. `health: off` disables the check.

## Knowledge Files

| File | Purpose | Written by |
|------|---------|------------|
| `.codeloop/rules.md` | Non-negotiable rules (always CRITICAL) | User + promoted gotchas |
| `.codeloop/gotchas.md` | Discovered gotchas with frequency tracking | `/commit` + `/reflect` |
| `.codeloop/patterns.md` | Proven patterns with confidence levels | `/commit` + `/reflect` |
| `.codeloop/principles.md` | Operating principles for the AI agent | User |
| `.codeloop/config.yaml` | Project configuration | `codeloop init` + user edits |

Knowledge files are **never overwritten** by `codeloop update`. They belong to the project.
