# c-368 research: I start, file, read and annotate a story in one command each

## What exists

exists: build. Each of the six asks has a near neighbour in the code, and none does the job in one step.

- Starting an existing story takes two commands. `codeloop start` takes only a title and makes a new card (src/commands/card.ts:472). `codeloop approve` refuses a queued story and says to run `codeloop card move <id> <stage>` (src/lib/engine.ts:1142), and the story is not made active, so the session's commits carry no story until `card activate` runs too.
- Filing a bug takes the long form. `codeloop start "<title>" --bug --size trivial` already makes a flagged trivial story (src/commands/card.ts:472), but nothing short exists, so an orchestrator fixing a bug commits with no card to name.
- `card show` prints the story only when all three story fields are there (src/commands/card.ts:229) and the description only when it is set (src/commands/card.ts:233). A blank field prints nothing, not even a hint. Split and queued stories are made with neither: `splitCard` passes only the title and inherited initiative, epic, feature and metric (src/lib/services.ts:365). On the production board on 18 October, 37 of 202 stories had no story and 60 no description.
- `card edit` changes the title, story, priority, feature, size and bug flag, and has no description option (src/commands/card.ts, `card edit --help`). An owner decision made after research has nowhere to go but a new card.
- Nothing releases a hold. The SessionEnd hook `codeloop hook release` frees only the ending session's own story (src/commands/guard-hooks.ts:214), and a session killed without its end hook never runs it.
- Holds are written once. A session holds a story through its file under .codeloop/state/active, written by `setActiveCard` (src/lib/active-card.ts:88) and removed only by that session's own end hook (src/commands/guard-hooks.ts:221) or `clearActiveCard` for the caller's own session (src/lib/active-card.ts:105). An orchestrated lease, `orch-<card>`, is dropped only when its turn ends (src/lib/orch.ts:394).
- A dead session holds its story for a day. `activeSessions` drops a session only when its file is 24 hours old (src/lib/active-card.ts:10), and the board's holder (src/lib/services.ts:303) and the lease check that makes other builders wait (src/lib/orch-isolation.ts:155) both read it. `workingOn` already treats a session quiet past `monitor.stall_minutes`, default 30, as not working (src/lib/engine.ts:527, src/lib/stall.ts:13), so the slot is freed while the board still shows the story as held. The orchestrator reported c-159 on the production board held for four hours by a run that had died.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| GitHub CLI | No start command: `gh issue develop` makes and checks out a branch, assigning is `gh issue edit --add-assignee @me`, and status is a separate project command. `gh issue create` prints the new issue's URL. `gh issue view` prints "No description provided" for an empty body. `gh issue edit --body` replaces the body; there is no append | https://cli.github.com/manual/gh_issue_develop |
| Linear CLI | `linear issue start` checks out the issue's branch and moves it to started in one step, but does not assign it. `linear issue create` prints the new key. `issue view` leaves an empty description out with no placeholder; `--description` replaces it | https://raw.githubusercontent.com/schpet/linear-cli/main/crates/linear-cli/src/commands/issue/start.rs |
| Jira CLI | No start command; a request for `jira issue start` is an open idea. `jira issue create -tBug -s"..." --no-input` files a bug in one line. `issue view` drops an empty description and prints "None" or "Unassigned" for other blanks. `issue edit -b` replaces the description | https://github.com/ankitpokhrel/jira-cli/discussions/711 |
| Beads | `bd ready --claim` claims the next ready issue atomically, with a lease of 5 minutes kept alive by `bd heartbeat`; `bd reclaim` returns issues whose lease went stale to ready | https://github.com/steveyegge/beads/blob/4c63e151/cmd/bd/reclaim.go |

Only Linear starts an issue in one step, and only Beads expires a quiet claim. None appends to a description; each replaces it, and comments are the only way to add a later decision. Codeloop can do both, because a story's activity stream already records each session's prompts and tool calls (src/lib/stall.ts:68), which is the heartbeat a lease needs, and `monitor.stall_minutes` already defines quiet.

## The pain, grounded

pain: the founder's orchestrator on the production project reported on 18 October (c-368's description and the owner's note in .codeloop/cards.json) that it could not start the next story in one step, had no card to name on bug-fix commits, read blank stories from `card show`, could not add the owner's decisions to a story, and that its c-159 was held for four hours by a run that had died, with no way to release it. A worker that crashes keeps its claim until something expires it, which is why queues hide a message only for a visibility timeout (AWS SQS) and leases carry a duration measured from the last renewal (Kubernetes).

## Options

- **One command each for start, bug, release and annotate, and holds that expire when their session goes quiet.** Chosen. `codeloop start <id>` starts a queued or proposed story at its start stage and makes it active; `codeloop bug "<title>"` files a trivial flagged story, makes it active and prints its Card line; `card show` names each blank field with the command that fills it; `card edit --description` appends a dated line; `card release <id>` frees another session's hold, recorded on the story; and a hold whose session wrote nothing to the story's activity for `monitor.stall_minutes` stops counting, everywhere a hold is read, with an expiry event. It reuses `startCard` (src/lib/flow.ts:10), `builderIdle` (src/lib/stall.ts:68) and `clearActiveCard` (src/lib/active-card.ts:105), and touches `src/commands/card.ts`, `src/lib/services.ts`, `src/lib/engine.ts`, `src/lib/active-card.ts`, `src/lib/orch-isolation.ts`, `src/commands/guard-hooks.ts` and `src/sdk/client.ts`.
- **A heartbeat lease, as Beads does, renewed by a call every few minutes.** Lost: it needs a writer in every host and agent, and the activity stream already carries the same signal.
- **Only a release command, keeping the 24-hour expiry.** Lost: the owner asked for automatic expiry, and c-159 waited four hours for someone to notice.

## Risks

- Expiring the hold of a session that is only thinking frees its files for another builder. Bounded by: quiet means no prompt, tool call or write for the whole stall window, and the session takes the hold back on its next prompt.
- A release by the orchestrator could free a story a person is working on. Bounded by: the release is an event naming who released whose hold, and an agent run may release only its own.
- `codeloop start <id>` on a proposed story skips the owner's review of the proposal. Bounded by: it is refused inside an agent run, as approve is (src/lib/engine.ts:1142).

## Open questions

- Should `codeloop start <id>` also start a proposed story, or only a queued one?
- Who may release a hold another session has?
- How long may a session stay quiet before its hold expires?
- What exactly does `codeloop bug` make: which lane, size and flag, and what does it print?
- How does `card edit --description` add text, and what does `card show` print for a blank field?

## Sources

- source: src/lib/engine.ts:1142 - approve refuses a queued story and names card move, so starting it takes two commands
- source: src/lib/active-card.ts:10 - a session's hold lasts 24 hours from its file's age, so a dead session holds its story for a day
- source: src/lib/services.ts:303 - the board's holder reads every session the 24-hour rule keeps
- source: src/lib/orch-isolation.ts:155 - the lease check that makes builders wait reads the same sessions
- source: src/lib/stall.ts:13 - monitor.stall_minutes, 30 by default, already defines a quiet builder
- source: src/commands/card.ts:229 - card show prints the story only when all three fields exist and says nothing when they do not
- source: src/lib/services.ts:365 - split stories are made with no story and no description
- source: https://cli.github.com/manual/gh_issue_develop - gh has no start command; develop only makes a branch
- source: https://cli.github.com/manual/gh_issue_edit - gh edit replaces the body and assigns separately
- source: https://raw.githubusercontent.com/cli/cli/trunk/pkg/cmd/issue/view/view.go - gh prints "No description provided" for an empty body
- source: https://raw.githubusercontent.com/schpet/linear-cli/main/crates/linear-cli/src/commands/issue/start.rs - linear issue start checks out and marks started in one step
- source: https://raw.githubusercontent.com/schpet/linear-cli/main/skills/linear-cli/references/issue.md - linear create prints the key; description is replaced, not appended
- source: https://raw.githubusercontent.com/ankitpokhrel/jira-cli/main/README.md - jira files a bug in one line; edit replaces the description
- source: https://raw.githubusercontent.com/ankitpokhrel/jira-cli/main/internal/view/issue.go - jira view drops an empty description, prints None for other blanks
- source: https://github.com/ankitpokhrel/jira-cli/discussions/711 - jira issue start is still an open idea
- source: https://github.com/steveyegge/beads/blob/4c63e151/internal/storage/issueops/lease.go - Beads claims carry a 5-minute lease
- source: https://github.com/steveyegge/beads/blob/4c63e151/cmd/bd/reclaim.go - bd reclaim returns stale claims to ready
- source: https://kubernetes.io/docs/reference/kubernetes-api/coordination/lease-v1/ - a lease's duration is measured from its holder's last renewal
- source: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html - a message a crashed consumer took becomes visible again after the timeout

## Rubric

- R2 pass: `codeloop start --help` takes only `<title>`; `codeloop card --help` lists no release command; `codeloop card edit --help` has no description option; src/lib/active-card.ts:10 keeps a session for 24 hours
- R5 pass: specs/368-i-start-file-read-and-annotate-a-story-i/research.md:32
- R7 pass: specs/368-i-start-file-read-and-annotate-a-story-i/research.md:42

verdict: build
