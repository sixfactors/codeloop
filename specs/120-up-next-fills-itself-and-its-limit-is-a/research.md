# c-120 research: Up next fills itself and its limit is a setting

## What exists

exists: build — `storyState` already maps `queued` → display Up next and `proposed` → Backlog (`src/lib/states.ts`), and `boardView` optionally reads `board.up_next.limit` for the count chip (`src/lib/services.ts`). There is no validated config for `board.up_next.limit` / `auto_refill`, no refill that pulls ranked Backlog/Plan stories into the queue, and no skip of blocked stories. Lane `wip` plus `promoteQueued` only promote queued cards into the lane's first stage when workable slots open; that caps In progress, not the Up next buffer.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

## Options

- Add `board.up_next.limit` (default 6) and `auto_refill` in config; on every board-changing write, while under the limit, move the top ranked Backlog/Plan stories into `queued` (Up next), skipping blocked; keep lane `wip` for In progress. Chosen — matches the design, the owner's c-100 clarification, and this card's `[api]` note; Settings UI stays for later (c-139).
- Reuse lane `wip` as the Up next limit. Rejected — `wip` counts workable (in-lane, not at a gate) cards; the design separates a ready queue of N from how many agents may work at once.
- Manual drag from Plan into Up next only. Rejected — the story requires auto refill so agents never wait for the founder to pick the next card.

## The pain, grounded

pain: agents sit idle until a founder manually picks the next story, because nothing keeps a fixed ready queue filled from the ranked plan. Source: docs/artifacts/codeloop-ui-design.html ("Up next holds 6 and refills from the top of this list"; sprints replaced by "Up next with a limit") and the card story ("keep six stories ready and refill from the top of the plan, so that agents never wait for me to pick work"). Owner already chose default 6 + auto refill in specs/100/spec.md clarifications; c-109 was dropped as superseded by this card.

## Risks

- Confusing `lane.wip` with `board.up_next.limit` would either starve the queue or overfill In progress; tests must treat them as two caps.
- Skipping blocked stories before link edit ships (c-128) can park a card with no owner path to clear the link; c-119's interview deferred engine exclusion for that reason — if this card ships the skip, document how an owner unblocks (drop link once CLI exists, or clear `blocked_by` via a temporary escape).
- "Top of Plan" needs a stable rank (score / priority / drag order). Until Plan ranking lands (c-137), refill should use whatever rank `boardView` already sorts by (`score`, then `updatedAt`) so API and board agree.
- Settings page for the limit is out of scope here (api card); config keys alone must be enough for tests and later UI.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:314 — Up next holds 6 and refills from the top of Plan; blocked never enters Up next
- source: src/lib/states.ts:40 — queued maps to display up-next; proposed maps to backlog
- source: src/lib/services.ts:755 — boardView reads optional board.up_next.limit for the count chip only
- source: src/lib/engine.ts:512 — promoteQueued fills lane stages from queued under wip, not Up next from Plan
- source: specs/100/spec.md:46 — owner chose default limit 6, auto refill, board.up_next.limit / auto_refill

verdict: build
