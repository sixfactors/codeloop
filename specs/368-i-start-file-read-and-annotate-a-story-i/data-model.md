# c-368 data model

No data change. No new entity, field, index or file. The stage check passed on skip_when (no `[data]` task, no `entities:` list in spec.md); this page records why that is true rather than leaving it implied.

## Entities

| Entity | Change | Reason |
| --- | --- | --- |
| Card (`.codeloop/cards.json`) | none | `description`, `bug`, `size`, `parked_from` already exist. `card edit --description` appends to the existing string. `bug` files a card with fields `card new` already writes. |
| Card event | two new `action` values, `release` and `hold-expired` | `events` is an open array of `{ at, actor, action, stage, note }`; readers switch on `action` and ignore ones they do not know. |
| Session hold (`.codeloop/state/active/<session>.json`) | none to the shape | The file's modification time becomes the hold's "last seen" time: a prompt, tool call or file write touches it. A hold quiet for `monitor.stall_minutes` is ignored by readers; the file is not deleted and no field is added. |

## Stores

Already on the architecture page: `cards.json` and `state/active/`. No store is added.

## Indexes

None. Expiry reads one `mtime` per session file, and the activity stream is not scanned.

## Migration

None. Existing session files carry a modification time already, and an old hold that is quiet is treated as expired the next time it is read. Existing parked cards already hold `parked_from`; the display change reads it.
