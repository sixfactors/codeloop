---
title: A founder's week
description: The saved transcript of one scripted week, 14 cards and 75 assertions, read day by day.
---

This page follows `docs/artifacts/demo-founder-week.txt` in the codeloop repo. It is the output of `scripts/demo-founder-week.sh`, which runs a whole week against the built CLI with a stand-in agent and a clock the script controls, and asserts every step. The script passed 75 checks and failed none. Every quoted line below is from that file.

The product is a made-up invoicing app. The competitor is a made-up Rivalsoft. The agent is a fake that writes the minimum each check wants, so the week shows what the engine does, not what a model writes.

## Sunday evening: setup

`codeloop init` installs the eight lanes. The agent command is set in `local.yaml`, which is read over `config.yaml` and never leaves the machine. `cloud connect` uploads the board, config and lanes to a Protobox workspace.

```text
  ok   codeloop init installs the 8 shipped lanes; none is edited for this demo
  ok   cloud status: 10 documents, all in sync, and local.yaml is not one of them
  ok   the competitor gets a wiki page with its docs and changelog links
  ok   the first scan only stores what the changelog says today
```

## Sunday night: nobody at the keyboard

`codeloop run --agent` runs from cron every 30 minutes. The triage lane is due at 20:00.

```text
      20:05  created c-001 in triage (trigger: cron 0 20 * * *)
      20:05  c-001: agent fake ran capture
      20:05  c-001: moved
      20:35  c-001: agent fake ran classify
      20:35  c-001: moved
      21:05  c-001: agent fake ran dedupe
      21:05  c-001: moved
      21:35  c-001: agent fake ran file
      21:35  c-001: waiting for you
  ok   triage proposed one card per distinct issue: two cards from three issues, each naming its issue
  ok   the duplicate issue was named, not proposed twice
```

Monday 07:00 the scan lane runs. Its one stage is a command, not a skill, so no agent is involved.

```text
      07:05  created c-004 in scan (trigger: cron 0 7 * * MON)
      07:05  c-004: done
  ok   the scan proposed one card: what shipped, the new lines and the source
  ok   scanning again proposes nothing new
  ok   nothing started any proposal overnight: three proposals, none of them moved
```

## Monday morning: ten minutes

The inbox has four things. The founder passes the triage batch, promotes the competitor card and drops the dark theme.

```text
  $ codeloop approve c-001
      c-001 gate proposals approved
      c-001 done
  $ codeloop approve c-005
      c-005 promoted to plan/gather
      Next: run the /reflect skill to write plan/c-005/signals.md, then `codeloop next c-005`.
  $ codeloop reject c-002 "not this quarter"
      c-002 dropped; note recorded
```

The plan lane takes the promoted card through gather, research, rank and story on four runs and stops at the backlog gate. The lane has `wip: 1`, so the weekly plan card due at 09:00 waits its turn.

```text
      09:05  skipped plan: lane plan already has 1 active cards (wip 1)
  ok   plan's research stage put its Rivalsoft finding on the competitor page
  ok   the weekly plan card (Monday 09:00) was held back: the lane works on one card at a time
```

## Monday: one feature to the spec gate

```text
  $ codeloop start "Bulk CSV export" --as owner
      created c-006 in build at stage research (specs/006-bulk-csv-export/)
  ok   the research check refuses the empty template
      10:35  c-006: agent fake ran research
      11:05  c-006: agent fake ran mock
      11:35  c-006: agent fake ran spec
      11:35  c-006: waiting for you
  ok   research cites three sources and a verdict
  ok   the mock is built from the shared template and draws both screens the spec names
  ok   an agent cannot approve the gate
```

The inbox shows the spec to read and the mock path beside it. The founder approves, and the card moves to build.

## Monday afternoon: build, verify, review

```text
  ok   before the agent builds, the product's test fails
      13:05  c-006: agent fake ran build
      13:35  c-006: agent fake ran verify
      13:35  c-006: waiting for you
  $ sed -n 1,12p evidence/006/verify.md
      # Verify c-006

      result: pass
      sha: e4fcafedc23dc67e42694af96e22a76248582eb8
      env: local

      | Use case | Accepts | Layers |
      |---|---|---|
      | uc-1 | US1 | cli pass |
```

`codeloop verify` ran the card's use case and wrote evidence with the commit SHA. The owner approves the local gate, the agent writes the review, and the card waits for a reviewer.

```text
  ok   the review is written and the card waits for a reviewer, not the owner
  ok   the owner cannot pass the reviewer's gate
  $ codeloop approve c-006 --as reviewer
  ok   the reviewer approves and the card moves to staging
```

## Monday, later: public steps wait before they act

The merge is tagged v0.1.0. The deploy lane triggers on a tag.

```text
      15:35  created c-008 in deploy (trigger: git.tag v0.1.0)
      15:35  c-008: agent fake ran staging
      16:05  c-008: agent fake ran verify
      16:05  c-008: waiting for you
  ok   deploy did staging and verify, then stopped on entering prod
  ok   nothing was released: the prod step has not run and no agent was started for it
  ok   the build card's own live stage waits the same way
```

The founder approves both prod gates. The deploy card releases and smoke-tests. The build card goes live, and because the build lane has `on_done: { start: market }`, a market card starts on its own.

```text
      18:35  c-006: done
      19:05  c-009: agent fake ran brief
      19:35  c-009: agent fake ran draft
      19:35  c-009: waiting for you
  ok   a market card started by itself when it finished; nobody typed a command
  ok   the agent wrote the brief and the launch post; the post waits at the copy gate
```

## Tuesday: a post rejected once

```text
  $ cat marketing/c-009/blog.md
      Export is here.
      claim: any list, exported in one click
  $ codeloop reject c-009 "No number behind the claim: cite the measured export time."
      c-009 rejected at draft; note recorded
      08:00  c-009: agent fake ran draft
      08:00  c-009: waiting for you
  $ cat marketing/c-009/blog.md
      Export is here.
      claim: any list, exported in one click
      proof: 214 rows exported in 0.4 seconds in our test run
```

The redo got the note in its brief. The founder approves the copy gate, the card enters publish and stops again, because publish is a public step. A second approval lets it post.

```text
  ok   publishing is a public step: the card entered it and waits before anything is posted
  ok   nothing is published yet
  ok   published, measured, done
  ok   the published URL is recorded
```

## Friday: the growth review

The analyze lane runs at 09:00. It pulls the numbers, compares them, and waits for the founder's verdicts. After approval it writes findings, and the findings open exactly one plan card.

```text
  ok   analyze pulled the numbers and compared them, and waits for the founder's verdicts
  ok   the findings opened exactly one plan card, linked to the analyze card that produced them
  ok   the plan lane has already taken it to the backlog gate
```

## Friday afternoon: the lane changes

A second launch post has the same fault as Tuesday's. Two more rejections make three at the market lane's draft gate on version 1.

```text
  $ codeloop reject c-014 "Lead with the customer, not the feature."
  ok   one more rejection is not enough for a proposal
  $ codeloop reject c-014 "No number behind the claim, again."

Three rejections at market/draft on lane version 1. codeloop proposes a change to the lane.
  $ codeloop lane propose
        proposed .codeloop/proposals/market-draft-1
  ok   the proposal cites both cards and all three notes, and carries them into the stage as notes
```

The founder tightens the check in the proposal and adds a fixture that must fail. `promote` is refused until the eval is green.

```text
  $ codeloop lane eval market-draft-1
        ok   draft / claim-without-proof: expected fail, got fail
        ok   draft / claim-with-proof: expected pass, got pass
        ok   replay c-009 / draft
        eval green for market-draft-1
  ok   an agent cannot promote a lane change
  $ codeloop lane promote market-draft-1
  ok   the market lane is at version 2 and version 1 is kept
      17:05  c-014: agent fake ran draft
  ok   the agent's next brief carried the lane's notes, and the post now passes the stricter check
```

## Friday, end of the week

```text
  $ codeloop inbox
      9 shipped this week, 4 waiting on you, oldest 4 days
  $ codeloop stats
      all cards
        cards 14, done 9
        human turns per card   1.5
        unattended span        13.42h
        cycle time             6.48h
        rework (rejects/approvals) 0.23
        stuck rate             0%
        first pass at market/copy      0%
  $ codeloop stats --lane market --compare v1 v2
      market v1
        cards 2, done 1
        human turns per card   3.5
        rework (rejects/approvals) 1
        first pass at market/copy      0%
```

```text
SUMMARY
  cards: 14 (9 done)
  human approvals: 15 (13 gates, 1 proposal promoted, 1 lane change)
  human rejections: 4
  agent runs: 49
  lane versions: analyze v1, build v1, deploy v1, learn v1, market v2, plan v1, scan v1, triage v1
  ok   the approvals and rejections on the cards are exactly the ones the founder typed

DEMO PASS: 75 checks passed, 0 failed
```

Fifteen approvals and four rejections were the founder's whole week. Forty-nine agent runs did the rest.

## Run it yourself

```sh
git clone https://github.com/sixfactors/codeloop
cd codeloop && npm install && npm run build
bash scripts/demo-founder-week.sh
```

The cloud steps need a local Protobox and are skipped when none is running.
