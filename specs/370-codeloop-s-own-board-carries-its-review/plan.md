# c-370 plan: Codeloop's own board carries its review verdicts, re-checks and dotfolder layout

## Layers touched

docs (evidence review verdicts, board housekeeping through codeloop commands).

## Files

- `evidence/097/review.md`, `evidence/098/review.md`, `evidence/102/review.md`: review verdicts, each through its own `codeloop next`.
- The hub registry, through `codeloop projects prune --write`.
- `specs/`, `evidence/`, `shape/` moved under `.codeloop/` by `codeloop store move --layout dotfolder`, only when nothing is untracked under specs/.

- `src/lib/services.ts`, `src/lib/engine.ts`, `src/lib/inbox.ts`: a split parent ends as split, not done.

## Risks

- The re-check runs after c-369 lands, or it reads the stale local main again.
