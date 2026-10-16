---
title: Stop the agent repeating the same mistake
description: Record a gotcha once, have every later stage read it, and let a gate that keeps rejecting the same fault tighten its own check.
---

## The problem

An agent starts each session knowing nothing about your codebase's traps. It makes the same mistake, you reject it with the same note, and next week it makes the mistake again.

## Without codeloop

You fix the mistake and tell the agent in chat. The chat ends and the lesson goes with it. Some teams paste the lesson into a rules file, which grows until nobody reads it, and nothing says which of the lessons mattered. When the same launch post is rejected three times for the same reason, the only fix is to keep writing the same note.

## With codeloop

codeloop learns in two places. The wiki holds facts about the codebase, and the lanes learn how work should flow. A wiki page is a markdown file with a title, a kind (gotcha, decision or concept), a scope of file globs, a frequency and a severity. You capture one with a command:

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

Capturing the same title again raises the frequency to 2 instead of making a second page. Before a stage, the agent runs `codeloop wiki inject --files <paths>`, which prints the pages whose scope matches, and the stage brief includes the same pages:

```text
## CSV export must quote commas (gotcha, freq 2, warning)

A value with a comma breaks the row unless quoted.
```

Running `codeloop learn` applies two thresholds from `config.yaml`. At frequency 3 (`codeloop.critical_frequency`) the page becomes critical, and `codeloop check gotchas --files <paths>` exits 1 while a critical page applies to those files and has not been acknowledged with `--ack <title>`. At frequency 10 (`codeloop.promote_frequency`) the page is copied into `.codeloop/rules.md`. A stage that puts the gotchas check in its done command turns a critical page into a blocking check, not a reminder.

The learn lane (capture, bump, promote) walks one lesson through the same steps, with a gate named `rule` where you approve before it becomes a rule.

The lanes learn from rejections too. Rejections at a gate and stuck stages are counted per lane version. At three on one stage, `codeloop lane propose` writes a proposal that cites the cards and the notes. You tighten the check, add a fixture that must fail, and run the proposal against the lane's past cards:

```text
  $ codeloop lane eval market-draft-1
        ok   draft / claim-without-proof: expected fail, got fail
        ok   draft / claim-with-proof: expected pass, got pass
        ok   replay c-009 / draft
        eval green for market-draft-1
  $ codeloop lane promote market-draft-1
```

`promote` is refused until the eval is green, and an agent cannot promote. The lane moves to version 2 and keeps version 1, and `codeloop lane rollback market` restores it. In one run the agent's next brief carried the lane's notes and the post passed the stricter check. `codeloop stats --lane market --compare v1 v2` shows whether the change helped.

Architecture knowledge has its own lane. `codeloop wiki build` refreshes the scanner's facts, starts a card titled "Explain the architecture" in the one-stage wiki lane, and runs it. The check, `codeloop check architecture`, confirms that every path the pages name exists and that every top-level folder is named or left out. It checks that the pages were not invented, not that the explanation is good. You approve at the `wiki` gate.

## What you still do

- Approve a rule at the learn lane's `rule` gate.
- Tighten the check in a lane proposal, and promote it once the eval is green.
- Approve the architecture pages at the `wiki` gate.

## Not yet

A wiki page is advice until its frequency reaches the critical threshold. Nothing blocks a stage on a page at frequency 1 or 2.

Next: the full [wiki and learning page](/docs/concepts/wiki-and-learning) and the [learn lane](/docs/reference/lanes).
