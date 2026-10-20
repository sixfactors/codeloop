# c-365 tasks: The lane limit, small-story carry and batches behave the same on every path

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [api] `checkTimeoutMs` reads `checks.timeout_minutes` (default 10, bad value means 10, optional floor) in src/lib/check-timeout.ts (d26e464)
- [x] T002 [US1] [api] Stage checks and the doctor's inline check and tick use the setting in src/lib/engine.ts and src/lib/run.ts (d26e464)
- [x] T003 [US1] [api] Hand-back proof, gate rerun, `verify` use cases, health lint and type commands, lane-proposal evals and `orch.after_merge` use the setting, setup and post-merge keep a 15 minute floor, in src/lib/handback.ts, gate.ts, verify.ts, health.ts, proposals.ts and orch.ts (d26e464)
- [x] T004 [US2] [api] A killed command says "timed out after N min" and names the setting; proof and gate record it as timed out; a killed lint reads as unmeasured, in src/lib/check-timeout.ts, handback.ts, gate.ts and health.ts (d26e464)
- [x] T005 [US3] [api] `splitCard` passes `projectDir` to the lane-limit check in src/lib/services.ts (d26e464)
- [x] T006 [US1] [test] One test per failure mode in src/lib/__tests__/check-timeout.test.ts, seen red with the setting ignored and the split fix reverted: 7 of 7 failed (d26e464)
- [x] T007 [US1] [docs] CHANGELOG.md line and the `checks.timeout_minutes` row in docs/config-reference.md (d26e464)

## Rubric

- S3 pass: Q1 in `scope:`, Q2 in `unit and default:`, Q3 in `split count:`, all under `## Decisions` in specs/365-the-lane-limit-small-story-carry-and-bat/spec.md
- S6 pass: the `## Not building` list in specs/365-the-lane-limit-small-story-carry-and-bat/spec.md excludes a per-stage timeout, a larger constant, memory waiting and the other carry, batch and priority items
