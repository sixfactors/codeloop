---
title: Let the agent work overnight and approve in the morning
description: Run agents from cron while you are away, and come back to a short list of decisions instead of a pile of finished work you never agreed to.
---

## The problem

You want agent work to carry on while you are asleep or in meetings. You do not want to come back to a release, a published post or a pile of half-finished branches that nobody agreed to.

## Without codeloop

You either sit at the terminal and feed the agent the next prompt, or you leave it running and read what it did in the morning. The first costs you the day. The second means that anything the agent did on its own, including a deploy or a post, has already happened by the time you read about it. Bug reports and competitor news sit in a folder until you remember to turn them into tasks, and there is no single place that lists what is waiting for you.

## With codeloop

A lane is a file that lists the stages one kind of work goes through, and a stage is one step in it. Some lanes start on a schedule: triage at 20:00 every day, scan and plan on Monday, analyze on Friday. `codeloop run --agent` starts them when they are due, runs the agent on each stage whose check does not pass yet, and moves a card on only when the check exits 0. A card stops at a gate, a point where it waits for a person, and the engine refuses `approve` from an agent. You put one line in cron:

```sh
codeloop schedule install --every 30m
```

The week below is the transcript of one run with a stand-in agent that writes the minimum each check wants, so it shows what the engine does and not what a model writes. Lines starting `ok` are checks that held.

**Sunday night, nobody at the keyboard.** Triage is due at 20:00. It captures reports, classifies them, removes duplicates and files proposals, then waits for you.

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

**Monday 07:00.** The scan lane reads each competitor's changelog and proposes a card for what is new. Its one stage is a command, so no agent is involved.

```text
      07:05  created c-004 in scan (trigger: cron 0 7 * * MON)
  ok   the scan proposed one card: what shipped, the new lines and the source
  ok   nothing started any proposal overnight: three proposals, none of them moved
```

**Monday morning, ten minutes.** `codeloop inbox` lists four things. You pass the triage batch, promote the competitor card to the plan lane and drop one you do not want:

```text
  $ codeloop approve c-001
      c-001 gate proposals approved
  $ codeloop approve c-005
      c-005 promoted to plan/gather
  $ codeloop reject c-002 "not this quarter"
      c-002 dropped; note recorded
```

The plan lane has `wip: 1`, so it works one card at a time, and the weekly plan card that falls due at 09:00 waits its turn:

```text
      09:05  skipped plan: lane plan already has 1 active cards (wip 1)
```

**Monday, one feature to the spec gate.** The agent runs research, mock and spec, and stops for you:

```text
      11:35  c-006: agent fake ran spec
      11:35  c-006: waiting for you
  ok   an agent cannot approve the gate
```

**Public steps wait before they act.** A git tag starts the deploy lane. It does staging and verify, then stops on entering prod, and the build card's own live stage waits the same way:

```text
      15:35  created c-008 in deploy (trigger: git.tag v0.1.0)
      16:05  c-008: waiting for you
  ok   deploy did staging and verify, then stopped on entering prod
  ok   nothing was released: the prod step has not run and no agent was started for it
```

**Tuesday, a rejection.** You reject the launch post with a note, and the redo gets the note in its brief:

```text
  $ codeloop reject c-009 "No number behind the claim: cite the measured export time."
      c-009 rejected at draft; note recorded
```

**Friday.** At the end of the week `codeloop inbox` and `codeloop stats` give the totals:

```text
  $ codeloop inbox
      9 shipped this week, 4 waiting on you, oldest 4 days
  $ codeloop stats
      cards 14, done 9
      human turns per card   1.5
      rework (rejects/approvals) 0.23
```

Fifteen approvals and four rejections were the founder's whole week, and forty-nine agent runs did the rest.

## What you still do

- Approve or reject what sits in the inbox: proposals, specs, copy, verdicts, and every public step.
- Read the oldest waiting card first. The inbox lists them oldest first.

Nothing public runs without you. Deploy to prod, build live and publish are outward gates, so the card parks before the stage runs.

## Not yet

- Approvals are local events, and `gate check` says so. A hosted board with signed-in owner and reviewer roles is planned.
- `run --agent` runs every lane that is due in the project. There is no flag yet to limit it to one lane or one card.

Next: [Cloud and hosting](/docs/concepts/cloud-and-hosting) for the schedule and the optional board.
