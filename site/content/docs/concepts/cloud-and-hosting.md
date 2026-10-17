---
title: Cloud and hosting
description: Everything runs from files in your repo. A board server, a cron entry and a cloud copy are each optional.
---

Agent work that lives on one laptop cannot be seen, scheduled or approved by anyone else, but a tool that needs a server before it runs is hard to adopt.

codeloop runs entirely from files in your repo. A board server, a cron entry and a cloud copy can each be added when you want them, and each is optional.

## The repo is the system

Cards, lanes, wiki pages, evidence and config are files under `.codeloop/`, `specs/`, `usecases/` and `evidence/`. They are committed with the code. Nothing needs a server to run: `codeloop next`, `inbox`, `approve` and `run` read and write those files, under a lock so two processes do not lose each other's writes.

Three things sit on top, and each one is optional.

## The board server

```sh
codeloop serve          # joins the hub and opens this project's board
codeloop open           # reopens it, from any folder in the project
codeloop hub --stop     # stops the hub
```

One local hub serves every project you have run `codeloop serve` or `codeloop init` in, on one port (4040 by default), at `http://localhost:4040/p/<project>/`. The hub's home page lists your projects and everything that needs you across them: questions, gate approvals and stuck stories, each labelled with its project. Each project still reads only its own `.codeloop/` folder, and every request is answered from that project's own store, so two projects never share cards, runs or live updates. `codeloop projects list` shows the registered projects; `codeloop projects remove <id>` forgets one.

The hub binds `127.0.0.1`, answers only to a localhost host name, sends no CORS headers, and needs a same-origin request and a JSON content type for every write. Approve, Reject and every other write need you signed in, once for the whole hub: the username and password live in `~/.codeloop/hub.yaml` (default `owner` / `codeloop`; change it before sharing the board). A script or an agent calling the API directly authenticates with the token `codeloop serve` prints, sent as `x-codeloop-token`.

`codeloop serve --standalone` runs one project on its own port, the way codeloop worked before the hub; its sign-in lives in that project's `.codeloop/local.yaml` (`codeloop config board-password`). `codeloop open` reopens a running standalone board first, and the hub otherwise.

| Flag | Use |
|---|---|
| `-p, --port <port>` | Port, default 4040. |
| `--standalone` | Run this project alone instead of joining the hub. |
| `--bg`, `--stop` | Standalone only: run in the background; stop it. |
| `--open` | Open the browser after starting. |
| `--owner` | Allow writes from the board at all. On localhost this is already the default; required on a non-loopback `--host`. |
| `--read-only` | Disable writes even on localhost. |
| `--host <host>` | Listen on another address. Anything but the default exposes the board to the network, and is refused while the default password is in use. |

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

Put the machine-only part in `.codeloop/local.yaml`. It is laid over `config.yaml` key by key, is gitignored, and is never pushed to the cloud. The [overnight-run use case](/docs/use-cases/let-the-agent-work-overnight-and-approve-in-the-morning) keeps its agent command there.

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
