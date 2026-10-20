# c-362 plan: I approve and answer from chat, and the page loads fast and lists every artifact

## Layers touched

api (approve with conditions, card reads, artifacts list), sdk (the approve option), ui (gate button, waived findings, loading frame), test (the route and the cold read).

## Files

- `src/lib/services.ts`: `approveWithConditions` joins `acceptAllAnswers` (src/lib/interview.ts:236) and the approve flow, checking every open item has a recommendation before writing anything.
- `src/commands/card.ts`, `src/lib/server.ts`, `src/sdk/client.ts`: `--accept-recommended`, the `accept` field on the approve route, the SDK option.
- `workspace/components/shared/questions.tsx`, `workspace/components/shared/card-detail.tsx`, `workspace/hooks/use-api.ts`: the button, the confirm step, the Waived findings fold.
- `workspace/app/cards/[id]/loading.tsx`: the frame painted while the server renders.
- `src/lib/server.ts`: card reads no longer wait on `index.ready`.
- `src/lib/store/file.ts`, `src/lib/artifact.ts`: the nested artifacts list, ordered.

## Risks

- A finding answered `waived` must still read as answered to `check questions`, or approve with conditions rolls back at the next check.
- Reading the store while the index rebuilds can show a card a moment older than the index would; the index catches up on its next event.
- A nested page with no kind suffix must not be labelled a mock (src/lib/artifact.ts:278).
