# c-365 plan: The lane limit, small-story carry and batches behave the same on every path

## Layers touched

api only (library code and config). No SDK, UI or screens.

## Files

- src/lib/check-timeout.ts (new): reads `checks.timeout_minutes`, falls back to 10, applies a floor, detects a kill and words the note.
- src/lib/engine.ts, run.ts: stage check and the doctor's inline check and tick use the setting; a kill is a crash.
- src/lib/handback.ts, gate.ts: proof and gate rerun use it and record "timed out".
- src/lib/verify.ts, health.ts, proposals.ts, orch.ts: use cases, lint and type, evals and `after_merge`, with the 15 minute floor on setup and post-merge.
- src/lib/services.ts: `splitCard` passes `projectDir` to the lane-limit check.
- src/lib/__tests__/check-timeout.test.ts, CHANGELOG.md, docs/config-reference.md.

## Risks

- A bad value must not remove the limit: it falls back to 10 (tested).
- A killed proof must not read as a plain failure: it says "timed out after N min" and names the setting (tested).
- Raising the limit lets a hung check hold a slot longer; the default stays 10, so existing projects do not change.
