# codeloop

A lane engine with a board, for AI coding agents.

A lane is a YAML file in your repo listing stages. Each stage names the skill an agent runs, the file it must write, and a command that decides whether the stage is done. A card is one story that moves through a lane. Where you want to decide, a stage carries a gate: the card stops, appears in your inbox and on the board, and moves only when you approve. An agent process cannot approve a gate; the engine refuses it. The build lane that ships with it goes research, mock, spec, build, verify, review, staging, live, with gates at spec, local, pr and prod. Other lanes cover deploy, launch copy, weekly planning, triage, competitor scan and a growth review. Everything is files in your repo: `.codeloop/`, `specs/`, `usecases/`, `evidence/`. Docs: <https://codeloop.protobox.ai/docs>.

## Run it

Node 20 or newer, a git repository, and Claude Code, Cursor or Codex.

```sh
npm install -g @protoboxai/codeloop
cd your-project
codeloop init --tools claude
codeloop serve --owner --open
```

`init` writes `.codeloop/` (eight lanes, config, knowledge files, the board store) and ten skill files under `.claude/commands/`. A `.claude/commands/` folder that already has files in it is left alone unless you pass `--yes`, and then a file you already have is kept. `serve --owner` prints a URL with a token and opens the board; Approve and Reject on the board work only with `--owner`. The first card comes from the board's New card button or from the terminal:

```sh
codeloop start "Download every invoice as one CSV" \
  --persona dev --can "download every invoice as one CSV" --so "I stop exporting by hand" --size S
```

```text
created c-002 in build at stage research (specs/002-download-every-invoice-as-one-csv/)
Next: run the /design skill to write specs/002-download-every-invoice-as-one-csv/research.md, then `codeloop next c-002`.
```

Every command ends with a `Next:` line naming the skill, the file and the command that moves the card. Already have a repo with CI, tickets and your own slash commands? Read [You already have a project](https://codeloop.protobox.ai/docs/start/already-have-a-project).

## The three things you will do most

**Start a card and move it.** `codeloop start "<title>"` makes the card and its spec folder. `codeloop next <id>` runs the current stage's check and moves the card when the check exits 0; a failing check is counted and the card parks as stuck after three. The title must say what the user can now do, and the story needs a `--so`. `codeloop brief <id>` prints what an agent is given for the stage.

**Answer the inbox.** `codeloop inbox` lists what needs you: cards at gates, proposals, open questions, what shipped, and numbers per lane. The board's Inbox page shows the same list grouped by priority band.

```text
1 shipped this week, 1 waiting on you, oldest today

Waiting for you (1)
  c-003  Rate-limit the invoices API: build/proposed, gate proposal
        proposed from https://linear.app/acme/issue/ACME-413; `codeloop card show c-003` has the detail
        codeloop approve c-003   puts it in the build lane   or   codeloop reject c-003 "<why not>"   drops it
Questions for you (1)
  c-001  ACME-412: add CSV export endpoint to /invoices: 1 open, first: Should the CSV include voided invoices?
        codeloop answer c-001 <n> "<text>"   or   codeloop answer c-001 <n> --accept
Shipped (1)
  c-002  build  Download every invoice as one CSV
```

An agent asks with `codeloop ask <id> "<question>" --recommended "<answer>"`; you take the recommended answer with `codeloop answer <id> 1 --accept` or type your own.

**Approve a gate.** Read the file the inbox names, then approve or reject with a note. On the board, open the card and use the Gate panel.

```sh
codeloop approve c-002 --as owner
```

```text
c-002 gate spec approved
c-002 moved to build
Next: run the /test skill, then `codeloop next c-002`.
```

`--as` is only needed outside a terminal; a person at a terminal is the owner. A gate marked `outward` (live, prod, publish) stops before the stage runs, so nothing is released until you approve. Rejecting keeps the card in its stage and puts your note in the next brief.

## What is unreleased

The npm package is 0.3.0 from 3 October 2026. It has lanes, cards, gates, `inbox` and the static board. Everything below is on `main`, unreleased, and planned for the next publish; until then it needs a clone or a tarball built from one:

- the workspace board with New card, the Inbox page, Initiatives and the card drawer
- story fields on a card (`--persona`, `--can`, `--so`, `--size`) and the story check
- `ask` and `answer`, and the questions band in the inbox
- RICE on features, P1 to P4 bands, `feature`, `epic` and `initiative` commands
- the SDK (`@protoboxai/codeloop/sdk`) the CLI and the board both call

## Working on codeloop itself

```sh
npm ci && npm --prefix ui ci
npm run build:all
node dist/index.js lane lint
npm test && bash scripts/first-user.sh
npm pack
```

`scripts/first-user.sh` installs the packed tarball into a private prefix and runs the Start pages' own commands against it. `npm pack` is how a trial tarball is made. The repo runs on its own lanes; `node dist/index.js inbox` shows its cards.

## License

MIT
