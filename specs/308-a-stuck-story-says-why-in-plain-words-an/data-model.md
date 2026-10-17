# c-308 data model: A stuck story says why in plain words and which action will move it

## Entities

- StuckExplanation (computed, never stored): `{ kind, step, at, tried, shipped, action, buttons, moveTo?, error? }`. `kind` is `broken` (the check itself crashed), `shipped` (code under the story's id is merged), `changed` (the work changed since the last try) or `unchanged`. `buttons` holds at most `move` and `retry`. `error` is the raw check output, kept apart from the sentences.
- CardEvent (existing): a move out of stuck writes one `unstick` event and one `place` event by the owner, so the history says who moved it and why. No new event kind.

## Stores

- `.codeloop/cards.json`: unchanged in shape. The explanation is read from each card's events, its lane and the story's commits, and is never written back.
- `.codeloop/state/activity/*.jsonl`: read only, for work lines and passing check lines after the last failure.

## Indexes

None. The explanation is worked out for stuck stories only, when the story page, the inbox or `codeloop card show` asks.

## Migration

None. Old fail, stuck and check-error events read as they are: a stuck event's first note line is still the reason, and a check-error event marks the check as broken.
