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

1. **Review** - Map changed files to scopes (from `config.yaml`), load matching rubrics from gotchas.md and patterns.md, run quality checks, scan diff for violations
2. **Reflect** - Quick scan for new gotchas or patterns worth capturing
3. **Commit** - Stage, build message (conventional commits), commit

### Phase 4: Reflect (`/reflect`)

Deep session review (standalone, for multi-commit sessions):

1. Identify gotchas, patterns, and better approaches
2. Check for existing entries to increment frequency
3. Propose changes, get user approval, apply

## Orchestrator

Unreleased: everything on this page about `orch`, `.codeloop/` layout and `off` is on the trunk as 0.5.0 and is not in the published 0.4.3.

By default every builder works in the one main tree (`orch.isolation: tree`): it runs on the checked-out branch, holds a lease on the files its plan's `## Files` list names, and commits with its `Card:` trailer. The gate runs on HEAD over the story's own trailered commits, and nothing is merged because the work is already on the branch. The repo lock covers placing a turn and gating it, not the builder's run, so up to `orch.max_builders` (default 2) builders work at once on disjoint plans. A story whose plan overlaps a held lease waits with `waiting-lease`, naming the holder, and a builder over the cap is `queued`; the doctor tick starts both again once they can run. A failed gate is fixed forward with a new commit; the orchestrator never resets or reverts. `orch.isolation: worktree` gives each story its own worktree and merges it after the gate, `auto` does that for an L story only, and `orch.on_conflict: worktree` takes a worktree instead of waiting. `codeloop worktree prune` removes worktrees whose branch is merged and whose tree is clean.

`codeloop orch run <card>` (or `codeloop orch <card>`) runs one story stage as seven steps: place (tree lease or worktree), brief, builder, hand-back, gate, merge, record. The builder is the configured agent started in the story's tree or worktree with `CODELOOP_CARD` and `CODELOOP_PROJECT_DIR` set, so its hand-back lands on the main tree's board. The brief ends with the orchestration rules and the exact `codeloop card handback ... --worktree` line the builder must finish with. A turn that merges advances the card; a turn that fails keeps its findings for the next brief and costs one of the lane's retries, and the last one parks the story stuck. Each turn is recorded in `.codeloop/state/orch/<card>.json` and as an `orch` activity line. `--until <gate>` keeps going stage by stage; any gate stops the run. `codeloop orch status` and `codeloop orch report <card>` show where each story stands.

After a merge the orchestrator does what a person otherwise runs by hand on the main tree, at the merged HEAD: `codeloop verify <card>` when the merged stage is verify or later, then the project's own commands from config, `orch: { after_merge: { build: "<cmd>", restart: "<cmd>" } }` (codeloop's own are `npm run build:all` and `codeloop hub --stop && codeloop hub --port 4050`; a compose project might use `make up`). Each step writes a `post-merge` activity line with its exit and the last 4 kB of output. The first one that fails stops the rest and parks the story stuck with that output as the finding, so a merge that broke the build is never reported as working. A story worktree gets codeloop's git guard hooks only when the main tree already runs them: git hooks live in the repository's shared hooks folder, so installing them from a worktree would install them for the main tree as well. `codeloop orch report <card>` names the proof and the gate verdict of the turn that merged.

A scheduled run or the doctor does not rerun a failed stage check until something under the card's spec, evidence or use-case folder, its events, activity or commits is newer than the last fail; it writes one `check-skipped` activity line per day, and `card check` or Check now always runs.

The builder is an agent by default. `--builder session:<id-or-label-prefix>` or `--builder person` starts nothing: the orchestrator writes the brief, appends it to `.codeloop/state/orch/outbox/<session>.md` (or `person.md`), writes an `orch-brief` activity line with `to`, prints the brief path and the hand-back line, and polls for a hand-back recorded after the turn began, every 15 seconds, up to `orch.wait_minutes` (default 120) or `--wait <min>`. A builder quiet for `monitor.stall_minutes` gets one `doctor` nudge line. No hand-back in time fails the turn with "no hand-back within the wait" and costs a retry. `--no-wait` returns at once with outcome `briefed`; `codeloop orch resume <card>` gates, merges and advances once the hand-back exists, and `codeloop orch inbox` prints the briefs addressed to this session or to the person that are still unanswered.

## Commands added in 0.5.0 (unreleased)

| Command | What it does |
|---|---|
| `codeloop orch run <card> [--builder agent\|session:<x>\|person] [--until <gate>]` | Runs a story's stages through a builder, gating each hand-back. |
| `codeloop orch status`, `report <card>`, `resume <card>`, `inbox` | Show stories under orchestration, report a story, finish a briefed turn, list waiting briefs. |
| `codeloop off [--for 2h] [--why "..."]`, `codeloop on` | Pause and resume codeloop in this repo; `CODELOOP_OFF=1` pauses one process tree. |
| `codeloop doctor` | Runs one doctor tick now and names legacy folders; prints each action as it happens, `--dry-run` lists what it would do and changes nothing, `--no-checks` skips rerunning checks, and a rerun check stops after 10 minutes as a `check-error`. |
| `codeloop ps [--kill-orphans] [--total]` | Lists codeloop processes with memory and the agents it started; kills orphans only. |
| `codeloop agent clear <name>` | Lets an agent marked unavailable run again. |
| `codeloop worktree prune` | Removes worktrees whose branch is merged and whose tree is clean. |
| `codeloop store move --layout dotfolder [--dry-run]`, `--to user\|repo`, `store where` | Move story folders under `.codeloop/`, move the board to a per-user store, print where each path resolves. |
| `codeloop hub --restart` | Stops the hub, waits for its port to close, starts a new one. |
| `codeloop hookd` | The resident hook daemon, started by the hook script; it takes `guard session` from about 3 s to 0.3 s and exits after 10 idle minutes. |

Also unreleased: stage rubrics (`codeloop check rubric`), `codeloop answer --accept-all`, wiki write rules with near-duplicate merging, and the story journey on the board (activity stream, stepper, phase board with holder rows, one state per card: Working, Needs you, Failing, Stuck, Stale, Moving). Board and Home read git and activity once per request.

`codeloop progress [--since 7d] [--json]` reports how stories moved in a window (stage moves, median hours per stage, waits, stuck stories, gates, repeated failing checks) from the board, events and activity streams, with no model call.

### Moving a story by hand

`codeloop card reopen` brings a done or dropped card back to its lane's first stage (or to the backlog as a proposal), `card move` puts an active card at any other stage of its lane, and `card edit` changes its title, story, priority, feature or size. Moving back past a gate that was passed needs a note saying why, a reopen or move resets the target stage's retries and clears the gate, and all three are refused while a builder or a run holds the card. Each writes one event (`reopen`, `move`, `edit`) that the board, the activity stream and the story page show (`src/lib/story-control.ts`).

## Everything under .codeloop

codeloop never writes into a project's source tree. What it owns is under `.codeloop/`: the board, config, lanes and wiki, and with `store.layout: dotfolder` (the default) the story folders too.

| Content | Path |
|---|---|
| specs | `.codeloop/specs/NNN-slug/` |
| evidence | `.codeloop/evidence/NNN/` |
| shape | `.codeloop/shape/c-NNN/` |
| use cases | `.codeloop/usecases/NNN/` |
| mocks gallery and older per-topic mocks | `.codeloop/mocks/`, `.codeloop/mocks/archive/` |
| artifacts | `.codeloop/artifacts/` |
| state, briefs, runs, activity, locks | `.codeloop/state/` (ignored) |

The only writes outside are the host files a project opted into (`CLAUDE.md`, `AGENTS.md`, `.claude/`, `.cursor/`, `.agents/`, git hooks) and, with `mock.target: app`, the app's own mocks folder. `src/lib/paths.ts` is the one module that knows these folders; a layering test fails on a root-relative story path anywhere else, and a write-guard test runs a story's writers on a fixture and fails on any change outside `.codeloop/`. `store.layout: root` keeps `specs/`, `evidence/`, `shape/`, `usecases/`, `docs/mocks` and `docs/artifacts` at the repo root for a project that cannot move yet; a project that still has them is read that way, prints a notice on each command, and `codeloop doctor` names the folders. `codeloop store move --layout dotfolder --dry-run` shows the move, and without `--dry-run` it makes it.

## Turning codeloop off for a while

`codeloop off --for 2h --why "spike"` pauses codeloop in this repo; without `--for` the pause lasts until `codeloop on`. While paused, every hook (edit, prompt, session, stop, commit, presence) exits 0 before reading the board and writes no activity line, and `codeloop orch`, `run` and the doctor refuse to start a turn, naming the reason and the end time. The state is `.codeloop/state/off.json` (`until`, `why`, `by`, `at`); a past `until` counts as on and the file is removed on the next read. `CODELOOP_OFF=1` in the environment pauses one process tree without a file. The one thing still active is the permission prompt on `codeloop approve`, `reject` and `answer` run by an assistant, since those are the person's decisions.

## One board for every worktree

A command run in a linked worktree with no `CODELOOP_PROJECT_DIR` resolves the project to the repository's main tree (`git rev-parse --git-common-dir`), so every worktree reads and writes the one board. Where the board and story files live is `store.home` in `.codeloop/config.yaml`:

| store.home | cards.json, specs/, evidence/, shape/, mocks, .codeloop/state | Story files while a story is on a branch |
|---|---|---|
| `repo` (default) | in the repository | in the story's worktree (`CODELOOP_WORK_DIR`, else the worktree the command runs in) until the merge |
| `user` | `~/.codeloop/projects/<id>/` (the hub registry id, else the main tree's folder name), reached through symlinks in the main tree | in that one store, whatever the checkout; the work-dir split does nothing |

The wiki, lanes and config stay in the repository in both modes. `store.move` names which paths `user` home takes, from `cards`, `state`, `mocks`, `specs`, `shape`, `evidence` and `docs-mocks` (default all of them); a project whose evidence and mocks are tracked on purpose, as the proof that ships with the code, sets `store.move: [cards, state, specs, shape]` and keeps the rest in the repository. `codeloop store move --to user` copies the files to the per-project folder and sets `store.home: user`; the repo copies are left for you to delete (it prints the `git rm` and `.gitignore` lines), and until they are gone every command refuses rather than read a stale copy. Once they are gone the next command links each path into the store. `codeloop store move --to repo` copies them back. `codeloop store where` prints the resolved paths.

## The Learning Loop

Frequency = severity. The more a gotcha recurs, the more seriously it's treated:

| Frequency | Severity in `/commit` | Action |
|-----------|----------------------|--------|
| 1-2 | WARNING | Non-blocking suggestion |
| 3-9 | CRITICAL | Blocks commit (user can override) |
| 10+ | CRITICAL | `codeloop status` suggests promoting to rules.md |

Rules in `rules.md` are always CRITICAL - they represent battle-tested, non-negotiable standards.

## Configuration-Driven

Everything is configured in `.codeloop/config.yaml`:

- **Scopes** map file paths to knowledge sections - `/commit` only loads relevant rubrics
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
