# c-121 research: Each screen loads its data with one call

## What exists

exists: build — GET `/api/home` and GET `/api/board` already return pre-joined screen views (`homeView` / `boardView` in `src/lib/services.ts`, wired in `src/lib/server.ts`). There is no GET `/api/plan`, `/api/releases`, `/api/stories/:id` or `/api/wiki/:path`. Plan still fans out initiative trees and features in the browser (`workspace/app/roadmap/page.tsx`); the story page joins `useCard`, `useCardFull` and `useQuestions`; wiki reads a page then searches for backlinks; releases have no API. Resource routes (`/api/cards/:id/full`, `/api/pages/*`, `/api/initiatives/:id/tree`, `/api/wiki/shape`) are building blocks, not the six screen contracts the card names.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's own design: each place (Home, Board, Plan, Releases, Story, Wiki) loads from one screen-shaped call, not a client join of resource APIs.

## Options

- Add screen-shaped GETs for the four missing places (`/plan`, `/releases`, `/stories/:id`, `/wiki/:path`), matching the `/home` and `/board` pattern already in `services.ts`, and keep resource routes for writes and CLI. Chosen — matches the card description, the ui-rebuild decision (API before screens), and `docs/architecture.md` ("UI must not … join or aggregate what the API can serve pre-joined").
- Keep resource APIs and join in React Query on each screen. Rejected — contradicts the architecture rule and the card's "so that" (never join in the browser); Plan and Story already show the fan-out cost.
- One GraphQL or catch-all BFF instead of six GETs. Rejected — overkill for a local file store; the onion already has one service function per screen view.

## The pain, grounded

pain: a founder opening Plan, a story or the wiki waits on several API round-trips and still risks a wrong join in the browser, so screens feel slow and the proof is not on the same payload. Source: `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof), `docs/architecture.md` (UI must not join pre-joinable data), and today's Plan/Story hooks that fire multiple queries. Confirmed by `/api/plan` and `/api/releases` being absent while `/api/home` and `/api/board` already work.

## Risks

- Scope bleed into c-122 (query/bulk), c-123 (release notes from tags) and c-124 (wiki owner / verified / changed-by): this card owns the view shapes and routes; those cards own the fields and write paths those views will later include.
- `/stories/:id` vs existing `/api/cards/:id` and `/api/cards/:id/full` — two read shapes for one object unless the story view wraps or replaces `cardFull` without breaking the SDK.
- `/wiki/:path` colliding with `/api/wiki/entries|inject|lint|outline|shape` — use a distinct path segment (e.g. `/api/wiki/page/:path` or `/api/wiki/pages/*`) if Hono routing would shadow the utility routes.
- Shipping empty plan/releases shells before c-118 fields and c-123 tags land would force a second shape change; stub with what exists and extend, do not invent parallel schemas.

## Sources

- source: docs/artifacts/codeloop-ui-design.html - target screens: Home, Board, Plan, Releases, Story, Wiki
- source: src/lib/services.ts:709 - homeView and boardView already implement one call per screen
- source: src/lib/server.ts:367 - GET /api/board and GET /api/home wired; no /plan or /releases
- source: docs/architecture.md:27 - UI must not join what the API can serve pre-joined
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md - api and one call per screen before SDK and screens
- source: workspace/app/roadmap/page.tsx:5 - Plan still loads one tree request per initiative in the browser

verdict: build
