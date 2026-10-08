---
title: The inbox
description: What the inbox lists, where its numbers come from, and the stats behind them.
---

[The inbox](/docs/start/inbox) in the Start section shows how to read it. This page is about what goes in and how the numbers are computed.

## What is listed

| Section | Contents | Source |
|---|---|---|
| Waiting for you | Every card whose gate is set: parked after a check, parked before an outward stage, stuck after retries, or a proposal nobody has promoted. Oldest first. | `card.gate` on each card in `cards.json` |
| Shipped | Cards that reached the end of their lane this week. `--seen` clears the list. | Cards in the done stage |
| Numbers | One row per lane. | `codeloop stats` per lane |

A card at a gate shows the file the stage wrote, the result of the last check, and the exact commands to type. A proposal shows where it came from and what approving or rejecting does to it. A card at an outward gate says the check has not run yet, because the stage has not.

## Questions in the inbox

A stage can ask the owner up to five questions and carry on when they are answered:

```sh
codeloop ask c-006 "Which date format for the file name?" --recommended "YYYY-MM-DD"
codeloop answer c-006 1 --accept
codeloop answer c-006 1 "Quarter, as 2026-Q3"
```

`ask` records the questions on the card with a recommended answer each, or reads them from a file with `## Q1` blocks. `answer` records the answer, or accepts the recommendation. The board shows the same questions and takes answers from it.

## The numbers

All of them are computed from card events; nothing is logged separately.

| Number | How it is computed |
|---|---|
| human turns per card | Events made by an owner or reviewer, divided by cards. |
| unattended span | The longest stretch of any card's life with no human event. |
| cycle time | Mean time from a done card's creation to its last event. |
| rework | Rejections divided by approvals. Dropping a proposal is not counted as a rejection. |
| stuck rate | Cards that hit the retry limit at some stage, over all cards. |
| first pass at a gate | How often the first human decision at that gate was an approval. |

`codeloop stats` prints them for all cards, `--lane` for one lane, `--card` for one card, and `--compare v1 v2` side by side for two versions of a lane, which is how a promoted lane is judged against the one it replaced.

From the end of the [founder's week](/docs/start/founders-week):

```text
all cards
  cards 14, done 9
  human turns per card   1.5
  unattended span        13.42h
  cycle time             6.48h
  rework (rejects/approvals) 0.23
  stuck rate             0%
  first pass at triage/proposals 100%
  first pass at plan/backlog     100%
  first pass at build/spec       100%
  first pass at build/local      100%
  first pass at build/pr         100%
  first pass at build/prod       100%
  first pass at deploy/prod      100%
  first pass at market/copy      0%
  first pass at market/publish   100%
  first pass at analyze/verdicts 100%
```

The market lane's copy gate at 0% is the number that produced a lane proposal that Friday.

## The same list on a board

`codeloop serve` starts a local web board that reads the same cards and shows the same waiting list, with the card's spec, evidence, mock and questions beside it. `--owner` lets the person holding the URL approve and reject from the board. [Cloud and hosting](/docs/concepts/cloud-and-hosting) covers it.

## Over MCP

`codeloop mcp` serves the engine over stdio with the tools `inbox`, `next_up`, `get_card`, `advance`, `approve`, `reject`, `task_done`, `wiki_inject` and `wiki_capture`. The same engine and the same refusals apply. The role comes from `CODELOOP_ROLE` in the server's environment, never from a tool argument, so a client cannot approve unless the server was started as owner or reviewer. [Hosts](/docs/hosts) has the client configuration.
