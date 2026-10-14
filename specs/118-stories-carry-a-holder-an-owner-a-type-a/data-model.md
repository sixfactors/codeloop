# c-118 data model: Stories carry a holder, an owner, a type and links

## Entities

- Card (extended): `holder`, `owner`, `reviewer`, `type`, `links`, `labels`, `area`, `risk`, `release`. All optional, so a card written before this story is still valid.
- Person or agent reference: a string name. `holder`, `owner` and `reviewer` each hold one; an empty `holder` reads as Unassigned.
- Link: `{ type, to }`. `type` is one of `blocks`, `blocked_by`, `relates`, `duplicates`; `to` is the id of an existing card.
- Type: `story`, `bug` or `chore`. Absent means `story`.

## Stores

- `.codeloop/cards.json`: the only store. The new fields sit on each card beside `retries` and `events`.

## Indexes

None. The project index in `src/lib/index/index.ts` is rebuilt from `cards.json`; it gains `holder` and `type` as filter keys in the query story (c-122), not here.

## Migration

None to run. Every new field is optional, so an old `cards.json` loads unchanged: a missing `type` reads as `story`, a missing `holder` as unassigned, a missing `owner` as the card's creator, and a missing `links` as empty. Fields are written on the next edit; `version` does not change shape.
Writes validate `type`, link types and that each `to` exists. A `blocks` or `blocked_by` link is written on both cards in one `writeCards` call under `withLock`, so a concurrent holder write is refused with `ConflictError` instead of lost.
