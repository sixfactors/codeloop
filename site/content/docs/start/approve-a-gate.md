---
title: Approve a gate
description: Approve, reject with a note, and the three roles. What an agent cannot do.
---

## The card is waiting

The card from [Your first card](/docs/start/first-card) is parked at the build lane's spec gate. The inbox says to read `tasks.md` and then choose.

## Reject with a note

A rejection keeps the card in its stage and records the note. The next run of that stage gets the note in its brief.

```sh
codeloop reject c-001 "Name the file after the quarter, not the date" --as owner
```

```text
c-001 rejected at spec; note recorded
Next: redo with the /plan skill to write specs/001-export-invoices-as-csv/tasks.md, then `codeloop next c-001`.
```

After the redo, `codeloop next c-001` runs the check again and the card parks at the same gate.

## Approve

```sh
codeloop approve c-001 --as owner
```

```text
c-001 gate spec approved
c-001 moved to build
Next: run the /test skill, then `codeloop next c-001`.
```

An approval is an event on the card with the gate name, the role and the time. `approve` then advances the card once, so you do not need a separate `next`.

The same two buttons are on the board: open the card from the Inbox page or the Cards view and the Gate panel shows who it is waiting on, the gate name, a note box, Approve and Reject. They work only when the server was started with `codeloop serve --owner`.

## Roles

| Role | Who | Can approve |
|---|---|---|
| owner | The founder or whoever owns the product | Gates with `approver: owner`: spec, local, prod, copy, publish, backlog, proposals, verdicts, rule |
| reviewer | Whoever reviews pull requests | Gates with `approver: reviewer`: the build lane's pr gate |
| agent | A headless agent run | Nothing |

The role comes from `--as`. Without it, a person at a terminal is the owner and anything else is an agent. An agent process started by `codeloop run --agent` has `CODELOOP_AGENT_RUN` set and cannot claim another role.

Local roles are not authenticated. `gate check` says so when CI asks it who approved:

```sh
codeloop gate check c-001 --require spec
```

```text
  gate spec approved by owner at 2026-10-07T20:03:25.797Z
  warning: this approval is a local event. Local roles are not authenticated, so it shows that someone ran the approve command, not who.
```

And for a gate nobody approved:

```sh
codeloop gate check c-001 --require local
```

```text
refused: card c-001 has no approval for gate "local"
```

## What an agent cannot do

The same two commands, run without a terminal and without `--as`, are refused:

```text
refused: gate "spec" needs owner; agent cannot approve it
refused: gate "spec" needs owner; agent cannot reject it
```

The owner cannot pass the reviewer's gate either. In the [founder's week](/docs/start/founders-week) the review stage waits until `codeloop approve c-006 --as reviewer`.

## Gates before a public step

Most gates come after a stage's check passes: the work is done, you look at it, you let the card move on. A gate marked `outward: true` comes before the stage runs. The build lane's live stage, the deploy lane's prod stage and the market lane's publish stage are all outward. The card enters the stage and stops. No agent is started for it. Nothing is released or posted until you approve, and then the stage runs.

From the week, a launch post reaching its publish step:

```text
c-009 gate copy approved
c-009 is waiting for you at publish (gate publish, owner approves)
Next: publish is a public step and has not run. `codeloop approve c-009` to let it run, or `codeloop reject c-009 "<what to change>"`.
```

## Three rejections

Rejections at one gate are counted per lane version. At three, `codeloop lane propose` writes a proposal that cites the cards and the notes. [Wiki and learning](/docs/concepts/wiki-and-learning) has the whole loop.

Next: [A founder's week](/docs/start/founders-week), the saved run that shows all of this over five days.
