# c-127 research: The SDK has typed calls for every screen, query and bulk change

## What exists

exists: build — `@protoboxai/codeloop/sdk` already ships `CodeloopClient` over http and local transports (`src/sdk/`), with typed `home.get()` / `board.get()`, resource ops (cards, inbox, pages, wiki utilities), and dual-transport contract tests in `src/lib/__tests__/sdk.test.ts`. It does not yet expose plan, releases, story-screen or wiki-screen views; has no query-language, saved-views or bulk-change methods; and React hooks / query keys live only in `workspace/` (`hooks/use-api.ts`, `lib/queries.ts`), not in the published package. The root package has no `@tanstack/react-query` dependency.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's own design: one typed client the CLI and the UI share for every screen call, the query bar and bulk change.

## Options

- Extend `CodeloopClient` and both transports with typed methods for every screen endpoint (home, board, plan, releases, story, wiki), the query / saved-views / bulk-change ops from c-122, plus shared query keys and React hooks published from the SDK (React Query as a peer). Keep `workspace/lib/api.ts` a thin wrapper. Chosen — matches the card description ("Client methods and React hooks … query keys; contract tests"), `.codeloop/wiki/features/ui-sdk.md`, and the onion rule that CLI and UI are peers on the SDK.
- Add only client methods on `Transport` / `CodeloopClient`; leave hooks and `QK` in `workspace/`. Rejected — the card and feature wiki name hooks and query keys; two surfaces would drift the way the layering invariant exists to prevent.
- Generate the client from OpenAPI or another schema dump. Rejected — the onion already has one `Transport` with http and local twins; a generated third source of truth would fight `sdk.test.ts` and the services layer.

## The pain, grounded

pain: a builder wiring a new screen or a CLI command invents fetch shapes and cache keys in the UI while the SDK still only covers home/board and resource routes, so the CLI and the board cannot share one typed client for plan, releases, story, wiki, query or bulk change. Source: card story on c-127 ("so that the CLI and the UI share one client"), `docs/architecture.md` (CLI + UI are thin peers on the SDK; UI must not define an API type twice), `.codeloop/wiki/architecture/invariants.md` ("A command reaches the engine through the SDK"), and `.codeloop/wiki/architecture/ui.md` (build order: api → sdk → cli → screens). Confirmed by `src/sdk/client.ts` having `home`/`board` only among screen views, no query/bulk ops, and hooks living only under `workspace/`.

## Risks

- c-121 (screen GETs) and c-122 (query / saved views / bulk) own the API shapes; shipping SDK methods before those routes land forces stub types or a second pass. Sequence: api cards first, then this card's methods over the real contracts.
- Publishing React hooks from `@protoboxai/codeloop/sdk` needs optional peer deps (`react`, `@tanstack/react-query`) and a subpath or guarded export so the CLI / local transport path stays free of React. `docs/architecture.md` today says the UI owns hooks — this card deliberately moves shared keys and hooks into the SDK; update that line when the code lands.
- Moving `QK` into the SDK without preserving exact key shapes breaks dehydrated prefetch in the Next app; migrate keys with a test that the workspace dehydrate and the hook ask for the same tuples.
- Contract tests must exercise every new op on both http and local transports (`sdk.test.ts` pattern); an http-only method reintroduces CLI/UI drift.
- Scope bleed into CLI cards (c-128, c-129) and screens (c-133–c-139): this card owns typed calls, keys and hooks; those cards own commands and chrome.

## Sources

- source: docs/architecture.md:12 — SDK sits under CLI and UI; both are thin peers on CodeloopClient
- source: src/sdk/client.ts:257 — board.get and home.get exist; no plan, releases, story or wiki screen client
- source: workspace/lib/queries.ts:32 — QK and screen query options live in the app, not the published SDK
- source: .codeloop/wiki/architecture/ui.md:63 — build order names sdk as c-127 after the api layer
- source: .codeloop/wiki/features/ui-sdk.md — feature: typed client and React hooks over the screen endpoints
- source: .codeloop/wiki/decisions/i-can-find-any-story-with-a-query-and-ch.md — c-122 chose API-only; SDK is this card
- source: src/lib/__tests__/sdk.test.ts — dual-transport contract tests already gate the SDK surface
- source: docs/artifacts/codeloop-ui-design.html — target screens the typed calls must cover

verdict: build
