---
title: Run two agents on one repo without collisions
description: Let several agents work on different cards in the same checkout, each limited to the files its plan names, with you reading one report per card.
---

## The problem

You want two agents working on two features at once. They edit the same files, one overwrites the other's change, and the report you get at the end says both succeeded.

## Without codeloop

You give each agent its own clone or branch and merge by hand, or you let them share one tree and hope. The merge conflicts appear at the end. An agent that runs out of time says "done" in a sentence, and you have no way to tell which files it was allowed to touch.

## With codeloop

codeloop splits a card's work into three roles. The owner, you, approves gates and answers questions. The orchestrator picks the next card, writes the brief, starts a worker and gates the hand-back. A worker does one stage of one card. These terms are used below:

- A **brief** is the text a worker is handed for one stage: the card, the check, the skill and feedback from the last failure.
- A **lease** is a claim on the files in a card's plan while a worker runs, so two workers never edit the same file.
- A **hand-back** is the five-line report a worker returns at the end of a turn, and a **turn** is one run of one stage by one worker.

The orchestrator can be `codeloop orch run`, or an agent session that follows the orchestrator protocol. The worker can be `claude -p`, Codex, Cursor's headless agent, Gemini CLI, a session or a person. One turn:

1. The orchestrator runs `codeloop orch status` and `codeloop inbox`, and picks the highest-value card nobody holds whose stage has no open gate.
2. `codeloop orch run <card>` writes the brief from the card, the stage skill, the rubric and the plan's `## Files` list, takes the lease on those files and starts the worker with the brief.
3. The worker edits only leased files. Hooks record every edit, command and commit on the card, so the board shows what is being edited while it runs.
4. The worker runs `codeloop card selfcheck`, commits with a `Card:` trailer and ends with the hand-back line.
5. The gate reruns the proof command on the latest commit, checks the rubric and judges only the commits that carry the card's trailer. A sentence in the hand-back is never evidence.
6. When the check passes, the stage advances, and a stage with a gate stops for you. When it fails, a fix-forward brief goes to the same worker, counted against the lane's retries. The third failure parks the card as stuck.
7. The orchestrator reports what you would notice, what is broken and the one decision, then moves to the next card.

The engine refuses the collisions so nobody has to be told not to cause them:

| Attempt | Refused by |
|---|---|
| Editing a file another card's plan leases | `guard edit` on Claude Code, and the pre-commit hook on every host |
| A third worker when `orch.max_builders` is 2 | the repo lock, and the card is `queued` |
| A turn past `max_runs_per_day` | the run ledger |
| A commit without a `Card:` trailer on an orchestrated branch | the commit-msg hook |
| An agent approving, rejecting or answering | `CODELOOP_AGENT_RUN` and the hub's sign-in |

## What you still do

- Approve the gates, answer the questions and read each card's report.
- Set `orch.max_builders` and the run caps for your machine.

## Not yet

- No orchestrator command is rendered for any host. `codeloop render` writes the worker protocol for every host and nothing for the orchestrator. You run `codeloop orch run`, or save the orchestrator protocol as a command in your host yourself.
- Cursor and Codex get fewer guards. A Cursor worker's edits are not refused at edit time, and Codex has no hooks. Both still hit the git hooks and the gate, which is where the engine judges.
- Gemini CLI has not been through a gate as a worker.

Next: [Orchestrator and workers](/docs/concepts/orchestrator-and-workers) for the three roles in detail and the protocol itself.
