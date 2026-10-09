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

Output from codeloop 0.4.1 in an empty repo:

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
    + .claude/skills/api/SKILL.md
    + .claude/skills/api/checklist.md
    + .claude/skills/api/template.md
    + .claude/skills/interview/SKILL.md
    + .claude/skills/interview/checklist.md
    + .claude/skills/interview/template.md
    + .claude/skills/mock/SKILL.md
    + .claude/skills/mock/checklist.md
    + .claude/skills/mock/template.md
    + .claude/skills/release/SKILL.md
    + .claude/skills/release/checklist.md
    + .claude/skills/release/template.md
    + .claude/skills/research/SKILL.md
    + .claude/skills/research/checklist.md
    + .claude/skills/research/template.md
    + .claude/skills/review/SKILL.md
    + .claude/skills/review/checklist.md
    + .claude/skills/review/template.md
    + .claude/skills/sdk/SKILL.md
    + .claude/skills/sdk/checklist.md
    + .claude/skills/sdk/template.md
    + .claude/skills/spec/SKILL.md
    + .claude/skills/spec/checklist.md
    + .claude/skills/spec/template.md
    + .claude/skills/system-design/SKILL.md
    + .claude/skills/system-design/checklist.md
    + .claude/skills/system-design/template.md
    + .claude/skills/test-design/SKILL.md
    + .claude/skills/test-design/checklist.md
    + .claude/skills/test-design/template.md
    + .claude/skills/ui/SKILL.md
    + .claude/skills/ui/checklist.md
    + .claude/skills/ui/template.md
    + .claude/skills/verify/SKILL.md
    + .claude/skills/verify/checklist.md
    + .claude/skills/verify/template.md
    + .claude/skills/workflow/SKILL.md
    + .claude/skills/workflow/checklist.md
    + .claude/skills/workflow/template.md
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

  8 lanes in .codeloop/lanes/, 60 skills indexed in .codeloop/skills.index.yaml.
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
| `.claude/commands/*.md` | Ten commands: design, plan, manage, test, commit, qa, deploy, debug, reflect, ship. The cron lanes name them. | Yes, when the version changes |
| `.claude/skills/<name>/` | Thirteen stage skills, each a `SKILL.md` with its procedure, a `template.md` and a `checklist.md`: research, interview, mock, spec, api, sdk, ui, test-design, verify, review, release, system-design, workflow. The build lane names one per stage. | Yes, when the version changes |
| `.codeloop/skills.index.yaml` | Index of the skills and commands that exist in the repo, so lanes can name them. Gitignored. | Rebuilt |

The `init` flags:

| Flag | Use |
|---|---|
| `--starter <name>` | `generic`, `node-typescript`, `python` or `go`. Detected from the repo when omitted. |
| `--tools <tools>` | `claude,cursor,codex`, comma separated, to skip the prompt. |
| `--hooks` | Only install the commit-msg hook that adds the `Feature: <card-id>` trailer. |
| `--ci github` | Only write the GitHub workflows. |
| `--yes` | Write the commands and skills into a `.claude/commands/` that already has files in it. Without it the folder is left alone. [You already have a project](/docs/start/already-have-a-project) shows both. |

## Check it took

```sh
codeloop lane list
```

```text
  analyze    v1  pull → compare → judge → findings  cron 0 9 * * FRI
  build      v1  research → interview → mock → spec → build → verify → review → staging → live  manual
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
