---
title: Cards and gates
description: A card is one slice of work moving through a lane. A gate is where it stops for a person.
---

## A card

A card has an id (`c-001`, `c-002`, ...), a lane, a stage, a story and a list of events. It lives in `.codeloop/cards.json`. Nothing edits that file by hand: the engine in the CLI is the only thing that moves a card, and it does so only by running the lane.

```text
  c-001  build    waiting for you: spec  Export invoices as CSV
  As a founder, I can export every invoice as one CSV, so that I can hand the file to my accountant.
  size S
  skill:  plan
  output: specs/001-export-invoices-as-csv/tasks.md
  check:  codeloop spec check c-001

  2026-10-07T20:02:52.942Z  agent    create research
  2026-10-07T20:02:52.947Z  agent    spec research: specs/001-export-invoices-as-csv
  2026-10-07T20:02:53.330Z  engine   fail research: specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`)
  2026-10-07T20:03:14.870Z  engine   advance research: to mock
  2026-10-07T20:03:15.275Z  engine   advance mock: to spec
  2026-10-07T20:03:15.717Z  engine   park spec: gate spec (after the check passed)
```

Every event names who did it (`agent`, `engine`, `owner`, `reviewer`), what happened and the stage. `codeloop stats` is computed from these events and nothing else.

## Ways a card starts

| Command | What it does |
|---|---|
| `codeloop start "<title>"` | A card in the build lane's first stage, plus its spec folder. `--lane` picks another lane. |
| `codeloop card new <lane> <title>` | The same without the spec folder. |
| `codeloop card propose <lane> <title>` | A proposal. It waits in the inbox and nothing starts it. `approve` promotes it into the lane; `reject` drops it. Triage and scan write these. |
| A lane trigger | `codeloop run` starts cards for due cron lanes, new git tags and finished upstream lanes. |
| `codeloop import speckit` or `bmad` | One card per existing feature or story, from another tool's folder. Source files are only read. |

`start`, `card new` and `card propose` take the story fields: `--persona`, `--can`, `--so`, `--size`, `--points`, `--bet`, `--feature`, `--metric`, `--epic`. They refuse a title or story that fails the [story standard](/docs/reference/story-standard) unless `--force` is given.

## Ways a card moves

| Command | What it does |
|---|---|
| `codeloop next [id]` | Runs the stage check. Exit 0 moves the card; otherwise the failure is counted. With one active card the id is optional. Same as `card advance`. |
| `codeloop approve <id>` | Records the approval at the gate and advances once. |
| `codeloop reject <id> "<note>"` | Records the note. The card stays in its stage and the note goes into the next brief. |
| `codeloop run` | `next` for every card that is not waiting on a person, after starting any due cards. With `--agent`, a headless agent does each stage first. |

Writes to `cards.json` are compare-and-swap. A write from a stale read is refused, so two runs cannot both move the same card.

## Gates

A gate is a stage key: `gate: { name: spec, approver: owner }`. There are two kinds.

**After the check.** The default. The stage's work is done and the check passed. The card parks. The inbox says what to read. An approval moves it on; a rejection with a note sends the stage back to whoever does it. The approval is bound to the output file and the check text: if either changes afterwards, the card parks again with the reason `the output or the check changed since it was approved`.

**Before the stage.** `outward: true`. The stage changes something public: a release, a post. The card parks on entry. No agent starts, no check runs. An approval lets the stage run. The three shipped outward gates are build/live, deploy/prod and market/publish.

## Who can approve

| `approver` | Means |
|---|---|
| `owner` | The person who owns the product. The default role at a terminal. |
| `reviewer` | Whoever reviews pull requests. `--as reviewer`. |

An agent is never an approver. `codeloop run --agent` sets `CODELOOP_AGENT_RUN` in the agent's environment, and a process with that set cannot claim another role, so an agent that runs `codeloop approve` is refused. [Approve a gate](/docs/start/approve-a-gate) shows the refusal text.

## Stuck

A stage check can fail `retries` times (three in the shipped lanes). On the last failure the card's gate becomes `stuck` and it appears in the inbox for you. On an unattended run, a stage whose output has not changed since the last failure is not re-run, so retries are not burned on the same broken file.

## Cards from other tools

```sh
codeloop import speckit [dir]
codeloop import bmad [dir]
```

`speckit` makes one card per `specs/NNN*` feature and rewrites its tasks with layer tags. `bmad` makes one card per story in `sprint-status.yaml` and maps its status to a stage. Both only read the source files. The BMAD importer reads the `sprint-status.yaml` layout; newer BMAD releases write a different file, and reading it is planned.

## Stats from the events

```sh
codeloop stats
codeloop stats --lane market --compare v1 v2
codeloop stats --card c-006
```

Human turns per card, unattended span, cycle time, rework (rejections over approvals), stuck rate, and first-pass rate at every gate. Per lane version, so a promoted lane can be compared with the one it replaced. The [founder's week](/docs/start/founders-week) ends with real numbers.
