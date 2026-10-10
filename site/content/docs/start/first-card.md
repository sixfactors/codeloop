---
title: Your first card
description: Start a card in the build lane, let the check fail, pass it, answer the interview, and reach the first gate.
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
Next: run the /research skill to write specs/001-export-invoices-as-csv/research.md, then `codeloop next c-001`.
```

Every command ends with a `Next:` line. It names the skill to run, the file to write and the command that moves the card on.

The title must say what the user can now do, and the story needs all three parts. `start` refuses a title with a flag, a path or a code term in it, and a story with no `so that`. The [story standard](/docs/reference/story-standard) has the full check.

The board does the same thing: `codeloop serve`, then the New story button on the Cards view opens a dialog with the title, persona, "I can", "so that", size and feature fields, and shows the same refusal inline when the title names a mechanism.

## Read the card

```sh
codeloop card show c-001
```

```text
  c-001  build    research  Export invoices as CSV
  As a founder, I can export every invoice as one CSV, so that I can hand the file to my accountant.
  size S
  skill:  research
  output: specs/001-export-invoices-as-csv/research.md
  check:  codeloop check research c-001 --min-sources 3

  2026-10-09T20:36:54.098Z  agent    create research
  2026-10-09T20:36:54.101Z  agent    spec research: specs/001-export-invoices-as-csv
Next: run the /research skill to write specs/001-export-invoices-as-csv/research.md, then `codeloop next c-001`.
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
Next: specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`). The /research skill produces specs/001-export-invoices-as-csv/research.md. Then `codeloop next c-001`.
```

The failure is counted. After the lane's `retries` (three in every shipped lane) the card parks as stuck and shows up in the inbox for you.

## Do the stage

In a host session, run the `/research` skill. Or hand the whole thing to an agent with `codeloop run --agent`; [Cloud and hosting](/docs/concepts/cloud-and-hosting) covers that. For a first run, write the research file by hand: three `- source:` lines and a `verdict:` line satisfy the check.

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
c-001 moved to interview
Next: run the /interview skill to write specs/001-export-invoices-as-csv/interview.md, then `codeloop next c-001`.
```

## Answer the interview

The interview stage is where the agent asks before it builds. Its check wants at least three questions on the card, each with an answer. The `/interview` skill writes the questions; by hand, a markdown file of `## Q<n>` blocks does the same, and `ask --file` puts them on the card. A `recommended:` line under each question is the answer the agent would take if you had none.

```sh
cat > specs/001-export-invoices-as-csv/questions.md <<'EOF'
## Q1 Which invoices go in the file: all of them, or one quarter at a time?
recommended: One quarter at a time; the accountant works per quarter.

## Q2 Which columns does the accountant need?
recommended: Number, date, customer, net, tax, gross, status.

## Q3 Where does the file appear?
recommended: A download from the invoices list; no email, no scheduled export.
EOF
codeloop ask c-001 --file specs/001-export-invoices-as-csv/questions.md
```

```text
  Q1 Which invoices go in the file: all of them, or one quarter at a time?  (recommended: One quarter at a time; the accountant works per quarter.)
  Q2 Which columns does the accountant need?  (recommended: Number, date, customer, net, tax, gross, status.)
  Q3 Where does the file appear?  (recommended: A download from the invoices list; no email, no scheduled export.)
Next: the owner answers with `codeloop answer c-001 <n> "<text>"` or `--accept`; the questions are in specs/001-export-invoices-as-csv/interview.md.
```

Open questions show in the inbox under "Questions for you". Answer each one by number, with your own text or by accepting the recommendation. Then `next` runs the check and moves the card.

```sh
codeloop answer c-001 1 --accept
codeloop answer c-001 2 "Number, date, customer, gross, status"
codeloop answer c-001 3 --accept
codeloop next c-001
```

```text
  Q1 answered: One quarter at a time; the accountant works per quarter.
  Q2 answered: Number, date, customer, gross, status
  Q3 answered: A download from the invoices list; no email, no scheduled export.
c-001 moved to mock
Next: run the /mock skill, then `codeloop next c-001`.
```

The answers live in `interview.md` next to the research, and the spec stage's brief carries them, so the agent that writes the spec reads what you decided.

## Skip the mock, write the spec

A card with nothing to draw writes `screens: none` in its `spec.md` and the mock stage passes. Fill in the story fields, one acceptance line and two tagged tasks in `tasks.md`:

```text
- [ ] T001 [US1] [api] Write src/export.ts that writes invoices.csv
- [ ] T002 [US1] [test] Add test/export.test.ts covering ten rows
```

`spec check` refuses the template as shipped: the `Story:` line needs all three parts, `size:` must be one of S, M or L, `metric:` names the one number this card moves, `done_when:` is a command or a screen, and every acceptance line reads given, when, then. [The story standard](/docs/reference/story-standard) lists what it enforces.

```sh
codeloop next c-001
codeloop next c-001
```

```text
c-001 moved to spec
Next: run the /spec skill to write specs/001-export-invoices-as-csv/tasks.md, then `codeloop next c-001`.
c-001 is waiting for you at spec (gate spec, owner approves)
Next: read specs/001-export-invoices-as-csv/tasks.md, then `codeloop approve c-001`, or `codeloop reject c-001 "<what to change>"`.
```

`spec check` passed, and the spec stage has a gate. The card stops there until the owner reads the tasks and approves. That is the subject of [Approve a gate](/docs/start/approve-a-gate). First, [the inbox](/docs/start/inbox), which is where you would have found out.

## What the engine did

Four commands moved the card. Each move was a check command exiting 0, recorded as an event:

```text
  2026-10-09T20:36:54.358Z  engine   fail research: specs/001-export-invoices-as-csv/research.md cites 0 sources, needs 3 (`- source: <url> — <note>`)
  2026-10-09T20:36:54.817Z  engine   advance research: to interview
  2026-10-09T20:36:56.400Z  engine   advance interview: to mock
  2026-10-09T20:36:56.865Z  engine   advance mock: to spec
  2026-10-09T20:36:57.317Z  engine   park spec: gate spec (after the check passed)
```

No prompt decided any of it. [Stages and checks](/docs/concepts/stages-and-checks) explains why that matters.
