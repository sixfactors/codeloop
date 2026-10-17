---
title: What codeloop is
description: The board, plan and proof your AI coding agents work from, and the three ways to run it, on your own machine, on a shared server, or as Codeloop Cloud.
---

Your AI coding agents are fast, but nothing keeps track of what they are working on, what has been decided, or what still needs you. codeloop is that place. It gives every piece of work a board card with a plan, the checks it must pass and the history of what happened, and it gives your agents (in Claude Code, Cursor or Codex) the same board, wiki and skills to work from. It runs three ways: on your own machine, on a server your team shares, or as Codeloop Cloud. In every case your agents run on your own machines; codeloop keeps them coordinated and keeps the record.

codeloop is for **teams shipping with AI agents**. A team can be one founder with two agents, a small product team, or an engineering team with several people and many agent sessions. The page says "you" for whoever approves the work.

## The problem it solves

When an agent works in a chat, the plan, the decisions and the proof live in that chat. A second agent cannot see them, a teammate cannot see them, and tomorrow you cannot find them. An agent also reports its own work as done, and nothing checks that claim before you merge.

## Structured development, with checks that decide

Two well-known projects already give an agent a structure to follow. [GitHub Spec Kit](https://github.com/github/spec-kit) calls it spec-driven development: you define what and why before deciding how, through a sequence of slash commands (constitution, specify, plan, tasks, implement). [BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) gives the agent specialised roles (product, architecture, UX, development, testing) and a clarify, plan, build loop. Both follow the plan-then-implement pattern, and both are good at getting a better plan out of a model. Both are packs of prompts, templates and workflows that run inside your agent, so the agent reads the steps and decides when each one is finished.

codeloop takes each piece of work through defined steps. For a feature the shipped steps are research, questions, mock, plan, data model, build, verify, review, staging and live. Each step has a check, a command the engine runs, and the step is done only when that command succeeds. The agent's own report is not read. At four points, called gates, the card stops until a person approves: after the plan, after the local verify, at the pull request and before production. An agent cannot approve a gate.

What codeloop adds over a prompt pack:

- **Steps are enforced.** A check decides each step and a person decides each gate, so a model cannot skip one by saying it did. <span class="planned">working</span>
- **Each job keeps its proof and history.** The plan, the evidence from verify with the commit it ran on, and every approval and rejection stay with the card. <span class="planned">working</span>
- **You define the steps.** A lane is a file listing the steps for one kind of work. You edit it, add your own skills (the prompt a step hands its agent), and repeated rejections at one gate produce a proposed change to the lane. <span class="planned">working</span>
- **Many agents and people work from one board.** Two agents on one repo each hold their own card, and the board shows what needs you across projects. <span class="planned">partly built</span>: across machines and with roles per person is coming.
- **Skills and tool access reach every agent through one MCP link.** MCP (Model Context Protocol) is the standard that lets an agent call tools behind a URL. Today `codeloop mcp` serves the board's tools to agents on the same machine. One hosted link for every agent on the team is <span class="planned">planned</span>.

If you already have Spec Kit work, `codeloop import speckit` turns each feature folder into a card. `codeloop import bmad` reads BMAD's older `sprint-status.yaml` file; newer BMAD releases no longer write it, so their work does not import yet.

## What codeloop keeps for you

| What | What it holds | Status |
|---|---|---|
| Board | One card per piece of work, its step, its gate and who approved it | <span class="planned">working</span> |
| Plan and proof per job | Research, spec, plan and tasks for the card, and the verify evidence with its commit | <span class="planned">working</span> |
| Wiki | Pages agents read before a step and write after it, so a lesson is not learned twice | <span class="planned">working</span> |
| Skills | The prompts each step hands its agent, written in the format each host reads | <span class="planned">working</span> |
| Which agent is doing what | `codeloop orch status` lists the agent on each card, `codeloop ps` the agent processes codeloop started, and `codeloop whoami` the other Cursor sessions present. The web board does not show it yet | <span class="planned">partly built</span> |

## On your own machine

<span class="planned">working</span> Install it and run `codeloop init` in a project. Everything is files in the repo, committed with your code. No server and no account are needed.

```sh
npm install -g @protoboxai/codeloop
codeloop init
codeloop serve
```

`codeloop serve` opens the board in your browser on `localhost`, behind a sign-in. Every project you serve shares one board on one port.

Optionally, codeloop runs your agents for you. `codeloop run --agent` starts a headless Claude Code or Codex session on each step whose check does not pass yet, and `codeloop schedule install` runs that from cron. This is local only: an agent is started on the machine that has the code.

## For a team on a shared server

<span class="planned">partly built</span> What works today is one project's board on a machine your team can reach:

```sh
codeloop config board-password
codeloop serve --standalone --host 0.0.0.0 --owner
```

The board refuses to listen on the network while the default password is in use. Everyone who signs in uses that one shared username and password. The multi-project board from `codeloop serve` answers only on `localhost`.

Coming: agents on several machines reporting to one board, and roles per person (owner, reviewer, team member) by sign-in. Today a role is named on the command, and a gate check in CI says plainly that a local role is not authenticated.

## Codeloop Cloud

<span class="planned">planned</span> Codeloop Cloud will be the hosted place for a team's context and coordination:

- one team board, synced with each member's repo;
- the wiki, knowledge and skills shared across the team and every agent;
- agents reported from everyone's machines, on one board;
- one MCP link for every agent, from anywhere;
- an optional public, read-only view of projects you mark public.

It never runs an agent and never touches your code or your git. Agents keep running on your machines.

What works today is a mirror. `codeloop cloud connect` uploads the board, wiki, config and lanes to a hosted workspace, and `cloud push` and `cloud pull` keep the two copies in step. Approvals are still local events.

## How to choose

| Mode | Status | What you get | What you run | Where your data lives |
|---|---|---|---|---|
| Your own machine | <span class="planned">working</span> | Board, gates, proof, wiki, skills; optional agent runs and a schedule | `codeloop` and your agent host | Your repo |
| Shared server | <span class="planned">partly built</span> | One project's board on the network, one shared sign-in | `codeloop serve --standalone` on a machine the team reaches | The repo on that machine |
| Codeloop Cloud | <span class="planned">planned</span> | Team board, shared context, agents from every machine, one MCP link, a public view | `codeloop` on each machine; the cloud is hosted | Your repos, synced with a hosted workspace |

## Where your data lives, and what survives a lost laptop

Today the board is one file, `.codeloop/cards.json`, committed with your code. Each card's research, spec, plan and tasks sit in a folder under `specs/`, and its verify evidence in a folder under `evidence/`. Lanes, wiki pages and config are files under `.codeloop/`. All of these are in git, so a laptop you lose costs you only what you had not pushed.

Some files stay on the machine and are not committed: run logs, briefs handed to agents, `.codeloop/local.yaml` (machine settings such as your agent command), `.codeloop/cloud.json` (the cloud connection) and the board sign-in. You set these up again on a new machine.

Because every card shares one board file, two people committing at once can conflict on it. <span class="planned">coming</span> Each card's state and history will move into its own folder in git, beside its plan and evidence, so a card's whole record travels with it and commits touch only the cards they changed.

On a shared server the same rules apply to the repo on that server. With Codeloop Cloud, the hosted workspace will hold a synced copy and every member's repo will keep a full export in git.

Next: [Cloud and hosting](/docs/concepts/cloud-and-hosting) has the commands and flags for the board, schedules, CI gates and the cloud mirror.

## Sources

- GitHub Spec Kit, [github.com/github/spec-kit](https://github.com/github/spec-kit): spec-driven development, the `specify` CLI, templates and slash commands.
- BMAD-METHOD, [github.com/bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD): agile AI-driven development, specialised roles, clarify, plan and build.
