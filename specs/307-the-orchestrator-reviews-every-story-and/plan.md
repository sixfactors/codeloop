# c-307 plan: The orchestrator reviews every story and fixes what is wrong before it picks the next one

## Layers touched

api (engine and orchestrator), test, docs. No screen: the inbox and the story page already show events and questions.

## Files

- src/lib/review-pass.ts
- src/lib/engine.ts
- src/lib/interview.ts
- src/lib/run.ts
- src/commands/orch.ts
- src/lib/__tests__/review-pass.test.ts
- site/content/docs/concepts/orchestrator-and-workers.md

## Risks

- An orchestrator that moves stories can move them wrongly; every verb stops before a gate and writes its evidence on the event.
- Docs-only and mock-only commits under a story id look like merged work; the plan step counts only changes outside .codeloop, docs and the resolved mock target.
- The owner-only verbs need an orchestrator role rule bounded by gates, not a bypass of the owner check.
