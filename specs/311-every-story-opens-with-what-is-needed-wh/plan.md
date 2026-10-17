# c-311 plan: Every story opens with what is needed, what is done and what I must do

## Layers touched

api (story store, hand-back, full story response), sdk, ui (story page), test.

## Files

- src/lib/cards.ts
- src/lib/handback.ts
- src/lib/services.ts
- src/sdk
- templates/orch
- workspace/lib/queries.ts
- workspace/components/shared/story-summary.tsx
- workspace/components/shared/card-detail.tsx
- src/lib/__tests__/story-summary.test.ts

## Risks

- A summary goes stale as the story moves; it carries its step, and the waiting-on-you line comes from the board.
- An agent could overwrite the founder's words; the write keeps every line a person wrote.
- Folding can hide a failing check; each folded heading keeps a count and shows a failure.
