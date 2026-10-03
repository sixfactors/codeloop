# codeloop

**The full dev lifecycle for AI coding agents.**

Your AI agent plans the work, tests it, reviews its own commits, deploys to staging, debugs production, and learns from every mistake — across sessions, across tools, without you babysitting it.

![Codeloop Board](https://codeloop.protobox.ai/board.png)

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
npm install -g @protoboxai/codeloop
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

`.codeloop/config.yaml` controls everything. The AI reads it directly. `.codeloop/local.yaml` (gitignored) overrides it on one machine and is where keys, tokens and machine paths go.

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

## Lanes

A lane is one YAML file in `.codeloop/lanes/`. It lists the stages a card moves through, the skill each stage runs, the command that decides whether the stage is finished, and the gates where a person has to say yes. `codeloop init` installs eight: build, market, analyze, triage, plan, deploy, learn, scan.

```bash
codeloop start "Add CSV export"   # a card in the build lane, plus its spec folder
codeloop next                     # run the current stage's check; move the card if it passes
codeloop inbox                    # what is waiting for you, what to read, what shipped
codeloop approve 1                # approve the gate and move the card on
codeloop reject 1 "no proof for the claim"
codeloop run                      # start lanes that are due, advance every card not waiting for you
```

Every command that changes a card ends with a `Next:` line saying what to do. A card id can be typed as `1`, `001`, `c-001` or `C-001`. The long forms (`codeloop card new|show|list|advance|approve|reject`) do the same things.

| Who you are | How it is decided |
|---|---|
| owner | You are typing at a terminal and `CODELOOP_ROLE` is unset. |
| agent | Input is piped or spawned: an agent, CI, the MCP server. |
| either, explicitly | `--as owner|reviewer|agent`, or `CODELOOP_ROLE`. |

| Behaviour | Rule |
|---|---|
| Check fails | The card stays in its stage. After `retries` failures (default 3) it is marked `stuck` with the command output attached. `codeloop run` does not count a failure again while the stage's output file is unchanged. |
| Approval | An approval covers the stage output and check as they were when it was given. If either changes before the card advances, the card waits for you again. |
| Gate | The card waits for you after the stage's check passes. `codeloop approve` approves and advances it once. A waiting card cannot advance. |
| Gate with `outward: true` | The stage changes something public (publish, prod deploy), so the card waits when it enters the stage, before any work or check runs. Approving does not run it; after approval the check still has to pass. |
| `trigger: { on: lane.done, lane: build }` | A card starts when a card finishes that lane. Same as the other lane's `on_done.start`; declaring both starts one card. |
| `trigger: { cron: "0 9-17 * * MON-FRI" }` | Five fields in local time: `*`, `*/n`, `a`, `a-b`, `a-b/n`, comma lists, day names. `lane lint` rejects anything else; `codeloop run` reports a lane it cannot parse and carries on. |
| `trigger: { on: git.commit }` or `git.tag` | `codeloop run --due` starts one card per new HEAD sha or newest tag. |
| `gates.mode: trusted` in `config.yaml` | Gates auto-approve, except outward gates, which always stop. |
| `wip` on a lane | New cards are refused once that many are unfinished. Proposals do not count. |
| `capacity.gates_per_day` | New cards are refused while more cards than this are parked. Proposals do not count. |
| Proposed card | `codeloop card propose <lane> "<title>"` creates a card at stage `proposed`, waiting at gate `proposal`. It takes no place in the lane and no run starts it. `codeloop approve` (owner) puts it in the lane's first stage without running that stage's check; `codeloop reject` drops it. |
| A check that writes the board | A stage's command may propose cards (the scan stage does). `codeloop verify` records its evidence on its own card the same way. The advance is then written on the board the check left, unless the card was moved or parked meanwhile, which is exit 3. |
| Exit codes | 2 = a check, gate or permission refused. 3 = `cards.json` changed since it was read; re-read and retry. |

Cards live in `.codeloop/cards.json`, separate from the task board in `board.json`.

**Roles are not authentication.** Locally the role is whatever the caller says it is: `--as owner` and `CODELOOP_ROLE=owner` are open to any agent or script on the machine. Gates stop a cooperating agent from moving on by accident; they do not stop one that claims to be the owner. Each event records the claimed role. `codeloop gate check` prints a warning for an approval that is only a local event, so CI should not treat it as proof that a person approved. `lane promote` and `lane rollback` need the owner role under the same caveat.

### Running unattended

`codeloop run` on its own only checks work that already exists. With an agent configured it also does the work: for each card that is not waiting for you and whose stage check does not pass yet, it starts a headless coding agent on that stage, then runs the check and moves the card, parks it at its gate, or counts a failed try.

```yaml
# .codeloop/config.yaml
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 20      # default 20
    max_runs_per_day: 20     # default 20
  codex:
    cmd: "codex exec - < {brief}"
run:
  agent: true                # optional: plain `codeloop run` starts agents too
```

```bash
codeloop brief 1                    # what the agent is given for the card's current stage
codeloop run --agent                # agents.default; `--agent codex` names another
codeloop run --agent --dry-run      # which cards would get an agent; starts and changes nothing
codeloop schedule install --every 30m   # a crontab entry that runs `codeloop run --agent` here
codeloop schedule status | remove
```

`{brief}` becomes the shell-quoted path of `.codeloop/state/briefs/<card>-<stage>.md`. The brief holds the card, the stage's skill text from the skills index, the output path, the check command, rejection notes and the last failing check output for the stage, the wiki pages whose scope matches the files in play, and the rules: do this stage only, write the output, do not approve or advance, do not edit `cards.json` or lane files. The agent's output is kept in `.codeloop/state/agent-runs/<card>-<stage>-<n>.log` and each run is recorded on the card as `agent-start` and `agent-run` events (agent, exit code, duration, log path).

| Limit | Rule |
|---|---|
| One stage per card per run | After the agent finishes, the check runs once. The card moves one stage at most. |
| Waiting on a person | No agent starts for a card at a gate or marked stuck. |
| After a rejection | The stage is given back to the agent on the next run, with the note in its brief, even though the check that passed before still passes. Once per rejection; the card then waits at the gate again. |
| Public steps | No agent starts for a stage with `outward: true` until its gate is approved. |
| `wip` on a lane | Agents work on the first `wip` unfinished cards of the lane; the rest wait their turn. |
| `capacity.gates_per_day` | No agent starts while that many cards are waiting on you. |
| `max_runs_per_day` | Agent starts across the project in any 24 hours, counted from card events. The run says so when it is reached. |
| `timeout_minutes` | The agent and its child processes are killed. |
| Failed agent | An agent that exits non-zero or times out leaves the check to decide. A failed check after an agent run always counts toward `retries`, so a stage gets at most `retries` agent attempts before the card is stuck and waits for you. The `Next:` line names the log. |
| Overlapping runs | A card whose agent is still running from an earlier run is skipped. |
| Role | The agent runs with `CODELOOP_ROLE=agent`. `codeloop approve` and `reject` from inside it are refused, with or without `--as owner`. An agent that clears its own environment can still claim another role; see "Roles are not authentication" above. |

`schedule install` takes `--every` (minutes that divide the hour such as `30m`, or hours that divide the day such as `6h`; default `30m`) or `--cron "<five fields>"`, and `--agent <name>`. The entry carries the PATH of the shell that installed it, because cron starts with a bare one, and appends output to `.codeloop/state/run.log`. `--print` prints the line and installs nothing. Only this repo's entry is replaced or removed; other crontab lines are kept. `bash scripts/e2e-agent-real.sh` runs one stage with a real `claude -p` when `CODELOOP_E2E_REAL_AGENT=1` is set, and prints `SKIP` otherwise.

### A founder's week, as a script

```bash
npm run build && bash scripts/demo-founder-week.sh
```

The script sets up a fresh temp project with the eight shipped lanes and a scripted stand-in for the coding agent, then drives a week and checks every step it claims (it exits 1 on the first mismatch). Sunday night triage proposes cards from an issues file; Monday the scan proposes a card from a competitor's changelog, the founder promotes it, plan ranks it, and a build card goes research, mock, spec gate, build, verify, review, release and live; finishing it starts a market card whose copy is rejected once, redone from the note and published; Friday the growth review opens a plan card; a third rejection at the copy gate becomes a lane proposal, an eval and market version 2. It ends with the inbox, the stats and a summary of cards, approvals, agent runs and lane versions. When a local Protobox answers on port 4002 the project is connected to it and the run ends with `cloud status`; otherwise it runs on local files and says so. A saved run is in [docs/artifacts/demo-founder-week.txt](docs/artifacts/demo-founder-week.txt).

The week is simulated with `CODELOOP_NOW=<time>`, which replaces the clock for any codeloop command, so every event carries that time and the cron lanes come due. `codeloop run --now <time>` does the same for a single run.

### Inbox

`codeloop inbox` (or `--json`) opens with one line such as `2 shipped this week, 3 waiting on you, oldest 2 days`. For each waiting card it names the file to read and the last check result. It prints three lists: the gates waiting on you, the cards finished since you last ran `codeloop inbox --seen`, and per-lane numbers (active, parked, done, human turns per card, first-pass rate).

### Adopt existing skills

The shipped lanes name only the ten skills codeloop installs, and `codeloop init` writes `.codeloop/skills.index.yaml` itself, so `lane lint` and `pack build` pass in a fresh repo. `codeloop adopt` rescans `.claude/skills`, `.claude/commands`, `.cursor/commands` and `.agents/skills` in the project and the `.claude` folders in your home directory (or `--from <dir>...`) and replaces the index. Once the index exists, `codeloop lane lint` rejects a stage that names a skill missing from it. `--gaps` lists stages with no mechanical done check. `codeloop pack build` compiles the lanes and the skills they name into a Protobox skills-only manifest.

### Changing a lane

Lanes change through proposals, and a proposal has to pass an eval before it can be installed.

```bash
codeloop lane propose                       # a gate rejected 3 times, or a stage stuck twice, writes .codeloop/proposals/<id>/
codeloop lane eval market-draft-1           # lint, fixtures, replay; writes eval-result.json
codeloop lane promote market-draft-1 --as owner
codeloop lane rollback market --as owner
```

`eval` exits 4 when a changed done check has no `expect: fail` fixture in `eval.yaml`, or passes on one: a check that cannot fail is refused. It exits 1 when the proposal weakens the lane: it removes a gate, changes a gate's approver, removes `outward`, removes a stage that finished cards passed, or lowers `retries` to 0. Each one must be listed under `accept_weakening:` in `eval.yaml` as `{ change, reason }`, and `promote` prints the reasons. It also exits 1 when a changed check, re-run in the project against the last 10 finished cards, fails one of them. List a card under `accept_regressions:` in `eval.yaml` to accept that. Per-card results are in `eval-result.json`. `promote` keeps the previous file in `.codeloop/lanes/.history/`.

### Specs and tasks

```bash
codeloop spec new c-001              # specs/001-<slug>/{research,spec,plan,tasks}.md, recorded on the card
codeloop spec check 001              # exit 2 until the spec is traceable
codeloop task list 001 --layer api   # one builder's tasks
codeloop task done 001 T003
codeloop task check 001 --all-done   # exit 1 while any task is open
```

`spec.md` holds acceptance lines `- US1 Given ..., when ..., then ...`. `tasks.md` holds one line per task: `- [ ] T003 [P] [US1] [api] text`, where the layer is `api`, `sdk`, `ui`, `test` or `docs`. `spec check` exits 2 on an untagged task, an acceptance line with no task, a task citing a missing `USn`, and more than five acceptance lines ("split the card"). The build lane's spec stage runs it, and its build stage requires every task ticked.

`codeloop import speckit [dir]` creates one build-lane card per `specs/NNN*/` feature and rewrites tasks with a layer tag. The layer is inferred from file paths in the task text, using `scopes` in `config.yaml` that are named after a layer; tasks it cannot place are marked `[?]` and listed. `codeloop import bmad [dir]` reads `sprint-status.yaml` and creates one card per story at the stage its status maps to. Both only read the source files; copies go to `specs/<card-id>-<slug>/`. Imported cards do not count against `wip` when they are created.

### Competitor scan

```bash
codeloop scan competitors                           # fetch each competitor page's changelog link
codeloop scan competitors --from-file notes.md      # use a file as the page text (tests, pasted changelogs)
codeloop scan competitors --only acme
```

For each page in `.codeloop/wiki/competitors/` with a `changelog` link, the scan fetches the URL (10 second limit; a failure is reported as skipped and the scan carries on), turns HTML into lines of text, and compares it with the text stored from the last scan in `.codeloop/state/scan/<name>.txt`. When lines appeared that were not there before, it proposes one card in the plan lane for that competitor, titled `<name> shipped: <first new heading, or first new line>`, with the new lines and the source URL in the card's description. The first scan of a competitor only stores the baseline. The card is a proposal: it waits in `codeloop inbox` until the owner promotes it with `codeloop approve`, and nothing starts it. The same new text never produces a second card, even if the stored text is lost.

The shipped `scan` lane runs this weekly (`0 7 * * MON`): its one stage's check is `codeloop scan competitors`, so `codeloop run` does the scan with or without an agent.

### Research and competitor pages

```bash
codeloop wiki competitor add acme --docs https://acme.example/docs --changelog https://acme.example/changelog
codeloop wiki competitor list
codeloop check research c-001 --min-sources 3   # exit 1 without a verdict line and three source lines
codeloop check research c-001 --online          # also asks each source URL; 2xx or 3xx passes
```

Each competitor is one wiki page, `.codeloop/wiki/competitors/<name>.md`, with `title`, `docs` and `changelog` in its front matter and a `## Findings` list below. The brief for a stage named `research` includes every competitor page. The shipped build lane checks the research stage with `codeloop check research {id} --min-sources 3`: `research.md` needs a line starting `verdict:` and at least three lines of the form `- source: <url> — <note>` (a spaced hyphen also works). The check is offline by default so it gives the same answer every time; `--online` adds a HEAD request per URL, falling back to GET, with a 10 second limit.

When a research stage passes, each row of `research.md` that starts with a competitor's name (a table row or a `- name: ...` list item) is appended to that competitor's page as `- <card-id> <card title>: <the row>`. A page that already has rows from the card is left alone, and the card gets a `findings` event naming the page.

### Mocks

```bash
codeloop mock new c-001 --topic exports   # docs/mocks/<project>/<topic>/c-001.html from the shared template
codeloop check mock c-001                 # exit 1 until the mock passes
codeloop mocks index                      # docs/mocks/index.html: project, topic, cards, newest first
```

Every mock starts from `templates/mock/template.html`: one page shell and one tokens block (light and dark colours, spacing, radius), the system font stack, flex and grid with `minmax`, and no pixel sizes. `<project>` is `project.name` from `config.yaml`. `check mock` fails when the file is missing, when it lacks the template's marker comment, when its tokens block differs from the template's, when it uses a hex colour or a colour function outside the tokens block, or when a screen named under `screens:` in the card's `spec.md` has no `<section data-screen="name">`. A spec that names no screens fails too; a card with nothing to draw says `screens: none` and passes without a mock, which is what makes the stage optional per card.

The shipped build lane runs `mock` between `research` and `spec`, so the spec gate shows a picture and a story together: `codeloop inbox` prints the mock path under the waiting card, and `codeloop serve` serves the gallery at `/mocks/` and links the card's mock from its detail panel. Projects set up before this keep their own `build.yaml`; add the stage by hand through a lane proposal.

### Verify

A use case lives in `usecases/<nnn>/<name>.yaml`:

```yaml
id: uc-001-02
accept: US2
failure_mode: "two writers who read the same version both land"
layers:
  cli: { run: "bash usecases/001/uc.sh us2", expect: { exit: 0, stdout: "conflict" } }
  api: { request: { method: PATCH, path: /api/tasks/t-1, body: { stage: live } }, expect: { status: 403 } }
```

`codeloop verify <nnn>` runs every layer, writes `evidence/<nnn>/<uc>.json` (sha, layer, pass, output tail) and `evidence/<nnn>/verify.md` with `result: pass|fail`, and adds the evidence to the card (`--no-record` skips that).

| Exit | Meaning |
|---|---|
| 2 | An acceptance line has no use case. |
| 1 | A use case failed, or has no runnable layer. |
| 2 | Also: the spec has no acceptance lines, or there are no use cases. Nothing to check is not a pass. |
| 4 | `--mutate`: a use case still passes on the commit before the card's first `Feature: <card-id>` commit, so it cannot fail. |
| 5 | `--mutate` could not run: no commit carries that trailer, or the setup command failed in the old commit ("environment differs"). No verdict is given. |

`--mutate` checks the old commit out in a temporary worktree and runs `verify.setup` from `config.yaml` there first (default `npm ci && npm run build` when the worktree has a `package.json`; set it to `""` to skip). When the project itself ships the `codeloop` binary, use cases drive the worktree's build. `--env <name>` points api use cases at `deploy.<name>.base_url` from `config.yaml`. `codeloop init --hooks` installs a commit-msg hook that adds the `Feature:` trailer from a branch name containing a card id.

Not built: the `ui` layer. There is no Playwright runner, and a use case with only a `ui` layer counts as a failure rather than a pass.

### Stats

`codeloop stats [--card <id>] [--lane <id>] [--compare v1 v2] [--json]` computes, from card events only: human turns per card, the longest unattended span, cycle time, rework (rejections ÷ approvals), stuck rate, and first-pass rate per gate. `--compare` splits by the lane version each card was created under.

### Wiki

```bash
codeloop wiki capture --title "Rename is not atomic across devices" --scope "src/lib/**" --body "..."
codeloop wiki inject --files src/lib/cards.ts   # pages whose scope globs match
codeloop wiki list | lint
codeloop learn                                   # apply the frequency thresholds
codeloop check gotchas --files <changed files>   # exit 1 on an unacknowledged critical page
```

Pages live in `.codeloop/wiki/{gotchas,decisions,concepts}/` with frontmatter `title, scope, freq, severity, cards, updated`. Capturing a title that exists raises its `freq`. At `codeloop.critical_frequency` (default 3) the page becomes critical and `check gotchas` blocks matching files until `--ack "<title>"`; `/commit` runs that check. At `codeloop.promote_frequency` (default 10) `codeloop learn` appends the page to `rules.md` once. `wiki lint` exits 1 on a broken relative link and reports pages older than 90 days and duplicate titles.

### Other hosts, MCP and CI

- `codeloop render [--host claude|cursor|codex|all]` writes each lane stage as `.claude/agents/codeloop-<lane>-<stage>.md`, each lane as `.cursor/rules/codeloop-<lane>.mdc` and `.agents/skills/codeloop-<lane>/SKILL.md`, and a block in `AGENTS.md` between `<!-- codeloop:start -->` and `<!-- codeloop:end -->`. A second run changes nothing.
- `codeloop mcp` serves the engine over stdio with the tools `inbox`, `next_up`, `get_card`, `advance`, `approve`, `reject`, `task_done`, `wiki_inject`, `wiki_capture`. `approve` and `reject` take the role from `CODELOOP_ROLE` in the server's environment and are refused for an agent.
- `codeloop init --ci github` writes three workflows. The PR one runs build, test, `lane lint` and fails a commit with no `Feature:` trailer. The staging one runs `deploy.staging.command` on a push to main and then verifies the shipped cards with `--env staging`; it does nothing while that command is unset. The prod one runs on a `v*` tag under `environment: production`, which waits for a reviewer once the environment has required reviewers.
- `codeloop gate check <id> --require <gate>` exits 2 unless the card has an approval for that gate.

### The board in a browser

`codeloop serve` prints a URL such as `http://127.0.0.1:4040/?token=…` and opens on a Cards view: one column per stage of the selected lane, a "waiting for you" badge with the gate name, and a detail panel with events, evidence, the spec path and a link to the card's mock. The mock gallery is at `/mocks/`. It starts without a `board.json`; the old task board is the Tasks tab. Approve and Reject on the page work only when the server was started with `codeloop serve --owner`; otherwise those requests return 403.

The server has no login. It listens on 127.0.0.1 only (`--host` changes that and exposes the board to the network), answers only to a localhost host name, sends no CORS headers, and requires the token from the printed URL, a JSON content type and a same-origin request for every change. Anyone who has the URL with its token can make changes, including approvals on an `--owner` board.

### Cloud store (optional)

Local files are the default and nothing below is needed. A Protobox workspace can hold a second copy of the board, the wiki, `config.yaml` and the lanes so several checkouts share them. Only codeloop is installed; there is no Protobox CLI.

| Command | What it does |
|---|---|
| `codeloop cloud connect --url <mcp url> --key <api key> [--folder <name>]` | Saves the connection in `.codeloop/cloud.json` (gitignored; the key is never printed). Uploads the board to a page titled "codeloop board", `config.yaml` to "codeloop board: config.yaml", each lane to "codeloop board: lanes/<lane>.yaml" and each wiki page under its own title. Pages go in folder `codeloop` (or `--folder`), lanes in `codeloop/codeloop-lanes`, wiki pages in `codeloop/codeloop-wiki`. A board page that already exists is adopted, not overwritten. |
| `codeloop cloud status` | Workspace URL, board revision against the local version, and every document as `in-sync`, `local-ahead`, `cloud-ahead` or `both-changed`. |
| `codeloop cloud pull [--force]` | Takes the cloud board, and every other cloud copy whose local file was not edited here. `--force` takes the cloud copy of everything. |
| `codeloop cloud push [--force]` | Writes the board, wiki pages and config that changed here. `--force` also replaces pages that changed in the cloud. Lanes are never pushed this way. |
| `codeloop cloud disconnect` | Pushes pending writes, pulls everything back into the repo, then removes `cloud.json` and the sync record. |

`.codeloop/state/sync.json` (gitignored) records, for each document, its page id, the revision this checkout last saw and a hash of the content at that moment. That is how a change here is told apart from a change in the cloud.

While connected, every command starts by syncing, and says what it did on stderr. That is one request to the workspace per command and one per card write; the endpoint allows 60 a minute and codeloop waits when it is told to slow down. `CODELOOP_NO_SYNC=1` skips the sync step for a command (a script that only reads, many times in a row); writes still go to the cloud first.

| Case | What happens |
|---|---|
| A page changed only in the cloud | The local file is updated before the command runs. This covers the board, config, lanes and wiki. |
| A wiki page or `config.yaml` was edited only here | Pushed before the command runs. |
| A lane file was edited here | Reported and not pushed. A lane reaches the cloud only through `codeloop lane promote` (or `lane rollback`). |
| A wiki page changed on both sides | Yours is kept and the cloud version is written beside it as `<name>.cloud.md`. `codeloop inbox` lists it under what is waiting for you. Merge it into your page and delete the copy; the next command pushes the merge. |
| The board changed on both sides | The command is refused with exit 3 and the local file is unchanged. `codeloop cloud pull`, then run it again. |
| `config.yaml` or a lane changed on both sides | Yours is kept and the command says so. `cloud pull --force` takes the cloud copy, `cloud push --force` replaces it. |
| The cloud cannot be reached | The command runs on the local files. A write is kept locally and marked `pending` in `sync.json`; the next command that reaches the cloud pushes pending writes first, with the same revision check. |

Every card write goes to the cloud page first with the revision this checkout last saw, so two checkouts cannot both land a write made from the same board. `wiki capture` also writes the page; `wiki inject` stays local.

**Keys, tokens and machine paths belong in `.codeloop/local.yaml`.** `config.yaml` is uploaded as it is, so it should hold only switches the whole team shares: approval mode, work limits, deploy commands. `local.yaml` has the same shape, is laid over `config.yaml` on this machine (maps merge key by key), is gitignored by `codeloop init`, and is never uploaded. codeloop does not move anything there for you.

```yaml
# .codeloop/local.yaml
agents:
  claude: { cmd: "/Users/me/bin/claude -p --permission-mode acceptEdits < {brief}" }
deploy:
  staging: { base_url: "http://localhost:8080" }
```

The workspace's MCP endpoint has to serve `KNOWLEDGE_WRITE_PAGE`, `KNOWLEDGE_READ_PAGE`, `KNOWLEDGE_LIST_PAGES` and `KNOWLEDGE_SEARCH`. `bash scripts/e2e-cloud.sh` proves all of the above against a local Protobox and prints `SKIP` when none is running.

`bash scripts/e2e-founder-loop.sh` runs all of the above except the cloud store against the built CLI in a temp project.

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

# Lanes
codeloop lane list | show <id> | lint # Inspect and check lanes
codeloop card new <lane> <title>      # Start a card (also: show, list, advance, approve, reject)
codeloop inbox                        # Gates waiting on you, what shipped, numbers
codeloop run --due                    # Start due cron lanes, advance unparked cards
codeloop run --agent [name]           # Same, with a headless agent doing each stage first (--dry-run to preview)
codeloop brief <card>                 # The stage brief an agent is given
codeloop schedule install | status | remove   # Crontab entry for `codeloop run --agent`
codeloop adopt                        # Index existing skills and commands
codeloop lane propose | eval | promote | rollback
codeloop check file <path> --has <s>  # Done-check helper for lane stages
codeloop check research <card>        # Verdict line and source lines in research.md (--min-sources, --online)
codeloop check mock <card>            # Mock built from the shared template, every spec screen drawn
codeloop mock new <card> --topic <t>  # Mock file from the shared template
codeloop mocks index                  # Mock gallery page
codeloop pack build                   # Protobox skills-only manifest
codeloop spec new | check             # Spec folder for a card
codeloop task list | done | check     # Layer-tagged tasks
codeloop import speckit | bmad        # Bring existing specs in as cards
codeloop verify <nnn> [--mutate]      # Run use cases, write evidence
codeloop stats                        # Autonomy numbers from card events
codeloop wiki capture | inject | list | lint
codeloop wiki competitor add | list   # One wiki page per competitor
codeloop scan competitors             # Propose a plan card for what each competitor's changelog added
codeloop card propose <lane> <title>  # A card that waits for the owner before it enters its lane
codeloop learn                        # Apply gotcha frequency thresholds
codeloop render                       # Agents, rules and skills for Claude, Cursor, Codex
codeloop mcp                          # MCP server on stdio
codeloop gate check <id> --require <gate>
codeloop init --hooks | --ci github   # commit-msg hook, CI workflows
codeloop start | next | approve | reject   # Short forms of the card commands
codeloop cloud connect | status | push | pull | disconnect   # Optional: Protobox copy of board, wiki, config and lanes

# Live monitoring
codeloop watch                        # Background file + git monitor
codeloop serve                        # Board UI server (http://127.0.0.1:4040, token in the printed URL)

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

## Working on codeloop itself

This repo runs on its own lanes (`.codeloop/lanes/`), which name only the bundled skills.

```bash
npm ci && npm --prefix ui ci
npm run build:all
node dist/index.js adopt --from templates/commands   # index the bundled skills
node dist/index.js lane lint
npm test && bash scripts/e2e-founder-loop.sh
node dist/index.js inbox                             # the repo's own cards
```

`scripts/e2e-cloud.sh` and the cloud part of `scripts/demo-founder-week.sh` need a Protobox workspace; set `PROTOBOX_CACHE` to a JSON file holding its workspace id and API key. Both skip the cloud steps when it is absent.

## License

MIT
