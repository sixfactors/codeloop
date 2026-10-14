---
title: Add board.up_next.limit and auto_refill in config
scope:
  - src/lib/states.ts
  - src/lib/services.ts
freq: 1
severity: warning
cards:
  - c-120
updated: 2026-10-14
---

## Options

- Add `board.up_next.limit` (default 6) and `auto_refill` in config; on every board-changing write, while under the limit, move the top ranked Backlog/Plan stories into `queued` (Up next), skipping blocked; keep lane `wip` for In progress. Chosen — matches the design, the owner's c-100 clarification, and this card's `[api]` note; Settings UI stays for later (c-139).
- Reuse lane `wip` as the Up next limit. Rejected — `wip` counts workable (in-lane, not at a gate) cards; the design separates a ready queue of N from how many agents may work at once.
- Manual drag from Plan into Up next only. Rejected — the story requires auto refill so agents never wait for the founder to pick the next card.

## Why

agents sit idle until a founder manually picks the next story, because nothing keeps a fixed ready queue filled from the ranked plan. Source: docs/artifacts/codeloop-ui-design.html ("Up next holds 6 and refills from the top of this list"; sprints replaced by "Up next with a limit") and the card story ("keep six stories ready and refill from the top of the plan, so that agents never wait for me to pick work"). Owner already chose default 6 + auto refill in specs/100/spec.md clarifications; c-109 was dropped as superseded by this card.

## Consequences

Add `board.up_next.limit` (default 6) and `auto_refill` in config; on every board-changing write, while under the limit, move the top ranked Backlog/Plan stories into `queued` (Up next), skipping blocked; keep lane `wip` for In progress. — matches the design, the owner's c-100 clarification, and this card's `[api]` note; Settings UI stays for later (c-139). The other options are not built; reopening one is a new decision.
