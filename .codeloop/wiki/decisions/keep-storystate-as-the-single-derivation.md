---
title: Keep storyState as the single derivation
scope:
  - src/lib/states.ts
  - .codeloop/wiki/decisions/ui-rebuild-bottom-up.md
freq: 1
severity: warning
cards:
  - c-119
updated: 2026-10-14
---

## Options

- Keep `storyState` as the single derivation; finish the `blocked` flag once c-118 lands typed links (`blocked_by` when the target is not done); leave `stuck` as today (Needs you via gate, also a flag). Chosen — matches the design and the api-first order (fields → states → screens).
- Rebuild state mapping inside the board UI from raw stage/gate. Rejected — the design and ui.md put derivation server-side so every screen and the SDK share one answer.
- Treat the card as done and close it (six states + failing already ship). Rejected — the title and `[api]` note require the blocked flag from links; closing would leave a typed-but-dead flag.

## Why

today's board is one row of stage columns per workflow (nine stages), so a founder cannot read status at a glance. Source: docs/artifacts/codeloop-ui-design.html ("Today's lanes and nine stages are too many to read. People need six states") and `.codeloop/wiki/decisions/ui-rebuild-bottom-up.md` (nine stage columns per workflow were confusing to read and act from).

## Consequences

Keep `storyState` as the single derivation; finish the `blocked` flag once c-118 lands typed links (`blocked_by` when the target is not done); leave `stuck` as today (Needs you via gate, also a flag). — matches the design and the api-first order (fields → states → screens). The other options are not built; reopening one is a new decision.
