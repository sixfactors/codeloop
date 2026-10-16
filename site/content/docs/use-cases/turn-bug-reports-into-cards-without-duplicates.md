---
title: Turn bug reports into cards without duplicates
description: Let a nightly run sort incoming reports into proposed cards, name the duplicates, and leave the decision to you.
---

## The problem

Reports arrive from users, from support and from your own notes, and three of them describe the same fault. Nobody has time to read them all, so they sit.

## Without codeloop

You read each report, decide whether it is new, and either write a ticket or forget it. When an agent triages for you, it files a ticket per report, so one fault becomes three cards, and the cards start work without anyone choosing them. The duplicates are found by whoever picks them up.

## With codeloop

The triage lane runs every day at 20:00. A lane is a file that lists the stages a kind of work goes through, and a stage is one step in it. Triage has four, capture, classify, dedupe and file, each done when its output has the field its check looks for: `sources:`, `category:`, `duplicates:` and `proposals:`. The last stage has a gate, a point where the card waits for a person, named `proposals`.

The agent works through the stages from cron with `codeloop run --agent`, and then stops:

```text
      20:05  created c-001 in triage (trigger: cron 0 20 * * *)
      20:05  c-001: agent fake ran capture
      20:35  c-001: agent fake ran classify
      21:05  c-001: agent fake ran dedupe
      21:35  c-001: agent fake ran file
      21:35  c-001: waiting for you
  ok   triage proposed one card per distinct issue: two cards from three issues, each naming its issue
  ok   the duplicate issue was named, not proposed twice
```

In the morning `codeloop inbox` shows the batch. A proposal is a card nothing has started. Approving the batch passes it. Approving one proposal puts it in the plan lane, and rejecting drops it with your note:

```text
  $ codeloop approve c-001
      c-001 gate proposals approved
  $ codeloop reject c-002 "not this quarter"
      c-002 dropped; note recorded
```

Nothing starts a proposal by itself: three proposals sat overnight and none of them moved.

## What you still do

- Approve the batch, or approve and reject proposals one by one.
- Decide which proposals enter the plan lane.

## Not yet

Pulling reports directly from a tracker (Linear, Jira, GitHub) is planned and not done. What triage reads is what the capture stage is told to read.

Next: the [triage lane, stage by stage](/docs/reference/lanes), and [what the inbox lists](/docs/concepts/the-inbox).
