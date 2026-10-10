---
title: Hosts
description: Claude Code, Cursor, Codex and any MCP client. What init and render write for each, and how an agent is started.
---

## Supported hosts

| Host | Skills from `init` | Lane files from `render` | Headless agent for `run --agent` |
|---|---|---|---|
| Claude Code | `.claude/commands/<skill>.md` | `.claude/agents/codeloop-<lane>-<stage>.md`, one agent per stage | `claude -p --permission-mode acceptEdits < {brief}` |
| Cursor | `.cursor/commands/<skill>.md` | `.cursor/rules/codeloop-<lane>.mdc`, one rule per lane | Cursor has no headless command; run stages from the editor |
| Codex | `.agents/skills/<skill>/SKILL.md` | `.agents/skills/codeloop-<lane>/SKILL.md`, one skill per lane | `codex exec - < {brief}` |
| Any host | | `AGENTS.md`, a block between `<!-- codeloop:start -->` and `<!-- codeloop:end -->` | |
| Any MCP client | | `codeloop mcp` over stdio | |

`codeloop init --tools claude,cursor,codex` writes the skills for all three. `codeloop render --host all` writes the lane files for all three; `--host claude` for one.

## What render writes

```sh
codeloop render
```

```text
  + .claude/agents/codeloop-build-research.md
  + .claude/agents/codeloop-build-mock.md
  ...
  + .cursor/rules/codeloop-build.mdc
  ...
  + .agents/skills/codeloop-build/SKILL.md
  ...
  + AGENTS.md
  49 written, 0 unchanged
```

Forty-nine files for the eight shipped lanes: 32 Claude agents, 8 Cursor rules, 8 Codex skills and the `AGENTS.md` block. A second run writes nothing, because every file is compared before it is written. Text outside the markers in `AGENTS.md` is kept.

Every rendered file carries the same five steps for a stage. A Claude agent for the verify stage:

```text
---
name: codeloop-build-verify
description: Run the verify stage of the build lane for one codeloop card, using the qa skill.
---

# build / verify

1. Run `codeloop card show <id>`. It prints the output path, the done check, the stage notes and any earlier rejection notes. Follow those over anything remembered.
2. Run `codeloop wiki inject --files <files you expect to touch>` and read every page it prints.
3. Do the work with the `qa` skill (.claude/commands/qa.md). Quality gate — run all checks before promoting a task
4. Write the result to `evidence/{nnn}/verify.md`.
5. Run `codeloop card advance <id>`. It runs `codeloop verify {id}`. If it exits 2, read the output, fix the work and run it again. Stop after 3 failures: the card parks as stuck for the owner.
6. The card then waits at gate `local` for the owner. Stop there. Never run `codeloop approve` yourself.
```

The `AGENTS.md` block starts with the four rules and then one table per lane:

```text
## codeloop

- Run `codeloop card show <id>` first. It names the stage, the skill, the output path and the done check.
- Move a card only with `codeloop card advance <id>`. Never edit `.codeloop/cards.json` or a lane file.
- Gates are approved only by a person. Stop when a card parks.
- Run `codeloop wiki inject --files <paths>` before changing files.

### build

| Stage | Skill | Output | Done check | Gate |
|---|---|---|---|---|
| research | design | {spec}/research.md | `codeloop check research {id} --min-sources 3` |  |
| mock | design |  | `codeloop check mock {id}` |  |
| spec | plan | {spec}/tasks.md | `codeloop spec check {id}` | spec (owner, after the check passes) |
```

## In a session

Open the repo in the host and work a card by hand:

1. `codeloop start "<title>"` in a terminal.
2. In the host, run the skill the `Next:` line names (`/design`, `/plan`, ...). The rendered rule or agent for the lane says what to write where.
3. `codeloop next <id>` runs the check. Repeat until the card parks at a gate.
4. `codeloop approve <id>` or `codeloop reject <id> "<note>"`.

## Unattended

Set the agent in `config.yaml` or `local.yaml`, then `codeloop run --agent` once, or `codeloop schedule install` to run it from cron. The agent gets the stage brief on stdin, works in the project directory, and is killed at the timeout. The run that started it then runs the check and moves the card. The agent process has `CODELOOP_AGENT_RUN` set and cannot approve, reject or promote. [Cloud and hosting](/docs/concepts/cloud-and-hosting) has the config block.

```yaml
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
  codex:
    cmd: "codex exec - < {brief}"
```

## MCP

`codeloop mcp` serves the engine over stdio. Tools: `inbox`, `next_up`, `get_card`, `advance`, `approve`, `reject`, `task_done`, `wiki_inject`, `wiki_capture`. For Claude Code:

```sh
claude mcp add codeloop -- codeloop mcp
```

For a host that takes a JSON config:

```json
{
  "mcpServers": {
    "codeloop": { "command": "codeloop", "args": ["mcp"] }
  }
}
```

The role comes from `CODELOOP_ROLE` in the server's environment, never from a tool argument. Without it the server acts as an agent and `approve` and `reject` are refused. Start it with `CODELOOP_ROLE=owner` only for a client you are driving yourself.

## Importing from other tools

```sh
codeloop import speckit
codeloop import bmad
```

Each makes one card per existing feature or story and only reads the source files. [Cards and gates](/docs/concepts/cards-and-gates) has the detail and the caveat on the BMAD file format.
