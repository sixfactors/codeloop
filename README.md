# codeloop

A lane engine with a board, for AI coding agents.

A lane is a YAML file in your repo listing stages. Each stage names the skill an agent runs, the file it must write, and a command that decides whether the stage is done. A card is one story that moves through a lane. Where you want to decide, a stage carries a gate: the card stops, appears in your inbox and on the board, and moves only when you approve. An agent process cannot approve a gate; the engine refuses it. The build lane that ships with it goes research, interview, mock, spec, build, verify, review, staging, live, with gates at spec, local, pr and prod. Other lanes cover deploy, launch copy, weekly planning, triage, competitor scan and a growth review. Everything is files in your repo: `.codeloop/`, `specs/`, `usecases/`, `evidence/`. Docs: <https://codeloop.protobox.ai/docs>.

## Run it

Node 20 or newer, a git repository, and Claude Code, Cursor or Codex.

```sh
npm install -g @protoboxai/codeloop
cd your-project
codeloop init --tools claude
codeloop serve --open
```

`init` writes `.codeloop/` (ten lanes, config, knowledge files, the board store), ten commands under `.claude/commands/` and fifteen stage skills under `.claude/skills/<name>/`, each a `SKILL.md` with a template and a checklist. A commands folder that already has files in it is left alone unless you pass `--yes`, and then a file you already have is kept. `serve` opens the board on a local hub that serves every project you use codeloop in, at `http://127.0.0.1:4040/p/<project>/`. Approve and Reject work once you sign in (default `owner` / `codeloop`; change it before sharing the board). Lost the browser tab? `codeloop open` reopens it. `serve --standalone` runs one project on its own. The first card comes from the board's New story button or from the terminal:

```sh
codeloop start "Download every invoice as one CSV" \
  --persona dev --can "download every invoice as one CSV" --so "I stop exporting by hand" --size S
```

```text
created c-002 in build at stage research (specs/002-download-every-invoice-as-one-csv/)
Next: run the research skill to write specs/002-download-every-invoice-as-one-csv/research.md, then `codeloop next c-002`.
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
Next: run the api skill, then `codeloop next c-002`.
```

`--as` is only needed outside a terminal; a person at a terminal is the owner. A gate marked `outward` (live, prod, publish) stops before the stage runs, so nothing is released until you approve. Rejecting keeps the card in its stage and puts your note in the next brief.

## What is unreleased

The npm package is 0.4.3. The trunk is 0.5.0 and goes out with the next publish; until then it needs a clone or a tarball built from one. See `CHANGELOG.md` for the full list.

- one main tree by default: builders work in the checked-out tree under file leases, two at a time, and failed gates are fixed forward (`orch.isolation`, `orch.max_builders`)
- everything codeloop writes lives under `.codeloop/` (`codeloop store move --layout dotfolder` moves an older project)
- `codeloop off [--for 2h]` and `codeloop on` pause hooks and the orchestrator in a repo
- `codeloop orch run <card> [--builder agent|session:<x>|person]` runs a story's stages with one budget per run, stop reasons, an agent ledger, a repo lock and a memory ceiling
- the story page shows an activity stream, a journey stepper, one state per card and the rubric rows beside Approve; Home shows agent tiles and "stalled N min"
- questions carry options and `codeloop answer --accept-all` takes every recommendation
- session start prints your inbox, `codeloop doctor` runs the monitor tick, and `codeloop ps` lists what codeloop started
- a resident hook process cuts `guard session` from about 3 s to 0.3 s

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
