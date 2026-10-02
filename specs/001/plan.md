# CL-001 plan: lane engine with enforced gates

## Layers touched

api (the CLI and its library), test, docs. No sdk or ui work.

## Files

- `src/lib/cards.ts`, `src/lib/engine.ts`, `src/lib/lane.ts`, `src/lib/proposals.ts`, `src/lib/run.ts`
- `src/commands/card.ts`, `src/commands/lane.ts`, `src/commands/guard.ts`
- `templates/lanes/*.yaml`

## Risks

- `--as owner` is a convention and does not authenticate the caller.
- The version check has a short window between re-read and rename.
