---
title: Wiki and learning
description: Pages agents read before a stage and write after it. Frequency raises severity. Repeated rejections change the lane.
---

An agent starts each session knowing nothing about your codebase's traps, so the same mistake is made, rejected and made again.

Two things learn in codeloop. The wiki learns facts about the codebase: gotchas, decisions, concepts. The lanes learn how work should flow: a gate that keeps rejecting gets a tighter check. Both go through a person before anything is enforced.

## Wiki pages

A page is a markdown file under `.codeloop/wiki/<kind>/<slug>.md` with a title, a kind, a scope of file globs, a frequency and a severity.

```sh
codeloop wiki capture \
  --title "CSV export must quote commas" \
  --scope "src/export*" \
  --body "A value with a comma breaks the row unless quoted." \
  --kind gotcha --card c-001
```

```text
  warning  freq 1   CSV export must quote commas  .codeloop/wiki/gotchas/csv-export-must-quote-commas.md
```

Capturing the same title again does not make a second page. It raises the frequency:

```text
  warning  freq 2   CSV export must quote commas  .codeloop/wiki/gotchas/csv-export-must-quote-commas.md
```

| Kind | Use |
|---|---|
| gotcha | Something that broke and why. The default. |
| decision | A choice that was made and the reason, so it is not reopened. |
| concept | How a part of the system works. |

## Inject before a stage

Every rendered host file tells the agent to run `wiki inject` before touching files. It prints the pages whose scope matches:

```sh
codeloop wiki inject --files src/export.ts
```

```text
## CSV export must quote commas (gotcha, freq 2, warning)

A value with a comma breaks the row unless quoted.
```

The stage brief from `codeloop brief` includes the same pages for the files the stage names. `wiki list` prints every page; `wiki lint` reports broken links (exit 1), stale pages and duplicate titles.

## Frequency raises severity

```sh
codeloop learn
```

`learn` applies two thresholds from `config.yaml`:

| Threshold | Default | Effect |
|---|---|---|
| `codeloop.critical_frequency` | 3 | The page's severity becomes critical. `codeloop check gotchas --files <paths>` then exits 1 while a critical page applies to those files and has not been acknowledged with `--ack <title>`. |
| `codeloop.promote_frequency` | 10 | The page is copied into `.codeloop/rules.md` once, and marked promoted. |

With one page at frequency 2 the output is `nothing crossed a threshold`. A build-lane stage that puts `codeloop check gotchas --files ...` in its check turns a critical page into a blocking check, not a reminder.

## Competitor pages

`codeloop wiki competitor` keeps one page per competitor with its links at the top. The scan lane reads the changelog link on each page every Monday and proposes a plan card when something new appears. The build lane's research stage copies its "how others show it" row onto the competitor's page when the stage passes. The [overnight-run use case](/docs/use-cases/let-the-agent-work-overnight-and-approve-in-the-morning) shows the scan.

## Lanes learn from rejections

Rejections at a gate and stuck stages are counted per lane version. At three of either on one stage, `codeloop lane propose` writes a proposal folder:

```text
.codeloop/proposals/market-draft-1/
  lane.yaml   the lane with version +1 and the rejection notes added to the stage's notes:
  why.md      which cards, when, and each note, in a table
  eval.yaml   fixtures to fill in
```

The proposal is a change to the lane file, not to a prompt. The notes land in every future brief for that stage. If the check should be stricter, the owner edits `lane.yaml` and adds a fixture to `eval.yaml` that the new check must fail:

```yaml
fixtures:
  - name: claim-without-proof
    setup: "printf 'claim: fast\\n' > marketing/c-1/blog.md"
    expect: fail
  - name: claim-with-proof
    setup: "printf 'claim: fast\\nproof: 0.4s\\n' > marketing/c-1/blog.md"
    expect: pass
```

```sh
codeloop lane eval market-draft-1
```

```text
  ok   draft / claim-without-proof: expected fail, got fail
  ok   draft / claim-with-proof: expected pass, got pass
  ok   replay c-009 / draft
  eval green for market-draft-1
```

`eval` runs each fixture in an empty temp dir against the changed check, and replays the lane's finished cards through it so a stricter check does not fail work that was already approved. A changed check with no `expect: fail` fixture is refused as vacuous. `promote` is refused before a green eval, and an agent cannot promote at all.

```sh
codeloop lane promote market-draft-1
```

The lane is now version 2. Version 1 is kept, and `codeloop lane rollback market` restores it. `codeloop stats --lane market --compare v1 v2` shows whether the change helped.

## What is learned where

| Learned thing | Where it lives | Who approves |
|---|---|---|
| A fact about the code | `.codeloop/wiki/` | Nobody; it is advice until frequency makes it critical |
| A rule | `.codeloop/rules.md` | Promoted at frequency 10, or written by hand |
| A change to how work flows | `.codeloop/lanes/<id>.yaml`, new version | The owner, after a green eval |

## Facts, then the five pages that explain them

Facts and explanation are two different jobs, written by two different things.

`codeloop wiki init --from-repo` (and `codeloop wiki build`, below) scans the repo and writes two
things nobody has to read as prose: `.codeloop/state/repo-facts.json` (the stack, routes,
entities, Makefile targets, CI, deploy targets, and `topFolders`, the top-level source
directories) and the raw C4-shaped inventories under `wiki/reference/`: `context.md`,
`containers.md`, `stack.md`, `erd.md`, `service-contracts.md`, `data-flows.md`, `deploy.md`. Every
diagram is a ```mermaid fence, and the wiki renders those as diagrams, in light and dark. A line
that cannot be grounded in a file says `assumption:` so a person knows what to confirm.

The architecture skill reads those facts, reads the actual code, and writes the five pages a new
engineer would want under `wiki/architecture/`: `overview.md` (what the parts are and how they
stack, as a layered flowchart over real folders), `flows.md` (2 to 4 sequence diagrams of the main
journeys), `data-model.md` (an ER diagram of the entities that matter), `change-map.md` ("to
change X, edit Y, then run Z") and `invariants.md` (what must stay true, each rule naming the file
that enforces it and the test that proves it). `wiki/reference/` is facts; `wiki/architecture/` is
judgment, and only the architecture skill writes it.

`codeloop check architecture` judges the five pages mechanically: every path they name has to
exist, every top-level folder from `repo-facts.json` has to be named or explicitly left out, pages
and tables and diagrams stay inside noise limits, sequence participants match the overview's
names, and no scanner leftovers (a bare count like "59 routes" used as a label) survive into them.
It cannot judge whether the explanation is good, only that it was not invented.

```sh
codeloop wiki build
```

Moves scanner filler into `reference/legacy/` first (`codeloop wiki migrate`), then refreshes the
facts and reference pages, starts a card titled "Explain the architecture" in the one-stage `wiki`
lane, and runs it. `--agent <name>` picks a preset, `--no-run` only runs the migrate and refresh and
creates the card. The `wiki` lane names `claude-sonnet` as its own agent (a preset `codeloop init`
writes beside `claude`, running the same CLI with `--model sonnet`), so the bulk writing runs on a
cheaper model unless `--agent` says otherwise; a lane's own `agent:` is preferred over
`agents.default` whenever the run does not name one itself. The system-design artifact for a single
story draws the same views for one change; the architecture pages are the standing picture.

## The one wiki shape

codeloop owns the folders a wiki can have. A user adds one only by naming it in `wiki.sections` in
`.codeloop/config.yaml`; nothing else creates a new top-level folder.

| Section | Folder or file | Answers | Written by |
|---|---|---|---|
| Start here | `start-here.md` | What is this, how do I run it, the three real common tasks | The architecture skill, checked |
| How it works | `architecture/` | The five pages above | The architecture skill, checked |
| What bites | `gotchas/` | Mistakes, scoped to files | `wiki capture`, the Stop hook, agents |
| Why | `decisions/` | Why it is built this way | The research stage, `wiki capture --kind decision` |
| Commands | `runbooks/commands.md` | Every script and make target: what it is for, when to run it | The architecture skill, checked |
| Competitors | `competitors/` | Only when the user added one | `wiki competitor add` |
| Reference | `reference/` | Scanner output, generated, collapsed at the bottom | `wiki init --from-repo`, `wiki build` |

Planning records stay as files where the store keeps them (`initiatives/`, `epics/`, `features/`,
`cards/`) but are hidden from the wiki nav: the board's own screens show them. `numbers/` is the
one exception that stays hidden only while it is empty; once the analyze workflow writes a page
with real data into it, it shows.

Three rules keep the shape honest:

- The scanner writes only `reference/` and `.codeloop/state/repo-facts.json`. It no longer seeds
  the glossary, a product overview, numbers, or one runbook page per script; a repo scanned before
  this rule carries that filler still.
- `codeloop wiki lint` refuses a page sitting in a folder that is neither in the shape nor in
  `wiki.sections`, and reports (without refusing) any page still carrying scanner filler, an
  `assumption:` or `no-data:` line, or a per-script runbook.
- `codeloop wiki migrate [--dry-run]` moves that filler into `reference/legacy/<same path>`,
  printing every move and never deleting anything. `codeloop wiki build` runs it first, so an older
  scan's filler never survives a refresh.

The wiki home renders `start-here.md`, then the sections above in order with their page counts,
server-computed so the page never groups the raw list itself. An empty section does not render;
reference renders last, collapsed. The sidebar tree follows the same order and titles.
