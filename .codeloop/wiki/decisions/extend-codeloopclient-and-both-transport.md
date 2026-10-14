---
title: Extend CodeloopClient and both transports with typed methods for
scope:
  - src/lib/__tests__/sdk.test.ts
  - workspace/lib/api.ts
  - .codeloop/wiki/features/ui-sdk.md
  - docs/architecture.md
  - .codeloop/wiki/architecture/invariants.md
  - .codeloop/wiki/architecture/ui.md
  - src/sdk/client.ts
freq: 1
severity: warning
cards:
  - c-127
updated: 2026-10-14
---

## Options

- Extend `CodeloopClient` and both transports with typed methods for every screen endpoint (home, board, plan, releases, story, wiki), the query / saved-views / bulk-change ops from c-122, plus shared query keys and React hooks published from the SDK (React Query as a peer). Keep `workspace/lib/api.ts` a thin wrapper. Chosen — matches the card description ("Client methods and React hooks … query keys; contract tests"), `.codeloop/wiki/features/ui-sdk.md`, and the onion rule that CLI and UI are peers on the SDK.
- Add only client methods on `Transport` / `CodeloopClient`; leave hooks and `QK` in `workspace/`. Rejected — the card and feature wiki name hooks and query keys; two surfaces would drift the way the layering invariant exists to prevent.
- Generate the client from OpenAPI or another schema dump. Rejected — the onion already has one `Transport` with http and local twins; a generated third source of truth would fight `sdk.test.ts` and the services layer.

## Why

a builder wiring a new screen or a CLI command invents fetch shapes and cache keys in the UI while the SDK still only covers home/board and resource routes, so the CLI and the board cannot share one typed client for plan, releases, story, wiki, query or bulk change. Source: card story on c-127 ("so that the CLI and the UI share one client"), `docs/architecture.md` (CLI + UI are thin peers on the SDK; UI must not define an API type twice), `.codeloop/wiki/architecture/invariants.md` ("A command reaches the engine through the SDK"), and `.codeloop/wiki/architecture/ui.md` (build order: api → sdk → cli → screens). Confirmed by `src/sdk/client.ts` having `home`/`board` only among screen views, no query/bulk ops, and hooks living only under `workspace/`.

## Consequences

Extend `CodeloopClient` and both transports with typed methods for every screen endpoint (home, board, plan, releases, story, wiki), the query / saved-views / bulk-change ops from c-122, plus shared query keys and React hooks published from the SDK (React Query as a peer). Keep `workspace/lib/api.ts` a thin wrapper. — matches the card description ("Client methods and React hooks … query keys; contract tests"), `.codeloop/wiki/features/ui-sdk.md`, and the onion rule that CLI and UI are peers on the SDK. The other options are not built; reopening one is a new decision.
