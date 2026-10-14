# Changelog

One section per published version of `@protoboxai/codeloop`, newest first. A version is published
when `npm publish` ran for it; "unreleased" is on the branch and not on the registry. Entries say
what a user can now do, not which files moved. `src/__tests__/changelog.test.ts` fails the build
when package.json names a version this file has no heading for.

## 0.5.0 (unreleased)

- Signing in to the board survives a hub restart.
- `layers:` in config.yaml maps a layer tag to path globs, and `codeloop spec check` fails a task tagged `[api]` that names a file in the `ui` layer (or the reverse); `codeloop init` writes the default block.
- `codeloop verify` fails a story whose diff exceeds the budget for its size (S 8 files / 300 lines, M 20 / 1,200, L 40 / 3,000; `diff_budget:` overrides, `budget: off` disables) and writes a `budget:` line to evidence; `codeloop card diff <id>` shows the numbers.
- `codeloop card worktree <card>` gives a story its own git worktree (`../<repo>-wt-<card>`) and branch (`feat/<feature or lane>-<title>`) cut from `git.trunk`, recorded on the card; `codeloop card merge <card>` fast-forwards it into the trunk (merge commit when it cannot), refused unless the latest gate passed and no file the branch changed is dirty in the main tree (`POST /api/cards/:id/worktree`, `POST /api/cards/:id/merge`).
- The build lane has a `data-model` stage between spec and build: `codeloop check data-model <card>` passes when no task is tagged `[data]` and spec.md names no `entities:`, and otherwise needs `specs/NNN/data-model.md` (Entities, Stores, Indexes, Migration) whose every store is named on `.codeloop/wiki/architecture/data-model.md`. Run `codeloop lane refresh build` to pick it up.
- The review stage fails while a file the story changed outside its plan has no verdict: `codeloop check scope <card>` lists each one with its line count, and evidence/<nnn>/review.md needs a `## Scope` row per file saying `keep` (reason of 10+ words), `revert`, or `move to <card-id>`. Run `codeloop lane refresh build` to pick it up.
- `codeloop orch <card> [--until <gate>] [--agent <name>] [--dry-run]` runs a story's current stage through a builder agent in the story's worktree, gates its newest hand-back, merges on a pass and advances the card; a failed gate or a missing hand-back costs a retry and its findings go into the next brief ("Latest gate findings"), and the last retry parks the story stuck. `codeloop orch status` lists stories under orchestration, `codeloop orch report <card>` prints what works now, proof, what is left and the next gate (`POST /api/cards/:id/orch`, `GET /api/orch/status`, `GET /api/cards/:id/orch`, `orch.run/status/report` on both SDK transports).
- `CODELOOP_PROJECT_DIR` points card, hook, verify, check, inbox, ask and brief commands at the main tree's board when a builder runs inside a story worktree.

### Watch an agent work a story
- A builder that holds a card and writes nothing to it for 30 minutes (`monitor.stall_minutes`) is flagged `stalled` on Home and `/api/hub/attention`, listed by `codeloop monitor stalled` and at session start, and the doctor writes one "asked for a hand-back" line per stall.
- `codeloop card handback <card> --branch <b> --head <sha> --proof "<cmd>"` records a builder's hand-back: it runs the proof command itself and stores the exit code and output on the card, so a gate can check data instead of a claim. A failing proof is recorded, an empty one is refused.
- `codeloop card gate <card> [--handback <sha>]` runs the proof before a story merges: it reruns the hand-back's proof (in `--worktree` when the hand-back named one), runs the stage check without advancing, and confirms the first file the hand-back names exists on its branch. The verdict and findings are stored per card (`POST /api/cards/:id/gate`, `GET /api/cards/:id/gates`); exit 1 on fail, refused when there is no hand-back.
- Every card has an activity stream (`.codeloop/state/activity/<card>.jsonl`): the Claude Code and
  Cursor hooks record edits, commands, prompts and session start and stop on the session's active
  card; headless runs copy their log into it; checks, commits (via a `Card:` trailer and the new
  post-commit hook) and gate events land there too. `activity: off` in config.yaml turns it off.
- `GET /api/cards/:id/activity` with cursor paging, `activity` frames on `/api/events`,
  `cards.activity` and `cards.activityStream` on both SDK transports, and
  `codeloop card activity <id> --follow` in the terminal.
- Sessions carry a host, a machine and a label ("claude on <machine>, since HH:MM"); the board and
  Home show the label instead of a UUID.
- Open a story and see its journey: every phase done, current, waiting on you or skipped (and
  why), with who holds it and what it did last.
- A story page shows one panel for what to do next: watch the agent's live feed, approve the gate
  or answer its questions, or start an agent or work on it yourself; the check is said in a sentence.
- Home shows each working agent as a tile with its story, phase, last action and whether it is
  working, stalled, failing a check or idle.

### The monitor
- A story shows one health, never two: working, needs you, failing, stuck or stale. A first failed
  check while someone works no longer shows red; failing means an hour with no activity after two
  or more fails, or after one fail with nobody on the story, or an agent run that ended on a failed
  check. Stale means two days untouched.
- Every Claude or Cursor session starts with the monitor: what waits for you, what is failing with
  its last check and the fix to run, and what is stale with park or drop. A done story is never
  named as the active one; the pointer is cleared instead.
- `codeloop run --due` runs a doctor tick: a failing story gets its agent started again (under
  three fails), and a story stuck or stale for a day gets one "Park it?" question in the inbox.
  Each action is a line on the story's activity. `monitor: off` in config.yaml turns it off.
- The monitor keeps itself running: when a project has agents configured and nothing scheduled,
  the first session installs an hourly `codeloop run --agent` in your crontab and says so.
  `codeloop schedule remove` or `monitor: off` stops it.
- The inbox's Failing list uses the same rule, so it agrees with Home and the monitor.
- The hub answers `GET /api/hub/attention` with each project's waiting, failing and stale counts,
  and the sidebar's project badges show waiting plus failing.

### Questions
- A question with a real fork carries two to four options, and its recommendation names one by
  letter. `codeloop answer <id> <n> --option B` answers with that option, and
  `codeloop answer <id> --accept-all` (or `POST /api/cards/:id/questions/accept-all`,
  `questions.acceptAll` in the SDK) takes every open recommendation at once.
- An answer an agent writes into interview.md itself no longer passes the interview: each answer
  needs the owner's answer event behind it.

### Board and Home
- Home shows what needs you, what is moving, which agents are working and what shipped this week;
  the board reads as six states, each screen loads with one call.
- Approvals hold while the card's own work is unchanged and ignore verify's workspace line.
- Page artifacts open from the board, in the hub too.

### Verify and mock
- `codeloop verify` runs use cases in an export of HEAD, so other sessions' uncommitted edits in a
  shared tree cannot fail a card, and requires a live walk on the real dev stack.
- Mocks are built from a design system the project owns and are written beside the spec.
- A promoted proposal gets its spec folder.

### Wiki and hub
- Each wiki folder has a write rule, refused with the rule named: a decision compares two or more
  options with a `## Why` and `## Consequences`, is titled by the choice and carries scope files; a
  gotcha carries scope files, the failure and the fix. The research stage writes a decision only when
  it compared options, so the "<card title>: build" copies of research.md stop;
  `codeloop wiki migrate-decisions` folds or removes the existing ones.
- A capture close to an existing page in the same folder (titles overlapping by 0.6, or the same scope
  and first heading) merges into it with a dated note. `wiki lint` names the near-duplicates it left,
  and `codeloop wiki merge <a> <b>` folds two pages by hand.
- Briefs add wiki pages whose titles match the story's title and tasks, up to ten, and ask the agent to
  end with `read:` lines. `codeloop check wiki-landed <id>` gates the research and review stages.
- One wiki shape codeloop owns, with agent-written architecture pages judged by a check.
- One local hub serves every registered project under `/p/<id>`; stuck and finished stories stop
  holding slots; a person can sign in and approve from any terminal.
- One active story per session, with file leases and shared paths; stories waiting on the person
  stop counting against WIP; split children wait in Up next.
- `lane update` installs missing lanes; the inbox lists failing checks and counts the backlog.

## 0.4.3 (2026-10-11, published)
- Mermaid diagrams render in the wiki; `wiki init` seeds the architecture folder in the C4 shape.
- The legacy board and knowledge files are dropped in favour of the wiki.

## 0.4.2 (2026-10-10, published)
- `codeloop shape`: a problem in, an epic of ordered shippable stories out.
- `codeloop run` advances a card until it stops on its own; `init` configures the agent; sessions
  start from the board.
- The board is a kanban again.
- Headless runs carry their card; hooks land where husky looks; `render` follows `init`; the guard
  appends to a hook the repo already has.
- A file in the repo counts as a research or brief source; `serve --bg` refuses a taken port.

## 0.4.1 (2026-10-09, published)
- Stage skills at depth, an interview stage with recommended answers, and a strict `spec check`.
- A host agent stays on its card from Claude Code, Cursor, Copilot and git.
- Wiki outline from the repo, skill eval, and three opinionated artifact kinds.

## 0.4.0 (2026-10-09, published)
- The codeloop app: board, inbox, initiatives, wiki, artifacts, stats, settings and setup, served by
  `codeloop serve`.
- Docs site with a generated command reference and a trial kit.
- First-user path verified from a packed install.

## 0.3.0 (2026-10-08, published)
- Renamed to `@protoboxai/codeloop`, site at codeloop.protobox.ai.
- Lanes as YAML files run by one engine, with gates, cards, inbox, `run --agent`, verify with
  evidence, CI templates, wiki and learn, `stats`, and a Dev Loop pack for Protobox.

## 0.2.0 (2026-10-02)
- Ten skills installed into `.claude/commands`, `.cursor/commands` and `.agents/skills`; skill
  registry with install, search and publish; watch mode; a static kanban board.

## 0.1.1 and 0.1.0 (2026-02)
- First release: `init`, `status`, `update` and four skill templates over `.codeloop/` knowledge
  files.
