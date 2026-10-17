# c-313 plan: A small story runs its early stages in one agent turn

## Layers touched

api (lane, orchestrator, run, stats), test. No screen.

## Files

- src/lib/lane.ts
- src/lib/orch.ts
- src/lib/run.ts
- src/lib/stats.ts
- .codeloop/lanes/build.yaml
- templates/lanes/build.yaml
- src/lib/__tests__/stage-carry.test.ts

## Risks

- A long carried turn can hit the agent's time limit; the limit is summed over the carried stages and capped.
- Folding review into verify for S must move the reviewer's approval, not remove it.
- The orchestrator settles one hand-back per stage today; a carried hand-back must still credit each stage.
