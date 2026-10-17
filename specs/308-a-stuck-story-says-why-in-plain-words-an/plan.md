# c-308 plan: A stuck story says why in plain words and which action will move it

## Layers touched

api (stuck explanation, actions, inbox, command line), sdk, ui (story page), test.

## Files

- src/lib/cards.ts
- src/lib/journey.ts
- src/lib/story-control.ts
- src/lib/services.ts
- src/lib/inbox.ts
- src/commands/card.ts
- src/sdk
- workspace/lib/queries.ts
- workspace/components/shared/current-step-panel.tsx
- src/lib/__tests__/stuck-explanation.test.ts

## Risks

- Naming the wrong action is worse than naming none; the action comes from a fixed list with the fact that chose it.
- The explanation must read the retry model's own facts, not a second copy of the rule.
- The summary card lands in its own story; until it does, the line shows in the current-step panel.
