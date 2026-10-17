---
title: Relayed chat decisions, one-step approval, a fast page, every artifact
scope:
  - src/lib/engine.ts
  - src/lib/cards.ts
  - src/lib/services.ts
  - src/lib/server.ts
  - src/commands/card.ts
  - src/sdk/client.ts
  - src/lib/store/file.ts
  - src/lib/artifact.ts
  - workspace/app/layout.tsx
  - workspace/components/shared/questions.tsx
freq: 1
severity: warning
cards:
  - c-362
updated: 2026-10-17
---

## Options

- **Relayed chat decisions, one-step approval, a fast page, every artifact.** Chosen. An owner action run from a session that is not the owner's terminal takes `--relayed "<the owner's reply, quoted>"`, and the event records the owner as decider, the session as relayer and the quote; without it, the command prints the decision as a plain-words question with the recommended answer for the orchestrator to put to the owner. `codeloop approve <card> --accept-recommended`, one API route and one board button record every recommended answer as the owner's and approve in one step, refused with nothing recorded when a question has no recommendation. A loading.tsx skeleton lets the story route paint its shell at once, and the card reads the page needs stop waiting on the index rebuild. Artifacts lists every page under docs/artifacts at any depth with its kind, plus every mock. It reuses acceptAll (src/lib/services.ts:531), the approve flow (src/lib/flow.ts:39) and allArtifactFiles (src/lib/artifact.ts:46), and touches `src/lib/engine.ts`, `src/lib/cards.ts`, `src/lib/services.ts`, `src/lib/server.ts`, `src/commands/card.ts`, `src/sdk/client.ts`, `src/lib/store/file.ts`, `src/lib/artifact.ts`, `workspace/app/layout.tsx` and `workspace/components/shared/questions.tsx`.
- **Owner actions only on the board or in the owner's terminal, with the orchestrator sending a link.** Lost: the owner asked to answer in chat, and a link per decision is the same number of steps as today.
- **Keep the index open forever, so it is never cold.** Lost: it fixes only the cold-index half. The page would still be blank while the server renders, and the hub keeps every project's index in memory.

## Why

the founder clears decisions in chat with the orchestrator and away from the keyboard. Each decision takes one command per question plus an approve, and none of it shows that the owner made the call. The owner's notes of 10-18 on c-361 and c-362 (.codeloop/cards.json) ask to "answer an owner decision in chat when the orchestrator asks it, with Codeloop recording the approval as given on my behalf". They also record that the story page "shows a blank state for about 2s though its data returns in 0.03s" and that the "Artifacts page lists only mocks, not system designs or plans". A response over 1 second breaks the user's flow of thought (Nielsen Norman Group), and a page should show its structure at once rather than a blank screen (MDN, perceived performance).

## Consequences

**Relayed chat decisions, one-step approval, a fast page, every artifact.** An owner action run from a session that is not the owner's terminal takes `--relayed "<the owner's reply, quoted>"`, and the event records the owner as decider, the session as relayer and the quote; without it, the command prints the decision as a plain-words question with the recommended answer for the orchestrator to put to the owner. `codeloop approve <card> --accept-recommended`, one API route and one board button record every recommended answer as the owner's and approve in one step, refused with nothing recorded when a question has no recommendation. A loading.tsx skeleton lets the story route paint its shell at once, and the card reads the page needs stop waiting on the index rebuild. Artifacts lists every page under docs/artifacts at any depth with its kind, plus every mock. It reuses acceptAll (src/lib/services.ts:531), the approve flow (src/lib/flow.ts:39) and allArtifactFiles (src/lib/artifact.ts:46), and touches `src/lib/engine.ts`, `src/lib/cards.ts`, `src/lib/services.ts`, `src/lib/server.ts`, `src/commands/card.ts`, `src/sdk/client.ts`, `src/lib/store/file.ts`, `src/lib/artifact.ts`, `workspace/app/layout.tsx` and `workspace/components/shared/questions.tsx`. The other options are not built; reopening one is a new decision.
