# c-368 plan: I start, file, read and annotate a story in one command each

## Layers touched

api (card commands, engine, holds), sdk (client methods), test, docs.

## Files

- `src/commands/card.ts`: `start <id>`, `bug`, `card release`, `card show` blanks, `card edit --description`.
- `src/lib/flow.ts`, `src/lib/engine.ts`: start at the start stage and set active; park clears the proposal flag; move passes a gate when code has landed.
- `src/lib/active-card.ts`, `src/lib/orch-isolation.ts`, `src/lib/services.ts`: holds ignored once quiet past `monitor.stall_minutes`, release events.
- `src/commands/guard-hooks.ts`: a returning session retakes its hold on the next prompt.
- `src/sdk/client.ts`: the new methods, so the CLI stays a thin peer on the SDK.
- `src/commands/__tests__/card-one-command.test.ts`: one test per failure mode.

## Risks

- Expiring a thinking session's hold frees its files; bounded by the full stall window and retake on next prompt.
- `card move` past a gate must still refuse when no code has landed, or it becomes a gate bypass.
- `bug` and `start` in an agent run must not reach the owner-only promote.
