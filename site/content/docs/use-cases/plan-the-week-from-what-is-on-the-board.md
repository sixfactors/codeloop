---
title: Plan the week from what is on the board
description: Get a ranked plan every Monday from the proposals, signals and competitor news already in your project, and approve the backlog in one step.
---

## The problem

Monday starts with a blank page. The bug reports, the competitor changes and last week's numbers are in different places, and the week's plan is whatever you remember.

## Without codeloop

You skim the issue tracker, the competitor's changelog and last week's analytics, and decide from memory. The ranking is a feeling, with no stated reach or effort, so you cannot say later why a card was in the week and another was not. If an agent drafts the plan, nothing makes it cite what it read.

## With codeloop

The plan lane runs on Monday at 09:00. A lane is a file that lists the stages a kind of work goes through. Plan has four stages, gather, research, rank and story, and each is done when its check passes:

| Stage | Check on the file it writes |
|---|---|
| gather | `signals:` is present |
| research | a `verdict:` line is present |
| rank | `rice:` is present, the score from reach, impact, confidence and effort |
| story | `acceptance:` is present |

The lane stops at the backlog gate after the story stage. The lane has `wip: 1`, so it works one card at a time, and a second plan card that falls due waits its turn:

```text
      09:05  skipped plan: lane plan already has 1 active cards (wip 1)
```

Cards come in from the proposals that triage and the competitor scan wrote. In the inbox a proposal is a card nothing has started. You promote one into the plan lane, or drop it with a note:

```text
  $ codeloop approve c-005
      c-005 promoted to plan/gather
  $ codeloop reject c-002 "not this quarter"
      c-002 dropped; note recorded
```

The research stage writes its finding on the competitor's wiki page. When the Friday growth review finishes, its findings open one plan card, linked to the review that produced them, and the plan lane takes it to the backlog gate.

## What you still do

- Promote or drop each proposal.
- Approve the backlog gate once you have read the ranked stories.

## Not yet

- The lane reads the files and cards that already exist in your project. A direct import from Linear, Jira or GitHub is planned and not done: the ticket id comes in one card at a time.

Next: the [plan lane, stage by stage](/docs/reference/lanes), and [how priority is ordered](/docs/concepts/initiatives-epics-features-and-priority).
