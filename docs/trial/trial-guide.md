# Trial guide: 20 minutes on your own repo

Status: current for the tarball built from main on 2026-10-08. Every output below is pasted from a run on that day in a stand-in repo (`acme-app`: a `package.json` with a `test` script and a `.github/workflows/ci.yml`). If what you see differs, that is a finding; send it.

## 1. Install (2 minutes)

Node 20 or newer. The npm package is older than this guide, so install the tarball you were sent:

```sh
npm install -g ./protoboxai-codeloop-0.3.0.tgz
codeloop --version
```

```text
0.3.0
```

## 2. Init on your repo (2 minutes)

```sh
cd your-repo
codeloop init --tools claude
```

It writes `.codeloop/` (eight lanes, config, knowledge files, the board store) and ten command files under `.claude/commands/`. If that folder already has your own commands in it, `init` leaves it alone and says `pass --yes to write into it`; with `--yes` a file you already have is kept. Your `CLAUDE.md`, workflows and `package.json` are not touched. `scripts.lint` and `scripts.build` from `package.json` become `quality_checks` in `.codeloop/config.yaml`.

A `package.json` without a `tsconfig.json` is detected as "Generic project"; `--starter node-typescript` picks the Node starter. The build stage runs `npm test` from `.codeloop/lanes/build.yaml` either way; change that line if your tests run another way.

## 3. One card through a gate on the board (8 minutes)

```sh
codeloop serve --owner --open
```

```text
  Codeloop board: http://127.0.0.1:4040/?token=...
  The token in that URL is needed for every change. Anyone who has the URL can make them.
  Approve and Reject are enabled (--owner)
```

On the Cards view, press **New card**. Title it by what a user can do (`Download every invoice as one CSV`), fill persona, "I can", "so that", size S, and create it. A title like `ACME-412: add CSV export` is refused inline; the CLI's `--force` lets it through if you need the ticket id kept.

The card starts at research. The research check wants three `- source:` lines and a `verdict:` line in `specs/001-<slug>/research.md`; the mock stage wants `screens: none` in `spec.md` when there is nothing to draw; the spec stage wants the story fields, one `- US1 Given ..., when ..., then ...` line and two tagged tasks in `tasks.md`. In a Claude Code session, `/design` and `/plan` write those. By hand, the three files take five minutes. Then, from the terminal:

```sh
codeloop next c-001
codeloop next c-001
codeloop next c-001
```

```text
c-001 moved to mock
Next: run the /design skill, then `codeloop next c-001`.
c-001 moved to spec
Next: run the /plan skill to write specs/001-download-every-invoice-as-one-csv/tasks.md, then `codeloop next c-001`.
c-001 is waiting for you at spec (gate spec, owner approves)
Next: read specs/001-download-every-invoice-as-one-csv/tasks.md, then `codeloop approve c-001`, or `codeloop reject c-001 "<what to change>"`.
```

Now the board: open **Inbox** in the left nav. The card is under its priority band with a **Review** button. Review opens the card; the Gate panel says Waiting on owner, Gate spec, with a note box and **Approve** / **Reject**. Press Reject with a note first, then Approve. Back in the terminal:

```sh
codeloop card show c-001
```

The event list ends with the rejection note, the approval and `advance spec: to build`. That is the proof the gate is real: the agent cannot press that button. If the card does not move, or the Inbox still says "1 waiting" after you approved, that is a finding.

## 4. One wiki page (2 minutes)

```sh
codeloop wiki capture --title "Node test needs the file path, not the folder" --scope "test/**" --body "node --test test/ fails with MODULE_NOT_FOUND on Node 26; name the file."
codeloop wiki list
```

```text
  warning  freq 1   Node test needs the file path, not the folder  .codeloop/wiki/gotchas/node-test-needs-the-file-path-not-the-fo.md
```

The board's **Wiki** page lists it; **New page** there opens a dialog that asks for the one thing the reader can now do. Capturing the same title again raises `freq`; at 3 the page becomes critical and `codeloop check gotchas` blocks matching files until it is acknowledged.

## 5. One question answered (2 minutes)

An agent asks the owner through the card; you answer from the inbox or the board.

```sh
codeloop ask c-001 "Should the CSV include voided invoices?" --recommended "No, only issued ones" --as agent
codeloop inbox
```

```text
  Q1 Should the CSV include voided invoices?  (recommended: No, only issued ones)
Next: the owner answers with `codeloop answer c-001 <n> "<text>"` or `--accept`; the questions are in specs/001-download-every-invoice-as-one-csv/interview.md.
0 shipped this week, 0 waiting on you

Waiting for you (0)
Questions for you (1)
  c-001  Download every invoice as one CSV: 1 open, first: Should the CSV include voided invoices?
        codeloop answer c-001 <n> "<text>"   or   codeloop answer c-001 <n> --accept
Shipped (0)
```

On the board's Inbox page the question is under **Questions to answer** with Accept and Answer. Accept it there, or:

```sh
codeloop answer c-001 1 --accept
```

```text
  Q1 answered: No, only issued ones
```

## 6. Send feedback (2 minutes)

One GitHub issue per thing at <https://github.com/sixfactors/codeloop/issues>: the command or the screen, what you expected, what you got. Paste the terminal output; it is already normalised for us. Tell us the three numbers we measure: minutes from install to the first approved gate, the first moment you had to leave the docs, and whether anything moved past a gate without you.

## Known rough edges

Taken from the [Planned](https://codeloop.protobox.ai/docs/planned) page and the first trial. None of these needs reporting again.

- A one-line fix goes through every stage of the build lane. Size-adaptive lanes are planned.
- The verify stage needs a `usecases/<nnn>/*.yaml` file per acceptance line; the Start docs stop before it. The minimal file is in [You already have a project](https://codeloop.protobox.ai/docs/start/already-have-a-project).
- No Linear, Jira or GitHub Issues importer; `import` reads Spec Kit and BMAD folders. Ticket-style titles need `--force`.
- `init --ci github` writes its own workflows next to yours and does not read yours; its PR workflow fails commits with no `Feature:` trailer, which an open branch will not have.
- When a build card is done, the engine starts a market-lane card for it. Turning that off is two lines in the lane files; the page above shows them.
- Stack detection reads `tsconfig.json`, not `package.json`, so a plain Node repo comes out as "Generic project".
- `codeloop status` reads port 4040, so it reports no server when you use the board on another port.
- Sub-command help (`codeloop card new --help`) prints the top-level help.
- Local roles are not authenticated; `gate check` says so. A hosted board with roles is planned.
- Cost per card is not reported.
