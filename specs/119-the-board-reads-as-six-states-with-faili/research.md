# c-119 research: The board reads as six states with failing and blocked flags

## What exists

exists: unlock, `src/lib/states.ts` — six DisplayStates and the `failing` flag are derived and already served on GET `/api/board` and GET `/api/home` (`index.display`, `boardView` / `homeView`). `StateFlag` lists `blocked` but `storyState` never sets it, and card links do not exist yet (c-118).

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

## Options

- Keep `storyState` as the single derivation; finish the `blocked` flag once c-118 lands typed links (`blocked_by` when the target is not done); leave `stuck` as today (Needs you via gate, also a flag). Chosen — matches the design and the api-first order (fields → states → screens).
- Rebuild state mapping inside the board UI from raw stage/gate. Rejected — the design and ui.md put derivation server-side so every screen and the SDK share one answer.
- Treat the card as done and close it (six states + failing already ship). Rejected — the title and `[api]` note require the blocked flag from links; closing would leave a typed-but-dead flag.

## The pain, grounded

pain: today's board is one row of stage columns per workflow (nine stages), so a founder cannot read status at a glance. Source: docs/artifacts/codeloop-ui-design.html ("Today's lanes and nine stages are too many to read. People need six states") and `.codeloop/wiki/decisions/ui-rebuild-bottom-up.md` (nine stage columns per workflow were confusing to read and act from).

## Risks

- Finishing `blocked` before c-118's links land would invent a second link store or fake it from `after`; that drifts from the story-fields design.
- Confusing `stuck` (retries exhausted → Needs you) with `failing` (retries > 0, still In progress with a flag) would hide work that is still moving.
- Screen cards (c-136 board swimlanes) will assume `display.state` and `flags` stay stable; changing the six labels or making failing force Needs you would break Home and Board contracts already in `services.ts`.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:195 - six states, stage as sub-label, failing and blocked flags
- source: src/lib/states.ts:9 - DISPLAY_STATES and storyState; blocked typed but never set
- source: src/lib/services.ts:751 - boardView groups by display.state for GET /api/board
- source: .codeloop/wiki/architecture/ui.md:35 - target states and flags; Needs you overlays gates, questions, failures

verdict: build
