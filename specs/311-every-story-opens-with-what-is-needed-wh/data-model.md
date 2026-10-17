# c-311 data model: Every story opens with what is needed, what is done and what I must do

## Entities

- Card (extended): `summary`, optional. `{ needed?: SummaryLine, done?: SummaryLine }`. A card written before this story has none and still loads.
- SummaryLine: `{ text, by, kind, step, at }`. `text` is one plain sentence. `by` is who wrote it (`owner`, `reviewer`, or the agent's name). `kind` is `person` or `agent`. `step` is the stage the card was on when the line was written. `at` is the ISO time of the write.
- The "what you must do" line is not stored. It is worked out on every read from the board's own facts: the gate the card waits at, its open questions, its stuck explanation (c-308), or who holds it. A stored text can therefore never hide a gate.

## Stores

- `.codeloop/cards.json`: the only store. `summary` sits on each card beside `retries` and `events`. Every write goes through `writeCards`, whose version check refuses a write made from a stale read; the summary write re-reads and merges again when that happens, so an owner's edit and an agent's hand-back landing together both survive.
- `.codeloop/state/handbacks/*.json`: unchanged. A hand-back that carries summary lines writes them to the card; the record keeps its existing fields.

## Indexes

None. The project index in `src/lib/index/index.ts` is rebuilt from `cards.json`; the summary is read only by the full story response, not filtered on.

## Migration

None to run. `summary` is optional: a card without it reads as "not yet written by an agent" and shows lines worked out from the board. A line from an earlier step is shown as written before the latest step; nothing is rewritten on disk. An agent write never replaces a line whose `kind` is `person`; a person's write replaces either kind.
