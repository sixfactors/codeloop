# c-118 research: Stories carry a holder, an owner, a type and links

## What exists

exists: build — `src/lib/cards.ts` carries StoryFields (story, size, initiative, feature, …) and CardExtras (`after`, `ticket`, `split_from`, …) but no holder, owner person, reviewer person, type, links, labels, area, risk or release. Gate `awaiting` is a role name, not who holds the card; `after` queues a story, it is not a typed link. The target fields are named in the design and in `.codeloop/wiki/architecture/ui.md`; nothing stores them yet.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

## Options

- Extend `Card` / `CardExtras` with holder, owner, reviewer, type (`story|bug|chore`), links (`blocks|blocked_by|relates|duplicates`), labels, area, risk and release; validate on write; migrate `cards.json`. Chosen — matches the design's "one home" on the story and the api-first build order in the ui-rebuild decision.
- Keep a sidecar metadata file keyed by card id. Rejected — screens and the SDK would join two stores for every read; the design puts every field on the story.
- Derive holder only from `events` / `awaiting` and skip schema. Rejected — type, links, labels and area cannot be derived, and history already lives in events while the current holder still needs a field.

## The pain, grounded

pain: a founder cannot answer "who has this" from the board — cards have no holder, no accountable owner person, no type and no typed links, so people ask in chat instead of reading the story. Source: docs/artifacts/codeloop-ui-design.html ("An agent is a teammate… so 'who has this' always has an answer"; story fields table) and the card story on c-118 ("nobody asks who has this"). Confirmed by `src/lib/cards.ts` missing those fields.

## Risks

- Every existing `cards.json` entry must migrate without breaking compare-and-swap writes or cloud sync.
- `awaiting` (gate role) and `holder` (person or agent) can be confused if both stay without a clear rule in the schema docs.
- Downstream cards (board states, Up next, CLI link/label/hand-off) assume these fields; inventing a different shape here forces rework there.
- A `blocked_by` link that never clears would starve Up next if that rule ships before link editing does.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:176 - story fields: holder, owner, reviewer, type, links, labels, area, risk, release
- source: src/lib/cards.ts:26 - StoryFields and CardExtras have no holder, type or links today
- source: .codeloop/wiki/architecture/ui.md:29 - target story fields and api-first build order (c-118 first)
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md - initiative adopts the design; data layer before screens

verdict: build
