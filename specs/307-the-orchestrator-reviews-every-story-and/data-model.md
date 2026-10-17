# c-307 data model: The orchestrator reviews every story and fixes what is wrong before it picks the next one

The review pass adds one new file and writes into two stores that already exist. Nothing already stored changes shape.

## Entities

- ReviewPass (new): `at` (when the last complete pass ended, ISO time), `all` (whether it read every open story), `stopped` (the budget reason when it stopped early, else absent), `report` (the last pass's `fixed`, `asked` and `unclear` lines, each `{ id, verb, note, evidence }`). The cursor for "stories changed since the last pass" is `at`; it moves only when a pass reads every story it meant to, so a pass the budget stopped is read again next time.
- ReviewEvent (existing CardEvent, new use): actor `orchestrator`, `human: false`, action `place`, `close` or `review-write`, `stage`, and a `note` that starts `review pass:` and names the merged commit shas the decision rests on. No `skip` event is ever written by the pass.
- ReviewQuestion (existing Question, new use): `question` starting with the fixed prefix `Review:` and naming the story, the fix (gate, split, drop or a stage gap) and the evidence; `recommended` holds the answer the pass would take; `answer` is empty until the owner answers. The prefix is what stops a second pass asking the same question while one is open.
- MergedWork (computed, not stored): per story, the commits carrying its `Card:` or `Feature:` trailer that are reachable from the trunk and change at least one file outside `.codeloop/`, `specs/`, `evidence/`, `shape/`, `docs/`, `CHANGELOG.md` and the resolved mock target (`<mock.app_dir>/mocks/` when `mock.target` is `app`). Recomputed from git each pass.

## Stores

- ReviewPass: `.codeloop/state/review-pass.json`, one JSON object, rewritten whole at the end of each pass under `withLock`. Added to the architecture data-model page in this story.
- ReviewEvent: `.codeloop/cards.json`, appended to `card.events` through `placeCard`, `closeCard` and `recordEvent`, so the version counter guards concurrent writes as for every other event.
- ReviewQuestion: `specs/` per card, the story's `interview.md`, written only through `addQuestions` (`src/lib/interview.ts`), so the 12-question limit and the numbering hold.

## Indexes

none. The pass reads the board once per pass through `readCards` and story commits through the cached commit graph (`src/lib/commit-graph.ts`); "changed since the last pass" is a filter on `updatedAt` and the story's commit times against `review-pass.json`'s `at`, which is fast enough for the board's size (one read per story).

## Migration

none, because `.codeloop/state/review-pass.json` is created on the first pass; with no file every open story counts as changed, so the first pass is a full one. Events and questions use existing fields and shapes, so an old `cards.json` and old `interview.md` files load unchanged.
