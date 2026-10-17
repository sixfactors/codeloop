# c-313 data model: A small story runs its early stages in one agent turn

No task is tagged `[data]` and spec.md names no `entities:`. Nothing new is stored.

## Entities

| Entity | Change | Why |
|---|---|---|
| Stage (lane file) | new optional `carry: <group>` key | Consecutive stages with the same group run in one agent turn; a gate may sit only on the group's last stage |
| Stage (lane file) | new optional `fold: <stage id>` key on verify | When the card skips the named stage (review for an S story), its brief and its gate move onto this stage |
| OrchTurn (`.codeloop/state/orch/<card>.json`) | new optional `carried: string[]` | The stages one carried turn moved, so each is credited with the turn |
| CardEvent | `agent-run` written once per carried stage, same `log` | Each stage keeps its own agent run on the story page |
| CardEvent | `approve` gains an optional `gate` field | A stage with a folded gate needs to know which of its two gates an approval answered |

## Stores

None added. The orch record and the cards file are already where they were.

## Indexes

None.

## Migration

None. Every new key is optional; a lane without `carry` or `fold` runs exactly as before, and an old `approve` event with no `gate` field counts for the stage's own gate.
