---
title: Build one stuck explanation on the server from the story's events and
scope:
  - src/lib/cards.ts
  - src/lib/journey.ts
  - src/lib/inbox.ts
  - workspace/components/shared/current-step-panel.tsx
freq: 1
severity: warning
cards:
  - c-308
updated: 2026-10-17
---

## Options

- **Build one stuck explanation on the server from the story's events and commits.** Chosen: one function beside `stuckReason` answers three things in plain words (was any work tried since the story entered the stage, what already shipped under its id, and which action changes the outcome: place it forward, write the stage file, or let an agent run), and the story page, the inbox and the command line all print the same answer. It touches `src/lib/cards.ts`, `src/lib/journey.ts`, `src/lib/inbox.ts` and `workspace/components/shared/current-step-panel.tsx`, and keeps the join on the server as the repo's no-client-join rule asks.
- **Reword the panel copy on the story page only.** Lost: the inbox and the command line keep printing the raw last line, and the page would have to fetch commits and events and join them in the browser to name the right action.
- **Hide "Approve: unstick" when nothing changed.** Lost: it removes the one button without saying which action does work, so the founder is left with nothing.

## Why

a founder opens a stuck story and is offered a retry that cannot work. c-136's page showed "research.md cites 0 sources" and "Approve: unstick", which reruns the same check on the same empty file, while the whole board it describes had shipped in 9ade47c; the inbox kept c-302's old failure after later passes, and c-098's reason read "Node.js v26.4.0". Source: .codeloop/wiki/gotchas/stuck-without-any-work.md and the card note on c-308.

## Consequences

**Build one stuck explanation on the server from the story's events and commits.**: one function beside `stuckReason` answers three things in plain words (was any work tried since the story entered the stage, what already shipped under its id, and which action changes the outcome: place it forward, write the stage file, or let an agent run), and the story page, the inbox and the command line all print the same answer. It touches `src/lib/cards.ts`, `src/lib/journey.ts`, `src/lib/inbox.ts` and `workspace/components/shared/current-step-panel.tsx`, and keeps the join on the server as the repo's no-client-join rule asks. The other options are not built; reopening one is a new decision.
