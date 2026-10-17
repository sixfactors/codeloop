# c-314 data model: Several small stories build together in one turn

No task is tagged `[data]` and spec.md names no `entities:`. Nothing new is stored.

## Entities

| Entity | Change | Why |
|---|---|---|
| OrchTurn (`.codeloop/state/orch/<card>.json`) | new optional `batch: { id, cards }` | Each batched story keeps its own turn record and names the batch and the stories built with it |
| Lease (`.codeloop/state/active/orch-<card>.json`) | unchanged, one per batched story | Each story's planned files stay leased by that story alone, so a failed story's lease can be dropped on its own |
| Activity line (`kind: orch-batch`) | new kind on each batched story | The story page names the batch and the other stories in it |

## Stores

None added.

## Indexes

None.

## Migration

None. A turn record with no `batch` field is a story built alone.
