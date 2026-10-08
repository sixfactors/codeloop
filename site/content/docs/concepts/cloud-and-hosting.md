---
title: Cloud and hosting
description: Everything runs from files in your repo. A board server, a cron entry and a cloud copy are each optional.
---

## The repo is the system

Cards, lanes, wiki pages, evidence and config are files under `.codeloop/`, `specs/`, `usecases/` and `evidence/`. They are committed with the code. Nothing needs a server to run: `codeloop next`, `inbox`, `approve` and `run` read and write those files, under a lock so two processes do not lose each other's writes.

Three things sit on top, and each one is optional.

## The board server

```sh
codeloop serve
codeloop serve --bg --open
codeloop serve --stop
```

A local web board on port 4040 showing the same cards, inbox, lanes, evidence, mocks and questions the CLI shows. It binds `127.0.0.1`, answers only to a localhost host name, sends no CORS headers, and needs a token printed at start-up, a JSON content type and a same-origin request for every write. There is no login.

| Flag | Use |
|---|---|
| `-p, --port <port>` | Port, default 4040. |
| `--bg`, `--stop` | Run in the background; stop it. |
| `--open` | Open the browser after starting. |
| `--owner` | Allow Approve and Reject from the board, for whoever has the URL with its token. |
| `--host <host>` | Listen on another address. Anything but the default exposes the board to the network. |

`codeloop watch` watches the project for file saves, commits, test and build results and pushes them to the board; `--with-serve` starts both.

## Unattended runs

`codeloop run` starts cards for due triggers and advances every card that is not waiting on a person. With `--agent` it first starts a headless agent on each stage whose check does not pass yet. The agent command comes from `config.yaml`:

```yaml
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 20
    max_runs_per_day: 20
  codex:
    cmd: "codex exec - < {brief}"
run:
  agent: true
```

`{brief}` becomes the shell-quoted path to the stage brief. The agent and its children are killed at `timeout_minutes`. `max_runs_per_day` caps agent starts across the project in any 24 hours. The start is written to the card as an event before the process runs, in the same compare-and-swap write that checks the cap and that no other run is on the stage. No agent starts for a card at a gate or for an unapproved outward stage.

Put the machine-only part in `.codeloop/local.yaml`. It is laid over `config.yaml` key by key, is gitignored, and is never pushed to the cloud. The [founder's week](/docs/start/founders-week) keeps its agent command there.

```sh
codeloop run --dry-run
```

```text
  c-001: would run the build check and move the card if it passes
  dry run: nothing was started (1 card not waiting for you)
```

## The schedule

```sh
codeloop schedule install --every 30m
codeloop schedule status
codeloop schedule remove
```

`install` adds one line to your crontab that runs `codeloop run --agent` in this repo and appends to `.codeloop/state/run.log`. `--print` shows the line without installing it. `--cron "<expr>"` replaces `--every`. `status` shows the entry and the end of the last run's output. The cron lanes (plan, scan, triage, analyze) fire on their own schedules the next time `run` is invoked after they are due.

## Gates in CI

`codeloop init --ci github` writes three workflows. `codeloop-pr.yml` runs `lane lint` on every pull request. `codeloop-staging.yml` runs `deploy.staging.command` from `config.yaml` and then `codeloop verify <id> --env staging` for the card. `codeloop-prod.yml` runs on a `v*` tag inside a GitHub `production` environment, so the environment's required reviewers are the human gate.

In any job, `codeloop gate check <id> --require <gate>` exits 2 unless the card has an approval for that gate. The approval event carries the role and time, and `gate check` says plainly that a local role is not authenticated. [Approve a gate](/docs/start/approve-a-gate) shows the output.

## The cloud copy

```sh
codeloop cloud connect --url <mcp url> --key <api key> --workspace-name <label>
codeloop cloud status
codeloop cloud push
codeloop cloud pull
codeloop cloud disconnect
```

`connect` saves the connection in `.codeloop/cloud.json` (gitignored) and uploads the board, wiki, `config.yaml` and lanes to a Protobox workspace. After that every codeloop command syncs. `status` shows each document as in sync, local ahead, cloud ahead or both changed:

```text
  workspace: demo http://localhost:4002/api/mcp/<workspace-id>
  board page "codeloop demo 1790958998": revision 192 (last seen here: 192)
  local cards.json: version 191, 14 cards
  in sync: yes   wiki pages: 1
  in-sync      cards.json
  in-sync      config.yaml
  in-sync      lanes/build.yaml
  in-sync      wiki/competitors/rivalsoft.md
```

`push` writes what changed here and refuses to overwrite a cloud copy that changed since it was last seen, unless `--force`. Lanes are not pushed; they change through `lane promote`, which pushes the promoted file. `pull` takes the cloud board and any document not edited locally. `disconnect` pushes pending writes, pulls everything back and removes `cloud.json`. `cloud search <query>` searches the workspace knowledge base.

Without a connection, `cloud status` says so and nothing else changes:

```text
not connected; run `codeloop cloud connect --url <mcp url> --key <api key>`
```

A hosted board for a team, with authenticated roles, is <span class="planned">planned</span>. Today the cloud copy is a mirror, and approvals are local events.
