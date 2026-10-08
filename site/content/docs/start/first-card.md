---
title: Your first card
description: Start a card in the build lane, let the check fail, pass it, and reach the first gate.
---

## Start a card

A card is one shippable slice of work with a story. `start` creates it in the first stage of a lane, the build lane unless you say otherwise, and makes its spec folder.

```sh
codeloop start "Export invoices as CSV" \
  --persona founder \
  --can "export every invoice as one CSV" \
  --so "I can hand the file to my accountant" \
  --size S
```

```text
created c-001 in build at stage research (specs/001-export-invoices-as-csv/)
Next: run the /design skill to write specs/001-export-invoices-as-csv/research.md, then `codeloop next c-001`.
```

Every command ends with a `Next:` line. It names the skill to run, the file to write and the command that moves the card on.

The title must say what the user can now do, and the story needs all three parts. `start` refuses a title with a flag, a path or a code term in it, and a story with no `so that`. The [story standard](/docs/reference/story-standard) has the full check.

The board does the same thing: `codeloop serve`, then the New card button on the Cards view opens a dialog with the title, persona, "I can", "so that", size and feature fields, and shows the same refusal inline when the title names a mechanism.

## Read the card

```sh
codeloop card show c-001
```

```text
  c-001  build    research  Export invoices as CSV
  As a founder, I can export every invoice as one CSV, so that I can hand the file to my accountant.
  size S
  skill:  design
  output: specs/001-export-invoices-as-csv/research.md
  check:  codeloop check research c-001 --min-sources 3

  2026-10-07T20:02:52.942Z  agent    create research
  2026-10-07T20:02:52.947Z  agent    spec research: specs/001-export-invoices-as-csv
Next: run the /design skill to write specs/001-export-invoices-as-csv/research.md, then `codeloop next c-001`.
```

The card knows its stage, the skill for that stage, the file the stage must produce and the command that judges it. Every action on a card is appended to its event list.

## Let the check fail

`next` runs the current stage's check. The research template is empty, so it fails.

```sh
codeloop next c-001
```

```text
specs/001-export-invoices-as-csv/research.md has no line starting with "verdict:"
specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`)
c-001 failed the research check (1 so far)
Next: specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`). The /design skill produces specs/001-export-invoices-as-csv/research.md. Then `codeloop next c-001`.
```

The failure is counted. After the lane's `retries` (three in every shipped lane) the card parks as stuck and shows up in the inbox for you.

## Do the stage

In a host session, run the `/design` skill. Or hand the whole thing to an agent with `codeloop run --agent`; [Cloud and hosting](/docs/concepts/cloud-and-hosting) covers that. For a first run, write the research file by hand: three `- source:` lines and a `verdict:` line satisfy the check.

```sh
cat >> specs/001-export-invoices-as-csv/research.md <<'EOF'
- source: https://example.com/a — accountants ask for one file per quarter
- source: https://example.com/b — two rivals ship CSV export behind a button
- source: https://example.com/c — our support inbox: four requests this month

verdict: build
EOF
codeloop next c-001
```

```text
c-001 moved to mock
Next: run the /design skill, then `codeloop next c-001`.
```

## Skip the mock, write the spec

A card with nothing to draw writes `screens: none` in its `spec.md` and the mock stage passes. Fill in the story fields, one acceptance line and two tagged tasks in `tasks.md`:

```text
- [ ] T001 [US1] [api] Write src/export.ts that writes invoices.csv
- [ ] T002 [US1] [test] Add test/export.test.ts covering ten rows
```

```sh
codeloop next c-001
codeloop next c-001
```

```text
c-001 moved to spec
Next: run the /plan skill to write specs/001-export-invoices-as-csv/tasks.md, then `codeloop next c-001`.
c-001 is waiting for you at spec (gate spec, owner approves)
Next: read specs/001-export-invoices-as-csv/tasks.md, then `codeloop approve c-001`, or `codeloop reject c-001 "<what to change>"`.
```

`spec check` passed, and the spec stage has a gate. The card stops there until the owner reads the tasks and approves. That is the subject of [Approve a gate](/docs/start/approve-a-gate). First, [the inbox](/docs/start/inbox), which is where you would have found out.

## What the engine did

Three commands moved the card. Each move was a check command exiting 0, recorded as an event:

```text
  2026-10-07T20:02:53.330Z  engine   fail research: specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`)
  2026-10-07T20:03:14.870Z  engine   advance research: to mock
  2026-10-07T20:03:15.275Z  engine   advance mock: to spec
  2026-10-07T20:03:15.717Z  engine   park spec: gate spec (after the check passed)
```

No prompt decided any of it. [Stages and checks](/docs/concepts/stages-and-checks) explains why that matters.
