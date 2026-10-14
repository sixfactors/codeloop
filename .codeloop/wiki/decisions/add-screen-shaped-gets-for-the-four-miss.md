---
title: Add screen-shaped GETs for the four missing places, matching the
scope:
  - src/lib/services.ts
  - src/lib/server.ts
  - workspace/app/roadmap/page.tsx
  - docs/architecture.md
  - .codeloop/wiki/initiatives/people-and-agents-workplace.md
freq: 1
severity: warning
cards:
  - c-121
updated: 2026-10-14
---

## Options

- Add screen-shaped GETs for the four missing places (`/plan`, `/releases`, `/stories/:id`, `/wiki/:path`), matching the `/home` and `/board` pattern already in `services.ts`, and keep resource routes for writes and CLI. Chosen — matches the card description, the ui-rebuild decision (API before screens), and `docs/architecture.md` ("UI must not … join or aggregate what the API can serve pre-joined").
- Keep resource APIs and join in React Query on each screen. Rejected — contradicts the architecture rule and the card's "so that" (never join in the browser); Plan and Story already show the fan-out cost.
- One GraphQL or catch-all BFF instead of six GETs. Rejected — overkill for a local file store; the onion already has one service function per screen view.

## Why

a founder opening Plan, a story or the wiki waits on several API round-trips and still risks a wrong join in the browser, so screens feel slow and the proof is not on the same payload. Source: `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof), `docs/architecture.md` (UI must not join pre-joinable data), and today's Plan/Story hooks that fire multiple queries. Confirmed by `/api/plan` and `/api/releases` being absent while `/api/home` and `/api/board` already work.

## Consequences

Add screen-shaped GETs for the four missing places (`/plan`, `/releases`, `/stories/:id`, `/wiki/:path`), matching the `/home` and `/board` pattern already in `services.ts`, and keep resource routes for writes and CLI. — matches the card description, the ui-rebuild decision (API before screens), and `docs/architecture.md` ("UI must not … join or aggregate what the API can serve pre-joined"). The other options are not built; reopening one is a new decision.
