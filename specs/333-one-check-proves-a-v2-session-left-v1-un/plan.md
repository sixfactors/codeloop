# c-333 plan: One check proves a v2 session left v1 untouched

## Layers touched

test (a shell script with its node core, the vitest setup, one test file).

## Files

- scripts/v1-untouched.sh
- scripts/v1-untouched.mjs
- vitest.setup.ts
- src/lib/__tests__/v1-untouched.test.ts
- specs/333-one-check-proves-a-v2-session-left-v1-un/

## Risks

- A normal v1 write during the session reads as damage: the board is compared as a prefix per card (count and hash of the events at the snapshot against the first that many events now), so an appended event passes.
- A v2 write that drops an old event passes because the board grew: the prefix hash catches a removed or edited old event whatever the count did.
- The compare hashes the link and not its target: every path is resolved with realpath before hashing, and the fixture test changes the target behind an unchanged link.
- A test writes under the real home and nobody notices: vitest.setup.ts compares the real home's v1 files before and after each test file and fails that file by name.
