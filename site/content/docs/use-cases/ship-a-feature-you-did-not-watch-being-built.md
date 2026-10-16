---
title: Ship a feature you did not watch being built
description: Hand a feature to an agent and still know it was researched, specified, tested and approved, with the output of each step.
---

## The problem

You ask an agent for a feature, and an hour later it says it is done. You were not watching, so you cannot tell whether it researched anything, asked the questions you would have asked, or wrote a test that fails without the change.

## Without codeloop

You read the whole diff after the fact and run the tests yourself, if you remember which ones. You find out the agent never asked which invoices the export should include when the accountant complains. Nothing records what you decided, so the next session starts from nothing. The only evidence that the work is finished is the agent saying so.

## With codeloop

A card is one shippable slice of work with a story. It moves through the stages of the build lane, a file that lists the stages this kind of work goes through: research, interview, mock, spec, data-model, build, verify, review, staging and live. A stage is done only when its check, a command codeloop runs and not the agent, exits 0. At a gate the card stops until a person decides. The build lane has four: spec and local (you approve), pr (a reviewer approves) and prod (you approve before anything goes live).

You start a card with the story in three parts:

```sh
codeloop start "Export invoices as CSV" \
  --persona founder \
  --can "export every invoice as one CSV" \
  --so "I can hand the file to my accountant" \
  --size S
```

```text
created c-001 in build at stage research (specs/001-export-invoices-as-csv/)
Next: run the research skill to write specs/001-export-invoices-as-csv/research.md, then `codeloop next c-001`.
```

Every command ends with a `Next:` line that names the skill to run, the file to write and the command that moves the card on. `start` refuses a title that names a flag, a path or a code term, and a story with no "so that".

When you run `codeloop next c-001` before the research is written, the check fails and says why:

```text
specs/001-export-invoices-as-csv/research.md has no line starting with "verdict:"
specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url or path> - <note>`)
c-001 failed the research check (1 so far)
```

The failure is counted. After the lane's `retries` (three in every shipped lane) the card parks as stuck and appears in your inbox. When the research cites three sources and ends with a `verdict:` line, the card moves to the interview stage.

The interview is where the agent asks before it builds. Its check wants at least three questions on the card, each answered. Each question carries a `recommended:` answer, which is what the agent would take if you gave none:

```text
  Q1 Which invoices go in the file: all of them, or one quarter at a time?  (recommended: One quarter at a time; the accountant works per quarter.)
  Q2 Which columns does the accountant need?  (recommended: Number, date, customer, net, tax, gross, status.)
  Q3 Where does the file appear?  (recommended: A download from the invoices list; no email, no scheduled export.)
```

```sh
codeloop answer c-001 1 --accept
codeloop answer c-001 2 "Number, date, customer, gross, status"
codeloop answer c-001 3 --accept
codeloop next c-001
```

The answers are stored with the research, and the spec stage's brief (the text an agent is handed for a stage) carries them, so the agent that writes the spec reads what you decided. A card with nothing to draw writes `screens: none` in its spec and the mock stage passes. At the spec stage, `spec check` refuses a spec with no filled story line, no size, no metric, no `done_when:` or an acceptance line that does not read given, when, then. When it passes, the card stops at the first gate:

```text
c-001 is waiting for you at spec (gate spec, owner approves)
Next: read specs/001-export-invoices-as-csv/tasks.md, then `codeloop approve c-001`, or `codeloop reject c-001 "<what to change>"`.
```

Each move was a check command exiting 0, recorded as an event on the card:

```text
  engine   fail research: specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url or path> - <note>`)
  engine   advance research: to interview
  engine   advance interview: to mock
  engine   advance mock: to spec
  engine   park spec: gate spec (after the check passed)
```

After you approve the spec, the build stage ticks off the tasks and runs the tests. The verify stage runs one use case per acceptance line and writes evidence with the commit SHA:

```text
# Verify c-006

result: pass
sha: e4fcafedc23dc67e42694af96e22a76248582eb8
env: local

| Use case | Accepts | Layers |
|---|---|---|
| uc-1 | US1 | cli pass |
```

You approve the local gate, the agent writes the review, and the card waits for a reviewer. Staging runs, and the live stage is an outward gate: the card parks before the stage runs, so nothing is released until you approve.

## What you still do

- Approve the spec gate after reading the tasks (owner).
- Answer the interview questions, or accept the recommendations (owner).
- Approve the local gate after reading the verify evidence (owner).
- Approve the pr gate (reviewer).
- Approve the prod gate before anything goes live (owner).

An agent cannot approve any of these. The engine refuses `approve` from an agent process.

## Not yet

In the published 0.4.3 every build card goes through every stage, including a trivial fix. On main, a card sized trivial or S enters at build and the skipped stages are recorded; that ships in 0.5.0. A stage that proposes the size from the code is still planned.

Next: the [build lane, stage by stage](/docs/reference/lanes), and [how to approve a gate](/docs/start/approve-a-gate).
