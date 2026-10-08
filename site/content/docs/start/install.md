---
title: Install
description: One package, one command, and a .codeloop folder in your repo.
---

## Requirements

Node 20 or newer and a git repository. The host is Claude Code, Cursor or Codex; `init` asks which, or takes `--tools`.

## Install the CLI

```sh
npm install -g @protoboxai/codeloop
codeloop --version
```

Without a global install, `npx @protoboxai/codeloop init` runs the same thing once.

## Initialise a repo

```sh
cd your-project
codeloop init --tools claude
```

Output from codeloop 0.3.0 in an empty repo:

```text
  No specific stack detected, using generic config

Initializing codeloop...
  Tools: claude | Stack: Generic project

  Created:
    + .claude/commands/design.md
    + .claude/commands/plan.md
    + .claude/commands/manage.md
    + .claude/commands/test.md
    + .claude/commands/commit.md
    + .claude/commands/qa.md
    + .claude/commands/deploy.md
    + .claude/commands/debug.md
    + .claude/commands/reflect.md
    + .claude/commands/ship.md
    + .codeloop/lanes/analyze.yaml
    + .codeloop/lanes/build.yaml
    + .codeloop/lanes/deploy.yaml
    + .codeloop/lanes/learn.yaml
    + .codeloop/lanes/market.yaml
    + .codeloop/lanes/plan.yaml
    + .codeloop/lanes/scan.yaml
    + .codeloop/lanes/triage.yaml
    + .codeloop/rules.md
    + .codeloop/gotchas.md
    + .codeloop/patterns.md
    + .codeloop/principles.md
    + .codeloop/board.json
    + .codeloop/.gitignore
    + .codeloop/config.yaml

Done.

  8 lanes in .codeloop/lanes/, 47 skills indexed in .codeloop/skills.index.yaml.
  codeloop serve opens the board in a browser.

  Next, type:
    codeloop start "<your feature>"
    codeloop inbox
```

## What init writes

| Path | What it is | Overwritten by `update`? |
|---|---|---|
| `.codeloop/lanes/*.yaml` | The eight lanes. Each one is a list of stages with a check command and, where you want to decide, a gate. | No |
| `.codeloop/config.yaml` | Project name, scopes, quality checks, agents, deploy commands. | No |
| `.codeloop/rules.md`, `gotchas.md`, `patterns.md`, `principles.md` | Knowledge the agents read and the learn loop writes. | No |
| `.codeloop/board.json` | The board the web UI reads. | No |
| `.claude/commands/*.md` | Ten skills: design, plan, manage, test, commit, qa, deploy, debug, reflect, ship. Each lane stage names one. | Yes, when the version changes |
| `.codeloop/skills.index.yaml` | Index of the skills and commands that exist in the repo, so lanes can name them. Gitignored. | Rebuilt |

The `init` flags:

| Flag | Use |
|---|---|
| `--starter <name>` | `generic`, `node-typescript`, `python` or `go`. Detected from the repo when omitted. |
| `--tools <tools>` | `claude,cursor,codex`, comma separated, to skip the prompt. |
| `--hooks` | Only install the commit-msg hook that adds the `Feature: <card-id>` trailer. |
| `--ci github` | Only write the GitHub workflows. |
| `--yes` | Write the ten commands into a `.claude/commands/` that already has files in it. Without it the folder is left alone. [You already have a project](/docs/start/already-have-a-project) shows both. |

## Check it took

```sh
codeloop lane list
```

```text
  analyze    v1  pull → compare → judge → findings  cron 0 9 * * FRI
  build      v1  research → mock → spec → build → verify → review → staging → live  manual
  deploy     v1  staging → verify → prod → smoke  on git.tag
  learn      v1  capture → bump → promote  manual
  market     v1  brief → draft → publish → measure  on lane.done (build)
  plan       v1  gather → research → rank → story  cron 0 9 * * MON
  scan       v1  scan  cron 0 7 * * MON
  triage     v1  capture → classify → dedupe → file  cron 0 20 * * *
```

`codeloop lane lint` exits 2 if any lane file is malformed. On a fresh install it prints `8 lanes ok`.

## Update later

```sh
codeloop update --dry-run
codeloop update
```

`update` refreshes the skill files whose `codeloop-version` comment is older than the installed CLI. It never touches lanes, config or knowledge files.

Next: [Your first card](/docs/start/first-card).
