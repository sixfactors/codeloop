# Changelog

One section per published version of `@protoboxai/codeloop`, newest first. A version is published
when `npm publish` ran for it; "unreleased" is on the branch and not on the registry. Entries say
what a user can now do, not which files moved. `src/__tests__/changelog.test.ts` fails the build
when package.json names a version this file has no heading for.

## 0.5.0 (unreleased)
- `codeloop task check <id> --all-done` reads the tasks.md of a story that skipped the spec stage (an S story) when it lists tasks, instead of printing "no tasks" and passing; with no tasks.md, or one with no task lines, it still passes on the skip.
- One orchestrated agent turn carries a story's early stages (`carry: early` on research, interview, mock and spec in the build lane): one brief lists each stage's skill, output and check, the agent's time limit grows with the stages carried up to `orch.carry_max_minutes` (default 120), and after the hand-back the engine checks and records each stage on its own. The turn stops at the spec gate, right after the agent asks questions, or at the first failed check, which is named on the story; each stage reached gets its own agent-run event.
- The five-question cap on `codeloop ask` counts interview questions only: a review finding (`--kind review`, or any question starting `Review:`) and a gap question (`--kind gap`, the review pass's unfilled stages) are recorded past it, carry a `kind:` line in interview.md, and do not count toward the interview rubric's three to five.
- A story's health check on its own branch scopes gotchas to every file changed since the merge-base. On a shared trunk it adds untrailered commits that touch the story's trailered files or its plan files, so one `Card:` commit on README.md no longer hides untrailered source changes and the gotchas scoped to them.
- A story's health check counts a critical gotcha with no scope, which `wiki capture` writes by default, as applying to every file; it used to leave it out of every story's delta.
- The eight-task cap judges planned work only: a story whose tasks are all ticked is approved and placed into build whatever its task count or size, while a story with open tasks over the cap is still refused at build entry.
- A lane's `wip` counts only stories an agent is working on now: an agent run in flight on the story's stage, or a builder session on it that wrote to its activity within `monitor.stall_minutes`. Stories parked at a gate, waiting for answers or between turns hold no slot. `card new`, approving a proposal, `card place`, `card reopen`, queued promotion and the scheduler all count it this way, and a refusal names each story holding a slot and what is working on it. Trivial stories still never hold one.
- `codeloop answer <id> --accept-all` accepts an answer an agent wrote under a question in interview.md as written, falling back to `recommended:`; `check questions` still counts only answers a person recorded. Answering keeps the text before the questions and the `## Rubric` lines after them, which it used to drop.
- `codeloop card move <id> <stage>` starts a queued story (a split sibling waiting in Up next) at that stage when its lane has room; `card reopen` and `approve` on a queued story now point at `card move <id> <stage>` instead of at each other.
- `npm run build` compiles into a temporary folder beside dist, parses every module, runs `--version` and `card list --json` from it, and only then renames it over dist; a failed compile or load test exits 1 and leaves dist as it was, so a mid-edit build no longer breaks the linked CLI in every project.
- A stuck story says in plain words whether any work was tried, what already shipped under it and which action moves it. Its page offers at most two buttons (move it to the step its shipped work shows, stopping before any gate; let an agent try once more, only when something changed) and Send it back; a broken check says the check broke, with the step and time, and keeps the raw error under Show the error. The inbox and `codeloop card show` print the same explanation, and a failure leaves the inbox failing list once a later check at the same step passed.
- The orchestrator reviews the board before it picks: `codeloop orch run --review` (and `--changed` before each pick, and the doctor at night) moves a story with merged work forward as far as no gate lies between, closes one whose gates are all approved, writes stages the merged work makes unneeded and asks about their gaps, and asks about gates, splits and drops in the inbox; `codeloop render` now writes `/orch` for Claude Code, Cursor and Codex.
- The story page opens on the summary card, with who wrote each line and when and an Edit action, then the action buttons and the step bar; checks and scores, history, raw output, tasks and commits and details fold under headings that keep a count, and a failing check shows on its heading. Waiting reads in amber with an hourglass.
- `codeloop card summary <id> --needed "..." --done "..."` and `card handback --needed/--done` write the story summary; as an agent the write keeps any line a person wrote. The builder brief asks the agent to write or improve it at the end of its turn.
- The full story response carries a three-line summary: what the story needs, what is done and what you must do. A story nobody summarised gets lines worked out from the board, marked as not yet written by an agent; lines from an earlier step are marked older; what you must do always comes from the board. `PUT /api/cards/<id>/summary` writes the first two lines.
- The stages and checks docs say to gitignore the report files a check writes inside the repo: a check that writes a new file name each run reads as new work and restarts the agent.
- A mock composed as a page of the app (`app/mocks/<folder>/page.tsx`) opens on the board at `/mocks/<folder>/` and under the hub at `/p/<id>/mocks/<folder>/`, and the mocks gallery links to it; HTML mocks are served as before.
- Rejecting a stuck story with no note says it parked the story and no longer claims a note was recorded.
- A person's commit with no trailer counts as work on a story with no plan and no trailered commits when it changes the stage output or a file in the story's spec folder, so that work spends a retry like any other.
- `codeloop start --stage <stage>` works on a lane whose first stage is outward: the new card skips that stage's entry gate it was parked at, and parks again when the stage it lands on is outward.
- Approving a stuck story that was parked puts it back on its stage with its retries cleared, so its first check no longer parks it stuck again with the old reason.
- A no-op agent on a stage whose check writes a report file into the repo (junit.xml) is started once, not twice: the start records the work as its own check left it.
- A story's health delta counts only the critical gotchas scoped to the files its own commits changed, so a gotcha another story adds elsewhere no longer lowers it.
- The edit guard refuses an edit (exit 2) when its own check throws, on the hook daemon and the CLI alike; before, a throw such as a malformed card in cards.json exited 1 and let the edit through.
- The shell guard refuses the command (exit 2) when its own check throws, on the hook daemon and the CLI alike; before, a throw exited 1 and let the command run. A repo with no cards.json is not a throw and still lets commands through.
- A story whose recorded spec folder is missing finds the one folder with its number, uses it, and records it on the card, so the spec page shows what the builder wrote.
- A story's working time counts its agent runs for as long as they ran and each lone edit as a minute, so a story worked by a headless agent no longer reads working 0m.
- `verify` on a trivial story over budget says it was parked at a gate only when it was; on a lane with no earlier gate it says the story is re-sized and stays at its stage.
- The inbox's WIP bar per lane counts only the stories that hold a wip slot, so a trivial story or one parked at a gate no longer fills it; `/api/inbox` returns that count as `perLane[].holding`.
- The shell guard asks about every `card move` in a compound command, not only the first, spelled `card` or `cards` (as are `card done|drop|approve|reject`), reads options wherever they sit (`card move --note x <id> <stage>`), and asks rather than allows a move it cannot read against the board.
- `run --agent` no longer gives a lane's only wip slot to a trivial story: a trivial story starts beside the work holding the slots and never makes an S or M story wait.
- A failed check spends one of a story's retries only when someone or an agent worked on it since a check last spent one, and an agent is not restarted on unchanged work, so a story that cannot move on its own parks stuck and says why. `approve` on a stuck story clears its count and allows one more agent start.
- A check that fails only on the legacy-layout notice, or on its own card missing from the board it read, is one check-error and spends no retry; an agent past its timeout is killed on time even while codeloop is busy in a check, by a watchdog that `codeloop ps` lists and that ends with the agent or with codeloop.
- The board keeps you signed in whichever link you open: codeloop prints localhost links and sends 127.0.0.1 pages there, a second hub on another port no longer signs you out of the first, and the sidebar no longer flashes Read only while it checks your session.
- An assistant's `card move` that skips a gate, undoes one, or clears a wait asks the person first, like `approve`; any move of a card waiting at a gate, forward, back or to its own stage, is refused, since only `approve` or `reject` decides a gate.
- `card edit --size trivial` works, and the session working a card can `card move` it while it waits at no gate, so a story re-sized by mistake can be put back.
- A Markdown page under docs/ counts against a story's size as a file and at one tenth of its lines, so a trivial story that adds one page is not re-sized, while a 10,000-line page still is; an .html or .mdx page, which can carry scripts or JSX, counts in full; the budget message says so.
- A trivial story starts even when its lane is at its wip limit, and holds no slot, so a small ask is never refused behind larger work.
- A prompt in a repo with open stories and none active is no longer refused: the agent is told the top open stories, or to start a trivial or S story for a small new ask (`codeloop start "<title>" --size trivial --activate`, which also makes it the session's active story) and carry on. Set `guard.prompt: block` to keep the old stop.
- A trivial story that grows past its cap now stops at the spec gate again; on a lane where only M and L stories write a spec, it was re-sized to S and went straight on.
- Docs: a Use cases section with ten pages, each telling the problem in the reader's words, how a person does it without codeloop and where that fails, how codeloop does it, what the person still decides, and what is not there yet. The founder's week and the client-deliverable guide moved into it.
- Every docs page opens with the problem it solves, then what codeloop does about it, then how it works; pages explain in place instead of pointing at repository files or other pages, define their terms where first used, and carry no narration about how they were written. The rule is `docs/documentation-standard.md`. The research check's printed source-line format reads `- source: <url or path> - <note>`; an em or en dash is still accepted.
- Docs: an "Orchestrator and workers" page says which host can take which role (Claude Code, Cursor, Codex, Gemini CLI, a person), which file teaches each role, the orchestrator protocol a session needs, what the engine refuses on its own, and that `render` does not write the orchestrator command yet.
- The build lane runs research, interview, mock, spec and data-model for M and L cards only (`when: size >= M` in the template and on codeloop's own lane): a trivial or S card enters at build with the skipped stages recorded, so small work takes the short road without a second lane.

- The doctor starts the stage agent once on a stuck story whose stage output was never written (missing, still the template, or without the lines its check reads), records it as `doctor-start`, and never starts it a second time; it counts against the run budget and the memory ceiling, and `doctor.scaffold_starts` (default 0) caps how many a tick, so `codeloop doctor --dry-run` lists them until it is raised.
- Every page's browser tab reads "<page or story title> · <project>" ("Board · ops-ai", a story's own title on its page and its Evidence page); the shell renders the title, so it no longer falls back to "Codeloop workspace" when Next's metadata lands after hydration. An owner's story edit reads "edited title, priority" on the card face instead of "edited undefined", and no longer counts as work.
- A card sized `trivial` (`codeloop card new build "<title>" --size trivial`) enters the build lane at build: research, interview, mock, spec and data-model carry `when: "size >= S"`, each is recorded on the card as a `skip` event with the reason, `task check --all-done` passes with no tasks, and the build rubric reads B1 and B4 as n/a. Verify and its local gate still run. A trivial diff over 3 files or 50 lines re-sizes the card to the smallest size that runs the spec gate (M on the shipped lane) and parks it there.
- A Mocks page under Knowledge (`/p/<project>/mocks/`) shows every mock grouped by its story, id first: one thumbnail per `data-screen` frame, cropped from the mock's own route, a click opening that frame full size, and a chip for each story whose `screens:` takes a screen from it. `GET /api/artifacts` now lists each mock's `frames`, its in-app `folder` and `referencedBy`. Rubric rows that do not apply read "n/a" with the reason.
- The story page and drawer "..." menu gains Edit (title, story line, priority, feature, size), Move to stage (a note required when the move undoes a passed gate), Send back to backlog and, on a done or dropped story, Reopen; each goes through `POST /api/cards/:id/reopen`, `POST /api/cards/:id/move` or `PATCH /api/cards/:id` (409 when the story's state forbids it) and its event shows in the activity list without a reload.
- A card whose spec draws no new screen (`screens: none`, or only references to existing mocks) passes the mock stage's rubric: the frame rows M2 and M4 read "not applicable: no new screen" with the reason, instead of failing as pending. A card that names a new screen is unchanged.
- Board and drawer speak owner English: a card face starts with its id and reads "Stuck 17h:" and why it parked, and "research · 66h, no work yet" (no "working 0m"); the drawer title links to the story page with an expand icon beside close; a story waiting at a gate names the card's own stage on its pill and panel; rubric rows the builder has not attested read "Not shown yet" with the instruction behind "For the builder", and rows judged at the gate read "Yours to judge".
- A spec's `screens:` can point at a mock that already exists (`board (mocks/118), story page (mocks/132)`, or `name from mocks/<nnn>` in a list): `check mock` passes it when that mock folder exists and draws a frame, fails naming the missing path otherwise, and a card with only references needs no mock of its own, so a card draws only the states that are new to it.
- Evidence files open: the API serves each file at `GET /api/evidence/<nnn>/file/<name>` (confined to that story's folder; `..` or a link pointing out answers 404) and lists it as `url` beside `path`, so an image on the story page or the Evidence page opens the image instead of the board's HTML. The Evidence page is titled with its story and sits under Board, images show inline there, and on a narrow story page evidence names and the check sentence wrap instead of clipping.
- `codeloop card reopen <id> [--to <stage|backlog>] [note]` brings a done or dropped card back to the first stage of its lane or to the backlog, `card move <id> <stage> [note]` moves an active card to any stage of its lane (a note says why when it goes back past a gate that was passed), and `card edit <id>` changes its title, story, priority, feature or size and the story line in its spec.md; each is refused while a builder holds the card.
- A scheduled run or the doctor no longer reruns a failed stage check when nothing changed since it failed (spec folder, evidence, use cases, tasks.md, the story's events, activity and commits): it writes one `check-skipped` activity line per day ("nothing changed since the last fail at HH:MM") instead of spawning the check; `codeloop card check` and Check now always run (`advanceCard` takes `force`).
- `codeloop progress [--since 7d] [--json]` measures how stories moved: stage moves, median hours per stage, where time went idle, the stories stuck longest, the gates waiting longest and who they wait on, and failing checks grouped by their first output line; it reads the board, events, activity and orchestrator turns and calls no model.
- `codeloop doctor` prints each action and each long step as it happens ("rerunning the build check for c-048, up to 10 min"), stops a rerun check after 10 minutes and records `check-error: timed out after 10 min`, and takes `--dry-run` (list what it would do, change nothing) and `--no-checks` (skip the check reruns).
- `codeloop off [--for 2h] [--why "..."]` pauses codeloop in a repo and `codeloop on` ends it (`CODELOOP_OFF=1` pauses one process tree): every hook exits at once with no board read and no activity line, `orch`, `run` and the doctor refuse to start a turn with "codeloop is off here until HH:MM (why)", `guard session`, `codeloop status`, Home (`off`) and the hub attention list (`off: true`) say so, and a pause with `--for` ends on its own. An owner action in the assistant's shell (`codeloop approve`) still asks you while codeloop is off.
- codeloop starts in a third of the memory; the test suite runs serially.
- The workspace story page shows a stuck or failing story that work has landed on as "Stuck · moving" or "Failing · moving", lists its tasks with ticks and layer next to its commits (merged, or the branch holding them), puts the stage's rubric rows (pass, fail, pending, with the finding) beside Approve, and shows "in build 6h 04m, working 1h 12m" on the current step and on each board card. The Orchestration section explains a turn that ended in questions or a failed merge, and Home shows how long a stalled agent has been quiet.
- Every story shows time in stage and time working: `activeMinutes` (the gaps between consecutive edit, command, commit, hand-back or log lines that are within ten minutes of each other, summed) and `idleMinutes` (wall time in the phase minus that) sit on the journey steps, on `boardView` stories beside `phaseSince`, and `codeloop card show` prints "in build 6h 04m, working 1h 12m" (`cards.show` returns `phaseTime`).
- `codeloop card selfcheck <card>` runs the stage check, `check scope`, `check rubric` and the diff budget in the current work dir, one line each, exit 1 if any fails. The brief footer tells the builder to run it before handing back; the hand-back record carries the result (`selfcheck` on the record and the orch turn) and the gate skips the stage check when a selfcheck passed at the hand-back's head, still rerunning the proof. The review skill now says one review per story at the review stage, never per commit.
- A story with more than eight task lines in tasks.md, or size L, is refused when it enters the build stage by advance or `card place` ("c-048 has 17 tasks; split it into stories of eight or fewer (`codeloop card split c-048 ...`)"); `lanes: { max_tasks: <n> }` in config.yaml changes the limit, and a card with `split_from` and no more tasks than the limit passes. A story already in build is not thrown out: `card show` prints the sentence and the doctor records it once as a `split-nudge` event.
- A commit message trailer `Task: T017` (one or more, beside `Card: c-048`) ticks that line in the card's tasks.md from the post-commit hook, appends a `task` activity line and records a `task` card event; an id not in tasks.md is ignored with a one-line warning, and a task already ticked is left alone.
- In a project with Next.js (`mock.target: app`, the default when `next` is a dependency and `app/` or `src/app/` exists) `codeloop mock new <card> --topic <t>` writes the mock as a page in the app, `<app_dir>/mocks/<nnn>-<slug>/page.tsx` plus `mock-data.ts`, one `data-screen` section per screen in the spec; `codeloop check mock` accepts it when every screen is there, nothing imports from outside the project and inline style is layout only, and `codeloop mock cleanup <card>` deletes the page unless spec.md says `mock: keep`. `mock.app_dir` and `mock.components` (default `components/shared`) override the defaults.
- `codeloop orch <card> --builder session:<id-or-label-prefix> | person | agent[:name]` hands the brief to a live session or a person instead of spawning an agent: it goes to `.codeloop/state/orch/outbox/<session>.md` (`codeloop orch inbox` prints what is waiting) with an `orch-brief` activity line, then orch waits for the hand-back (`orch.wait_minutes`, default 120, or `--wait <min>`) and gates and merges as for an agent; `--no-wait` returns `briefed` and `codeloop orch resume <card>` finishes the turn (`orch.run` takes `builder` and `wait`, `orch.resume(id)`, `POST /api/cards/:id/orch/resume`).
- Signing in to the board survives a hub restart.
- A stuck or failing story that work has landed on since its check failed reads "stuck · moving" (`display.moving`): a newer tasks.md or evidence file, an edit, command, commit or hand-back line, or a `Card:`/`Feature:` commit on any branch counts. Home's lists, the inbox and the session-start monitor print "moving since HH:MM".
- The doctor reruns the check of a moving stuck or failing story without an agent: a pass advances it and clears stuck with no `approve`; a failure on unchanged work costs no retry. `codeloop doctor` runs one tick on demand.
- `codeloop card show` lists the current tasks with ticks, the evidence files with their times, and the story's commits on every branch ("merged" or "on <branch>"); `cards.full` returns `commits` and `evidenceFiles`, and `journey.tasks.items` carries the list.
- A new story worktree gets the host hooks (Claude, Cursor, git guards) the project set up, with a `hooks` activity line; `codeloop card worktree <id>` prints what it rendered.
- `layers:` in config.yaml maps a layer tag to path globs, and `codeloop spec check` fails a task tagged `[api]` that names a file in the `ui` layer (or the reverse); `codeloop init` writes the default block.
- `codeloop verify` fails a story whose diff exceeds the budget for its size (S 8 files / 300 lines, M 20 / 1,200, L 40 / 3,000; `diff_budget:` overrides, `budget: off` disables) and writes a `budget:` line to evidence; `codeloop card diff <id>` shows the numbers.
- `codeloop verify` fails a story that lowers the project health score (tests up; lint and type errors, critical gotchas and TODO/FIXME lines down) between the story's base and HEAD, and writes a `health:` line to evidence; a drop of up to `health.tolerance` points (default 1.0) is allowed, `health: off` disables; `codeloop health [--ref <sha>]` prints the breakdown and `codeloop card health <id>` the before, after and delta.
- `codeloop card worktree <card>` gives a story its own git worktree (`../<repo>-wt-<card>`) and branch (`feat/<feature or lane>-<title>`) cut from `git.trunk`, recorded on the card; `codeloop card merge <card>` fast-forwards it into the trunk (merge commit when it cannot), refused unless the latest gate passed and no file the branch changed is dirty in the main tree (`POST /api/cards/:id/worktree`, `POST /api/cards/:id/merge`).
- The build lane has a `data-model` stage between spec and build: `codeloop check data-model <card>` passes when no task is tagged `[data]` and spec.md names no `entities:`, and otherwise needs `specs/NNN/data-model.md` (Entities, Stores, Indexes, Migration) whose every store is named on `.codeloop/wiki/architecture/data-model.md`. Run `codeloop lane refresh build` to pick it up.
- The review stage fails while a file the story changed outside its plan has no verdict: `codeloop check scope <card>` lists each one with its line count, and evidence/<nnn>/review.md needs a `## Scope` row per file saying `keep` (reason of 10+ words), `revert`, or `move to <card-id>`. Run `codeloop lane refresh build` to pick it up.
- `codeloop orch <card> [--until <gate>] [--agent <name>] [--dry-run]` runs a story's current stage through a builder agent in the story's worktree, gates its newest hand-back, merges on a pass and advances the card; a failed gate or a missing hand-back costs a retry and its findings go into the next brief ("Latest gate findings"), and the last retry parks the story stuck. `codeloop orch status` lists stories under orchestration, `codeloop orch report <card>` prints what works now, proof, what is left and the next gate (`POST /api/cards/:id/orch`, `GET /api/orch/status`, `GET /api/cards/:id/orch`, `orch.run/status/report` on both SDK transports).
- `codeloop card merge` never leaves the main tree mid-merge. When the trunk added a file the story also added under its spec folder, `evidence/NNN` or `shape/<card>`, the branch's version is taken and the paths are named on the merge activity line; any other conflict aborts with "merge conflict in <path>: merge the trunk into the branch and hand back again". An orchestrated turn whose gate passed but whose merge failed is `merge-failed`: no retry is used and the run stops.
- An orchestrated turn whose builder left open questions (interview stage) ends as `questions`: no retry, no builder started again until they are answered, and `orch` stops with "waiting for answers". The interview file is board state, so `codeloop ask` and `answer` write it in the main tree even when run from a story worktree.
- The gate checks scope on the builder's branch: it runs the proof and the stage check with `CODELOOP_STORY_REF` set to the hand-back's head, and `check scope` (and rubric row B4) measure the story's commits up to that ref, so an out-of-plan file fails the gate before the merge instead of after it. A failed proof or stage check now puts the last lines of its output in the gate finding.
- `CODELOOP_WORK_DIR` points a story's own files (spec folder, evidence, shape, mocks, stage output) at its worktree while the board stays in the main tree; the gate and a hand-back's proof run in the worktree with it set, so `orch` gates research and specs a builder has committed but not yet merged.
- `CODELOOP_PROJECT_DIR` points card, hook, verify, check, inbox, ask and brief commands at the main tree's board when a builder runs inside a story worktree.
- A check that fails the same way as the last one, with no activity on the story since, no longer uses up a retry (it still writes its check line and `fail` event), so pressing Check now twice cannot park a story as stuck.
- The story page's check sentence says when the check is out of date ("The check failed at 17:50: 20 of 20 tasks open. Changed since: 3 of 16 tasks done; run Check now.", `journey.check.stale`), and a story with a live session on it reports its holder as the agent even when parked stuck.

### Everything under .codeloop
- codeloop writes nothing into a project's source tree: specs, evidence, shape, use cases, mocks and
  artifacts live under `.codeloop/` (`store.layout: dotfolder`, the default). The only writes outside
  are the host files a project opted into and, with `mock.target: app`, the app's own mocks folder.
- `store.layout: root` keeps the pre-0.5 folders at the repo root, and a project that still has them
  is read as root until it moves; every command prints a one-line notice and `codeloop doctor` names
  the folders. `codeloop store move --layout dotfolder [--dry-run]` moves them with `git mv`, rewrites
  the board's paths and the project's lanes, ignores `.codeloop/state` and leaves a `specs/` pointer.
- Lane and skill templates name story paths as `{spec}`, `{evidence}`, `{usecases}`, `{shape}` and
  `{artifacts}`, filled in for the project's layout; a brief carries the real paths.
- codeloop retries its own git commands for a few seconds while another builder holds `index.lock`.

### One main tree by default
- The default is one main tree: `orch.isolation: tree` runs each builder in the main tree on the
  checked-out branch, holding a lease on its plan's files; the gate judges the story's own trailered
  commits and there is no merge step. Up to `orch.max_builders` (2) builders run at once on disjoint
  plans; a story whose plan overlaps a held lease waits (`waiting-lease`, naming the holder) and a
  builder over the cap is `queued`, and the doctor tick retries both. A failed gate is fixed forward;
  nothing is reset. `worktree` and `auto` (a worktree for an L story) are options, `orch.on_conflict:
  worktree` takes a worktree instead of waiting, and `codeloop worktree prune` removes merged, clean
  worktrees. `orch status` shows each story's mode and lease.

### Resilience
- One budget per run: `orch run`, `run --due`, the doctor tick and a card run stop at 12 turns, 6
  agent starts, 90 minutes or 3 failures on one stage (`orch.budget`), with the reason recorded.
- Stops that spend no retry: a crashed check (`check-error`), an agent that cannot run
  (`builder-unavailable`), questions, a failed merge, a refusal, the repo lock (`locked`) or the budget.
- An agent that exits within 10 seconds with nothing handed back twice in a row is marked unavailable;
  no loop starts it again until `codeloop agent clear <name>`.
- `.codeloop/state/agent-ledger.json` counts each agent's starts per day; `max_runs_per_day` defaults
  to 10 and `codeloop stats` shows today's starts.
- One repo lock (`.codeloop/state/run.lock`) for orchestrated turns, `run --due`, post-merge builds and
  restarts, and `store move`; a second caller waits `orch.lock_wait_minutes` (10) then stops naming
  the holder, and a dead holder's lock is reclaimed.
- Agent processes run in their own process group and die with the codeloop process that started them;
  `codeloop ps` lists them and `codeloop ps --kill-orphans` kills only those whose parent is gone.

### Speed and memory
- A resident hook process (`codeloop hookd`, started by the hook script, gone after 10 idle minutes) answers `guard edit`, `bash`, `prompt` and `session` for every session, taking `guard session` from about 3 s to 0.3 s; the CLI loads a command's code only when it runs.
- `limits.max_memory_mb` (default 2048) holds new codeloop processes and agent starts while codeloop already uses more, and `codeloop ps --total` shows the sum; tests run in a sandbox that cannot touch the real board.
- `codeloop hub --restart` waits for the old listener to close before starting a new one, and the schedule restarts turns that were waiting.
- The board and Home read git and activity once per request, and the commit graph is cached by HEAD.

### Shared story store
- `codeloop render` writes the same CLAUDE.md, AGENTS.md and host rule files in every worktree: the
  active card line is gone from them, and the session-start hook prints the active story instead.
- A command in a linked worktree finds the main tree's board with no `CODELOOP_PROJECT_DIR`.
  `store.home: user` keeps cards.json, specs, evidence, shape, mocks and `.codeloop/state` under
  `~/.codeloop/projects/<id>/`, shared by every worktree; `codeloop store move --to user|repo` copies
  them across and `codeloop store where` prints where each path resolves.
- `store.move` names which of cards, state, mocks, specs, shape, evidence and docs-mocks `user` home
  takes, default all; the rest stay in the repo, and `store where` prints each path's home.

### Orchestrator after the merge
- After merging a story the orchestrator runs `codeloop verify` (from the verify stage on) and the
  project's `orch.after_merge.build` and `.restart` commands on the main tree, records each as a
  `post-merge` activity line, and parks the story stuck when one fails. A story worktree installs git
  guard hooks only when the main tree already has them, and `orch report` shows the merged turn's
  gate verdict rather than the latest gate's.

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
- The board's columns are the lane's phases (Up next, each phase, Live this week) and its rows are
  who holds each story (Needs you, Agent, Queued); an empty phase shrinks to its header, a lane
  picker replaces the lane chips, and each card says what it is doing now and how long it has been
  in its phase. The header, the sidebar and the story pager show one story count.
- A story page shows what the orchestrator did: its report paragraph, then one row per turn that
  opens to the builder's hand-back and the gate's verdict. Run with orchestrator and Brief a person
  start a turn from the page, Home lists every orchestrated story with stalled ones marked, a stuck
  story says what Approve does, and earlier phases' evidence shows under Output.

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

### Stage rubrics
- Research, interview, mock, spec, build, verify and review each have a `rubric.md` of criteria
  judged by `check`, `attest` or `review`, replacing `checklist.md`. `codeloop check rubric <card>`
  runs the check rows, needs a `- Rn pass: <evidence>` line naming a path, line, URL or command for
  every attest row, and is on every stage's done command. The brief carries the rubric.
- A stage may name `review: { agent }`: that agent judges the output after the stage's agent and
  writes `review-<stage>.md`, which needs `verdict: accept`. Research and interview carry it commented
  out. `cards.full` returns the rubric rows with pass, fail or pending for the gate panel.
- `codeloop rubric scaffold <card>` appends a `## Rubric` block with a `- Rn pending:` line for each
  attest row the card's stage still owes, once. `check rubric` reports those rows as pending, apart
  from missing ones, and `lane refresh` lists the cards in flight that need the scaffold.

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
