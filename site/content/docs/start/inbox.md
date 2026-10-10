---
title: The inbox
description: One command tells you what needs a decision, what shipped, and how each lane is doing.
---

## Run it

```sh
codeloop inbox
```

With the card from [Your first card](/docs/start/first-card) parked at its spec gate:

```text
0 shipped this week, 1 waiting on you, oldest today

Waiting for you (1)
  c-001  Export invoices as CSV: build/spec, gate spec
        read: specs/001-export-invoices-as-csv/tasks.md   last check: passed
        codeloop approve c-001   or   codeloop reject c-001 "<what to change>"
Shipped (0)
Numbers
  analyze    active 0  waiting 0  done 0  human turns/card -  first pass -
  build      active 0  waiting 1  done 0  human turns/card 3.0  first pass -
  deploy     active 0  waiting 0  done 0  human turns/card -  first pass -
  learn      active 0  waiting 0  done 0  human turns/card -  first pass -
  market     active 0  waiting 0  done 0  human turns/card -  first pass -
  plan       active 0  waiting 0  done 0  human turns/card -  first pass -
  scan       active 0  waiting 0  done 0  human turns/card -  first pass -
  shape      active 0  waiting 0  done 0  human turns/card -  first pass -
  triage     active 0  waiting 0  done 0  human turns/card -  first pass -
```

## How to read it

The first line is the summary: shipped this week, waiting on you, and how old the oldest wait is.

**Waiting for you** lists every card parked at a gate, oldest first. Each entry says the lane and stage, the gate name, the file to read, whether the last check passed, and the two commands you can type. When a card has a mock, its path is on the next line. When the gate is before a public step, the entry says the check has not run yet and approving is what lets it run.

**Questions for you** appears when an agent has asked something on a card and the card waits for the answer. Each entry names the card, how many questions are open, the first one, and the two forms of `codeloop answer`. [Your first card](/docs/start/first-card) shows the three answers that gave the build row its 3.0 human turns.

**Shipped** lists the cards that reached the end of their lane this week.

**Numbers** is one row per lane: cards active, cards waiting on a person, cards done, the average number of human turns a card took, and how often the first attempt at each gate was approved. A dash means no data yet.

## A fuller Monday

From the [founder's week](/docs/start/founders-week), after a weekend of cron lanes:

```text
1 shipped this week, 4 waiting on you, oldest today

Waiting for you (4)
  c-001  triage 2026-10-04: triage/file, gate proposals
        read: triage/c-001/proposals.md   last check: passed
        codeloop approve c-001   or   codeloop reject c-001 "<what to change>"
  c-002  Dark theme for the dashboard: plan/proposed, gate proposal
        proposed from issues/12; `codeloop card show c-002` has the detail
        codeloop approve c-002   puts it in the plan lane   or   codeloop reject c-002 "<why not>"   drops it
  c-003  Export invoices as CSV: plan/proposed, gate proposal
        proposed from issues/15; `codeloop card show c-003` has the detail
        codeloop approve c-003   puts it in the plan lane   or   codeloop reject c-003 "<why not>"   drops it
  c-005  Rivalsoft shipped: Bulk CSV export: plan/proposed, gate proposal
        proposed from http://127.0.0.1:51068/changelog; `codeloop card show c-005` has the detail
        codeloop approve c-005   puts it in the plan lane   or   codeloop reject c-005   "<why not>"   drops it
Shipped (1)
  c-004  scan  scan 2026-10-05
```

Two kinds of entry appear here. `c-001` is a card at a gate inside a lane. `c-002`, `c-003` and `c-005` are proposals: cards that triage and scan wrote and nothing has started. Approving a proposal puts it in the plan lane. Rejecting drops it, and the reason is kept so the same issue is not proposed twice.

## Options

| Flag | Use |
|---|---|
| `--json` | The same data as JSON, for a script or a board. |
| `--seen` | Mark everything shipped so far as seen, so the next inbox starts clean. |

The board's Inbox page (`codeloop serve`, then Inbox in the left nav) shows the same list, with the gates grouped by priority band and a Review button on each row that opens the card; [Initiatives, epics, features and priority](/docs/concepts/initiatives-epics-features-and-priority) explains the bands. [Cloud and hosting](/docs/concepts/cloud-and-hosting) covers the server.

Next: [Approve a gate](/docs/start/approve-a-gate).
