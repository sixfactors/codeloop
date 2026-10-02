# CL-001 research: lane engine with enforced gates

## What exists
- `src/lib/board.ts` holds tasks with five fixed statuses and no gates; skills edit `.codeloop/board.json` by hand.
- Gotcha thresholds in `starters/*.yaml` (`critical_frequency`, `promote_frequency`) are read by no code.
- Prior art: a hosted board that enforces claim, show-local, owner-ok and ship actions with a work-in-progress limit of 2.

## Options
1. Hard-code the build stages in a gate module.
2. A generic engine that executes lane files, with build as one lane.

## Risks
- `--as owner` is a convention and does not authenticate the caller.
- The version check has a short window between re-read and rename.

verdict: build
