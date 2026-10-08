---
title: Lanes
description: A lane is a YAML file that says what a kind of work goes through, what checks each step, and where a person decides.
---

## One file per kind of work

A lane lives at `.codeloop/lanes/<id>.yaml`. `codeloop init` installs eight. This is the shipped build lane, unchanged:

```yaml
id: build
version: 1
metric: { name: cycle_time_days, source: cards, target: "<5" }
trigger: { manual: true }
wip: 2
retries: 3
stages:
  - id: research
    skill: design
    output: "{spec}/research.md"
    done: { cmd: "codeloop check research {id} --min-sources 3" }
  - id: mock
    skill: design
    done: { cmd: "codeloop check mock {id}" }
  - id: spec
    skill: plan
    output: "{spec}/tasks.md"
    done: { cmd: "codeloop spec check {id}" }
    gate: { name: spec, approver: owner }
  - id: build
    skill: test
    done: { cmd: "codeloop task check {id} --all-done && npm test" }
  - id: verify
    skill: qa
    output: evidence/{nnn}/verify.md
    done: { cmd: "codeloop verify {id}" }
    gate: { name: local, approver: owner }
  - id: review
    skill: commit
    output: evidence/{nnn}/review.md
    done: { cmd: "codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'" }
    gate: { name: pr, approver: reviewer }
  - id: staging
    skill: deploy
    output: evidence/{nnn}/staging.md
    done: { cmd: "codeloop check file evidence/{nnn}/staging.md --has 'result: pass'" }
  - id: live
    skill: ship
    output: evidence/{nnn}/prod.md
    done: { cmd: "codeloop check file evidence/{nnn}/prod.md --has 'result: pass'" }
    gate: { name: prod, approver: owner, outward: true }
# on_done: { start: market }
```

The shipped file ends with `on_done` commented out, as above — it is an opt-in second way to start the next lane's card, behind `lanes: { auto_start: true }` in `config.yaml`. `market`'s own `trigger: { on: lane.done, lane: build }` is what actually starts a market card when a build card finishes by default; see the `trigger` row below.

## The keys

| Key | Meaning |
|---|---|
| `id` | The lane's name. Also the folder its cards write under, for lanes that use `{id}` in outputs. |
| `version` | Starts at 1. `lane promote` raises it and keeps the old file. Rejections and stats are counted per version. |
| `metric` | The one number this lane exists to move, where it is read from, and the target. Cards inherit it and may override it. |
| `trigger` | What starts a card. `manual: true` means `codeloop start`. `cron: "<5 fields>"` starts one on schedule. `on: git.tag` starts one when a new tag appears. `on: lane.done, lane: build` starts one when a build card finishes. |
| `wip` | How many cards the lane works at once. The run loop skips a lane that is full and says so. |
| `retries` | Failed checks allowed on one stage before the card parks as stuck. |
| `stages` | The list, in order. |
| `on_done` | A lane to start a card in when a card here finishes. Off by default — a done card only announces what it would start — until `.codeloop/config.yaml` has `lanes: { auto_start: true }`. The other lane's own `trigger: { on: lane.done }` is a separate mechanism and fires either way; most downstream lanes rely on that instead. |

## A stage

| Key | Meaning |
|---|---|
| `id` | The stage name shown on the card and in the inbox. |
| `skill` | The skill an agent or a person runs to do the stage. Must exist in the skills index, which `lane lint` checks. |
| `output` | The file the stage writes. `{id}` is the card id, `{nnn}` its number, `{spec}` its spec folder. The brief tells the agent to write it; the inbox tells you to read it. |
| `done` | `cmd`: a command run from the project root. Exit 0 moves the card. Anything else is a failure, counted toward `retries`. `event`: instead of a command, the stage waits for `codeloop next <id> --event <name>`. |
| `gate` | `name` and `approver` (`owner` or `reviewer`). The card parks after the check passes. `outward: true` parks it on entry instead, before anything runs. |
| `notes` | Lines carried into the stage brief. `lane propose` adds rejection notes here. |

A stage with no `skill` and only a `done.cmd` is a command, not a job for an agent. The scan lane is one stage of that kind.

## Trigger kinds across the eight lanes

| Lane | Trigger | Why |
|---|---|---|
| build, learn | manual | You decide what to build and what to learn. |
| plan | cron, Monday 09:00 | A weekly plan card. |
| scan | cron, Monday 07:00 | Competitor changelogs before the plan runs. |
| triage | cron, daily 20:00 | Issues and feedback become proposals overnight. |
| analyze | cron, Friday 09:00 | The weekly numbers. |
| deploy | git.tag | A release is a tag. |
| market | lane.done from build | Every shipped feature gets a launch post. |

`codeloop run` evaluates the cron and event triggers each time it runs. `codeloop schedule install` puts it in your crontab. [Cloud and hosting](/docs/concepts/cloud-and-hosting) has that.

## Inspect a lane

```sh
codeloop lane show build
```

```text
id: build
version: 1
metric: cycle_time_days (cards) target <5
wip: 2  retries: 3
  research   design                       codeloop check research {id} --min-sources 3
  mock       design                       codeloop check mock {id}
  spec       plan                         codeloop spec check {id}  gate spec (owner)
  build      test                         codeloop task check {id} --all-done && npm test
  verify     qa                           codeloop verify {id}  gate local (owner)
  review     commit                       codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'  gate pr (reviewer)
  staging    deploy                       codeloop check file evidence/{nnn}/staging.md --has 'result: pass'
  live       ship                         codeloop check file evidence/{nnn}/prod.md --has 'result: pass'  gate prod (owner, public step)
on_done: start market
```

`lane list` prints all eight on one line each. `lane lint` exits 2 on any error: an unknown skill, a trigger `lane.done` without `lane:`, a stage with neither `cmd` nor `event`.

## Changing a lane

Edit the file for a new project before any card runs through it. Once cards exist, a lane changes through a proposal:

```sh
codeloop lane propose
codeloop lane eval <proposal>
codeloop lane promote <proposal>
codeloop lane rollback <lane>
```

`propose` writes a proposal from repeated rejections and stuck stages. `eval` lints it, runs its fixtures and replays past cards through it; a changed check with no fixture that fails is refused. `promote` installs it as the next version. `rollback` restores the one before. The whole loop with real output is on [Wiki and learning](/docs/concepts/wiki-and-learning).

The eight shipped lanes, stage by stage, are on the [lanes reference](/docs/reference/lanes).
