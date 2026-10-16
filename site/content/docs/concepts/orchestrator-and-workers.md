---
title: Orchestrator and workers
description: Three roles run a card, any agent host can take any role, and each role is taught by a file codeloop writes. What those files say, what the engine refuses on its own, and what is still missing.
---

When one agent session plans a card, edits the code and approves its own result, nothing separates the three jobs and nothing can refuse a move.

codeloop splits a card's work into three roles, owner, orchestrator and worker, and keeps the state in an engine that refuses the moves a role may not make. The words this page uses:

- A **brief** is the text a worker is handed for one stage: the card, the check, the skill and any feedback from the last failure.
- A **turn** is one run of one stage by one worker: brief, worker, hand-back, gate, record.
- A **hand-back** is the five-line report a worker returns at the end of a turn.
- A **lease** is a claim on the files in a card's plan while a worker runs, so two workers never edit the same file.
- A **holder** is whoever has a card now: an agent, a person, or nobody (queued).
- An **outcome** is how a turn ended, such as `merged`, `failed`, `stuck` or `questions`.

## Three roles, one engine

A card moves because three roles act on it. The engine holds the state and refuses the moves a role may not make, so a role has to be taught only what it should do, never what it cannot.

| Role | Does | Never | Who can hold it |
|---|---|---|---|
| Owner | Approves gates, answers questions, sets priority, moves a card by hand | | A person. The engine refuses `approve`, `reject` and `answer` from any agent process. |
| Orchestrator | Picks the next card, writes the brief, starts a worker, gates the hand-back, reports | Edits code, redoes a worker's work, pushes | `codeloop orch run` (code), or an agent session running the orchestrator protocol below |
| Worker (builder) | Does one stage of one card in the one main tree and hands back five lines | Approves, advances, pushes, merges, touches another card's files | Any host that can read a brief, edit files, commit and run one command |

The orchestrator and the worker never have to be the same product. A Claude Code session can orchestrate workers that are `claude -p`, Codex, Cursor's headless agent or Gemini CLI, and a Cursor session can orchestrate the same list. The engine sees a brief going out and a hand-back coming in; which model wrote the commits between them is a config line.

## Any host in any role

| Host | Orchestrator | Worker, in a session | Worker, headless (`agents.<name>.cmd`) | What codeloop writes for it |
|---|---|---|---|---|
| Claude Code | yes, as a session | yes | `claude -p --permission-mode acceptEdits < {brief}` | `CLAUDE.md` block, `.claude/commands/*`, `.claude/agents/codeloop-<lane>-<stage>.md`, hooks in `.claude/settings.json` |
| Cursor | yes, as a session | yes | `cursor-agent -p "$(cat {brief})"` | `.cursor/rules/codeloop.mdc`, `.cursor/rules/codeloop-<lane>.mdc`, `.cursor/commands/*`, `.cursor/hooks.json` |
| Codex | yes, as a session | yes | `codex exec --full-auto "$(cat {brief})"` | `AGENTS.md` block, `.agents/skills/*` |
| Gemini CLI, or any other CLI | no, nothing renders for it yet | only through `AGENTS.md` | any command that takes the brief as text, for example `gemini -p "$(cat {brief})"` | `AGENTS.md` block only |
| A person | yes | yes, `--builder person` | | the brief lands in `.codeloop/state/orch/outbox/person.md` |
| CI | no | no | a job that runs the stage check | [the CI workflow templates](https://github.com/sixfactors/codeloop/tree/main/templates/ci) |

A headless worker is one line in `.codeloop/config.yaml`; `init` writes the presets for the tools it detects and leaves one out when its binary is not on PATH:

```yaml
agents:
  default: claude
  claude:
    cmd: "claude -p --permission-mode acceptEdits < {brief}"
    timeout_minutes: 20
    max_runs_per_day: 10
  codex:
    cmd: "codex exec --full-auto \"$(cat {brief})\""
  gemini:
    cmd: "gemini -p \"$(cat {brief})\""
```

The Gemini CLI line above is the shape of a preset, not a tested one: no Gemini hand-back has been through a gate. A lane stage names its worker with `agent: <name>`, so research can run on a cheap model and build on a strong one.

## What each role is taught, and by which file

Nothing is typed into a chat. Every fact a role needs is in a file codeloop writes or a command it prints, so a new session, a new host or a new machine starts with the same knowledge.

| The role must know | Taught by | Written by |
|---|---|---|
| The words: card, stage, gate, holder, lease, turn, hand-back, outcome | The definitions at the top of this page, in the `## codeloop lanes` table | `codeloop render`, into `AGENTS.md` |
| The standing protocol: read the monitor first, brief before work, one stage, never approve, ask with `codeloop ask`, capture to the wiki after | [the protocol template](https://github.com/sixfactors/codeloop/blob/main/templates/protocol.md) | `codeloop render`, into `CLAUDE.md`, `.cursor/rules/codeloop.mdc`, `.github/copilot-instructions.md`, `AGENTS.md` |
| The five steps of a stage: show the card, inject the wiki, run the skill, write the output, advance | one agent, rule or skill per stage or lane | `codeloop render`, per host |
| How to do the stage's work | the skill (`research`, `spec`, `build`, `verify`, ...) | `codeloop init`, into the host's commands or skills folder |
| This turn: card, stage, output path, check, rubric, files leased, rejection notes, open questions | the brief | `codeloop brief <id>`, or `codeloop orch run` into `.codeloop/state/briefs/` |
| The worker's rules: one tree, own files only, `Card:` and `Task:` trailers, no push, fix forward, selfcheck, the exact hand-back line | [the brief footer](https://github.com/sixfactors/codeloop/blob/main/templates/orch/brief-footer-tree.md), appended to every orchestrated brief | `codeloop orch run` |
| What it may not do | nothing; the engine refuses it | hooks, guards, `CODELOOP_AGENT_RUN` |
| The orchestrator's loop | **not written yet**: the orchestrator is either `codeloop orch run` or a session following rules kept outside codeloop | listed under "What is not done" below |

The last row is the gap. Every builder role is rendered for every host. The orchestrator role exists as code (`codeloop orch run`, `status`, `resume`, `inbox`, `report`) and as a private rules document in one team's repo, so a fresh Claude or Cursor session cannot be told "orchestrate this board" and know what that means.

## The loop, drawn

```text
 Owner (a person)
   approves gates, answers questions, reads the report
        ^                                   |
        | report, questions, gates          | priority, answers, approve
        |                                   v
 Orchestrator (session running /orch, or `codeloop orch run`)
   orch status -> pick card -> brief -> start worker -> wait -> gate -> report -> next
        ^                                   |
        | hand-back (5 lines, recorded)     | brief + lease
        |                                   v
 Worker (claude -p | codex | cursor-agent | gemini | a session | a person)
   reads the brief, edits leased files, commits with Card: trailer,
   runs selfcheck, runs `codeloop card handback`
        ^                                   |
        | refusals, monitor, wiki pages     | every edit, command, commit, check
        |                                   v
 Engine (.codeloop/)
   board . lanes . checks . rubrics . leases . repo lock . budgets . activity . ledger
   hooks record; guards refuse; doctor retries at night
```

One turn, start to end:

1. The orchestrator runs `codeloop orch status` and `codeloop inbox`. It picks the highest-value card nobody holds whose stage has no open gate.
2. `codeloop orch run <card>` writes the brief from the card, the stage skill, the rubric and the plan's `## Files` list, takes the lease on those files, and starts the configured worker with the brief. With `--builder session:<name>` or `--builder person` it writes the brief to the outbox instead and waits.
3. The worker edits only leased files. Hooks append every edit, command and commit to the card's activity stream, so the board shows "editing lane.ts, 40 s ago" while it runs.
4. The worker runs `codeloop card selfcheck`, commits with `Card: c-301`, and ends with the hand-back line from the brief footer.
5. The gate reruns the proof command on HEAD, checks the rubric rows, and judges only the commits carrying the card's trailer. A sentence in the hand-back is never evidence.
6. Pass: the stage advances. A stage with a gate stops there for the owner, who sees "Waiting for you at verify" with the check sentence. Fail: a fix-forward brief goes to the same worker, counted against the lane's retries; the third fail parks the card stuck.
7. The orchestrator reports: what the owner would notice, what is broken, the one decision. Then the next card.
8. At night the doctor reruns failed checks only where something changed, starts the stage agent once on a story whose output was never written, and nudges a worker that went quiet.

## What the engine refuses, so nobody has to teach it

| Attempt | Refused by |
|---|---|
| An agent process approving, rejecting or answering | `CODELOOP_AGENT_RUN`, `CODELOOP_ROLE`, the hub's sign-in |
| Editing a file another card's plan leases | `guard edit` (Claude Code), the pre-commit hook (every host) |
| A third builder when `orch.max_builders` is 2 | the repo lock; the card is `queued` |
| Starting a turn past `max_runs_per_day` or the memory ceiling | the run ledger; outcome `budget` |
| Rerunning a failed check when nothing under the card changed | `check-skipped` once a day |
| A commit without a `Card:` trailer on an orchestrated branch | the commit-msg hook |
| Starting anything while `codeloop off` holds | every hook and `orch`, `run`, doctor |
| Push, merge, rebase from a worker | not refused by the engine; the brief footer forbids it and git hooks catch a push |

## What is not done

- **No rendered orchestrator command.** `codeloop render` writes the builder protocol for every host and nothing for the orchestrator. Until it exists, the orchestrator is `codeloop orch run` or a session that follows the protocol below, and `codeloop orch run` does not tell a session to keep going when it finishes one turn.
- **Cursor and Codex get fewer guards.** Cursor's hooks file carries presence and `beforeShellExecution` only, so a Cursor worker's edits are not recorded or refused at edit time; Codex has no hooks at all. Both still hit the git hooks and the gate, which is where the engine judges. [How codeloop keeps an agent honest](/docs/concepts/how-codeloop-keeps-an-agent-honest) has the per-host table.
- **Gemini CLI is untested as a worker.** The config line is the shape; nobody has gated a Gemini hand-back.
- **The orchestrator's state between turns lives in `.codeloop/state/orch/<card>.json`** and in the session's own memory. A session that compacts or restarts resumes from `codeloop orch status` and `codeloop orch inbox`; there is no "what I was about to do next" file.
- **A session orchestrator pays for its own waiting.** `codeloop orch run` polls for a hand-back for up to `orch.wait_minutes`; a chat session holding that wait spends its context on it. `--no-wait` plus `orch resume` is the cheaper shape and the one a session should use.

## Reference: the orchestrator protocol

This is what a session must be told to hold the orchestrator role. `codeloop render` does not write it yet; "What is not done" above says why. To use it today, save it as `.claude/commands/orch.md` or `.cursor/commands/orch.md`.

```text
# /orch: run this board

You are the orchestrator for this repository. The engine keeps the state; you keep the loop.

Loop
1. Run `codeloop orch status` and `codeloop inbox`. Report to the owner anything waiting for them; never approve it yourself.
2. Pick one card: the highest priority band, then the oldest, that nobody holds and that is not at a gate. Skip a card whose plan overlaps a held lease; the engine reports it as waiting-lease.
3. Run `codeloop orch run <card>`. It briefs, starts the worker, waits, gates and records. Do not do the stage's work yourself and do not edit the worker's files while it runs.
4. Read the outcome. merged: go to 1. questions: put them in front of the owner, then go to 1. failed or merge-failed: run `codeloop orch run <card>` once more; the engine briefs the fix forward. stuck, budget, locked, builder-unavailable: stop and report; these need the owner or the doctor.
5. After each merged turn run `codeloop orch report <card>` and give the owner its paragraph: what works now, the proof, what is left, the next gate.
6. Stop when the inbox has nothing runnable, when the day's run budget is spent, or when the owner says stop. Say which.

Rules
- One main tree. Never create a worktree, never switch the branch, never run git push, rebase, reset, stash or revert.
- Never run `codeloop approve`, `reject`, `answer` or `card advance`. Those are the owner's; the engine refuses them from you anyway.
- Never touch another session's files or processes. Coordinate through the board, leases and messages.
- Tests run one file at a time; the full suite runs once, by you, at the end of a step.
- Hand-backs are data, not proof. The gate's rerun is the proof.
- Report in five lines: what the owner would notice, what is still broken, the one decision, the card id, the next action.
- `codeloop off` means stop starting turns; finish none, start none, say so.
```

A person can run the same loop by hand, one command at a time, and a Cursor session reads the same file from `.cursor/commands/`.
