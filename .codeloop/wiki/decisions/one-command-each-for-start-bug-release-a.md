---
title: One command each for start, bug, release and annotate, and holds that
scope:
  - src/commands/card.ts
  - src/lib/services.ts
  - src/lib/engine.ts
  - src/lib/active-card.ts
  - src/lib/orch-isolation.ts
  - src/commands/guard-hooks.ts
  - src/sdk/client.ts
freq: 1
severity: warning
cards:
  - c-368
updated: 2026-10-18
---

## Options

- **One command each for start, bug, release and annotate, and holds that expire when their session goes quiet.** Chosen. `codeloop start <id>` starts a queued or proposed story at its start stage and makes it active; `codeloop bug "<title>"` files a trivial flagged story, makes it active and prints its Card line; `card show` names each blank field with the command that fills it; `card edit --description` appends a dated line; `card release <id>` frees another session's hold, recorded on the story; and a hold whose session wrote nothing to the story's activity for `monitor.stall_minutes` stops counting, everywhere a hold is read, with an expiry event. It reuses `startCard` (src/lib/flow.ts:10), `builderIdle` (src/lib/stall.ts:68) and `clearActiveCard` (src/lib/active-card.ts:105), and touches `src/commands/card.ts`, `src/lib/services.ts`, `src/lib/engine.ts`, `src/lib/active-card.ts`, `src/lib/orch-isolation.ts`, `src/commands/guard-hooks.ts` and `src/sdk/client.ts`.
- **A heartbeat lease, as Beads does, renewed by a call every few minutes.** Lost: it needs a writer in every host and agent, and the activity stream already carries the same signal.
- **Only a release command, keeping the 24-hour expiry.** Lost: the owner asked for automatic expiry, and c-159 waited four hours for someone to notice.

## Why

the founder's orchestrator on the production project reported on 18 October (c-368's description and the owner's note in .codeloop/cards.json) that it could not start the next story in one step, had no card to name on bug-fix commits, read blank stories from `card show`, could not add the owner's decisions to a story, and that its c-159 was held for four hours by a run that had died, with no way to release it. A worker that crashes keeps its claim until something expires it, which is why queues hide a message only for a visibility timeout (AWS SQS) and leases carry a duration measured from the last renewal (Kubernetes).

## Consequences

**One command each for start, bug, release and annotate, and holds that expire when their session goes quiet.** `codeloop start <id>` starts a queued or proposed story at its start stage and makes it active; `codeloop bug "<title>"` files a trivial flagged story, makes it active and prints its Card line; `card show` names each blank field with the command that fills it; `card edit --description` appends a dated line; `card release <id>` frees another session's hold, recorded on the story; and a hold whose session wrote nothing to the story's activity for `monitor.stall_minutes` stops counting, everywhere a hold is read, with an expiry event. It reuses `startCard` (src/lib/flow.ts:10), `builderIdle` (src/lib/stall.ts:68) and `clearActiveCard` (src/lib/active-card.ts:105), and touches `src/commands/card.ts`, `src/lib/services.ts`, `src/lib/engine.ts`, `src/lib/active-card.ts`, `src/lib/orch-isolation.ts`, `src/commands/guard-hooks.ts` and `src/sdk/client.ts`. The other options are not built; reopening one is a new decision.
