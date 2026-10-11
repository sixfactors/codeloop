# Invariants

## A write from a stale read is refused

`writeCards` re-reads `.codeloop/cards.json` under a lock and throws `ConflictError` when the version moved. Without it two processes both pass their check and the later rename silently drops the earlier card change.

- enforced by: `src/lib/cards.ts`
- tested by: `src/lib/__tests__/concurrency.test.ts`

## Only the lock holder reads, decides and writes

`withLock` creates `<file>.lock` exclusively and breaks it only when the holder's pid is gone or it is 5 minutes old. Without it a read-then-rename on the task list, the skills index or the last-run record loses writes.

- enforced by: `src/lib/lock.ts`
- tested by: `src/lib/__tests__/concurrency.test.ts`

## An agent cannot approve a gate

`resolveRole` refuses any role but agent while `CODELOOP_AGENT_RUN` is set, and lane lint accepts only owner or reviewer as approver. Without it an agent runs `codeloop approve --as owner` on its own work.

- enforced by: `src/lib/engine.ts`
- tested by: `src/lib/__tests__/agent.test.ts`

## An approval covers the work that was approved

The approve event stores a fingerprint of the stage output and check; `advanceCard` re-parks the card when it differs. Without it an agent edits the output after the owner said yes.

- enforced by: `src/lib/engine.ts`
- tested by: `src/lib/__tests__/review.test.ts`

## A command reaches the engine through the SDK

A migrated command file that imports from the lib folder fails the test suite. Without it the CLI and the board drift: a card made in one skips the story check of the other.

- enforced by: `src/__tests__/layering.test.ts`
- tested by: `src/__tests__/layering.test.ts`

## A write needs the start-up token

The server answers only to a loopback host, sends no CORS headers, and refuses a write without the token, a JSON content type and a same-origin request. Without it any web page the owner visits can approve cards.

- enforced by: `src/lib/server.ts`
- tested by: `src/lib/__tests__/cards-api.test.ts`

## A card id never reaches a shell unquoted

Ids match letters-dash-digits and `substitute` quotes every placeholder in a `done.cmd`. Without it a hostile title or id runs as a command.

- enforced by: `src/lib/lane.ts`
- tested by: `src/lib/__tests__/security.test.ts`

### Sharp edges

- `src/__tests__/layering.test.ts` is its own enforcer and proof; its fourth case feeds it a bad import to show it can fail (`src/__tests__/layering.test.ts`).
- The agent-approval test starts a real subprocess calling the built CLI, so it needs `npm run build` first (`src/lib/__tests__/agent.test.ts`).
