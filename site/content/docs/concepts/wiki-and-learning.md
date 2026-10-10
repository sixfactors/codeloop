---
title: Wiki and learning
description: Pages agents read before a stage and write after it. Frequency raises severity. Repeated rejections change the lane.
---

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

`codeloop wiki competitor` keeps one page per competitor with its links at the top. The scan lane reads the changelog link on each page every Monday and proposes a plan card when something new appears. The build lane's research stage copies its "how others show it" row onto the competitor's page when the stage passes. The [founder's week](/docs/start/founders-week) shows both.

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
