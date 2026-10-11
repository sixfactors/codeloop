# Invariants

## Only the engine moves a card

Cards change stage in `advanceCard`, `approveCard` and `rejectCard`, by running the lane's check; a gate parks the card for its approver.

- enforced by: `src/lib/engine.ts`
- tested by: `src/lib/__tests__/lane-engine.test.ts`

## A stale write to cards.json is refused

`writeCards` rejects a write made from a read that is no longer current, so two processes cannot silently overwrite each other.

- enforced by: `src/lib/cards.ts`
- tested by: `src/lib/__tests__/concurrency.test.ts`

## A card id or lane id cannot leave its folder or reach a shell raw

Ids must match letters-dash-digits, and shell placeholders are quoted.

- enforced by: `src/lib/cards.ts`
- tested by: `src/lib/__tests__/security.test.ts`

## An agent starts at most max_runs_per_day times

The start is written as an event in the same write that checks the count, so parallel runs cannot exceed the cap.

- enforced by: `src/lib/run.ts`
- tested by: `src/lib/__tests__/agent.test.ts`

## The board answers only on localhost, and writes need the token

Host name, same-origin and the start-up token are all checked before any write route.

- enforced by: `src/lib/server.ts`
- tested by: `src/lib/__tests__/server.test.ts`

## A command talks to the SDK, not to src/lib

Commands import `src/lib` only where `EXEMPT_FILES` or `ALLOWED_IMPORTS` says so, with a reason.

- enforced by: `src/__tests__/layering.test.ts`
- tested by: `src/__tests__/layering.test.ts`

## A route and its local twin return the same thing

Each SDK operation runs through the http and the local transport against one temp project.

- enforced by: `src/sdk/client.ts`
- tested by: `src/lib/__tests__/sdk.test.ts`
