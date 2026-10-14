---
title: Extend Card / CardExtras with holder, owner, reviewer, type, links
scope:
  - src/lib/cards.ts
  - .codeloop/wiki/architecture/ui.md
freq: 1
severity: warning
cards:
  - c-118
updated: 2026-10-14
---

## Options

- Extend `Card` / `CardExtras` with holder, owner, reviewer, type (`story|bug|chore`), links (`blocks|blocked_by|relates|duplicates`), labels, area, risk and release; validate on write; migrate `cards.json`. Chosen — matches the design's "one home" on the story and the api-first build order in the ui-rebuild decision.
- Keep a sidecar metadata file keyed by card id. Rejected — screens and the SDK would join two stores for every read; the design puts every field on the story.
- Derive holder only from `events` / `awaiting` and skip schema. Rejected — type, links, labels and area cannot be derived, and history already lives in events while the current holder still needs a field.

## Why

a founder cannot answer "who has this" from the board — cards have no holder, no accountable owner person, no type and no typed links, so people ask in chat instead of reading the story. Source: docs/artifacts/codeloop-ui-design.html ("An agent is a teammate… so 'who has this' always has an answer"; story fields table) and the card story on c-118 ("nobody asks who has this"). Confirmed by `src/lib/cards.ts` missing those fields.

## Consequences

Extend `Card` / `CardExtras` with holder, owner, reviewer, type (`story|bug|chore`), links (`blocks|blocked_by|relates|duplicates`), labels, area, risk and release; validate on write; migrate `cards.json`. — matches the design's "one home" on the story and the api-first build order in the ui-rebuild decision. The other options are not built; reopening one is a new decision.
