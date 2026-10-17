# c-309 tasks: A check with no work behind it never counts as a failure

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

## Failure modes

1. A check on a stage output that is missing spends a retry, though nobody worked.
2. A check on an output that is still the template spec new wrote spends a retry.
3. A recheck with only engine or doctor lines since the last failure (a sweep, a folder made) spends a retry.
4. Over-correction: an agent run that left the output as it was stops counting, so a story never goes stuck.
5. Over-correction: a new head commit since the last failure is not counted as work.

## Tasks

- [x] T001 [US1] [api] Count a failed check only when work was tried since the last failed check (an agent run, a hand-back or session line, a new head commit, or a changed output that is not missing or the template), in src/lib/engine.ts; record the fail event either way
- [x] T002 [US1] [api] Share the missing-or-template test of a stage output from src/lib/stage-scaffold.ts so the engine and the doctor judge a scaffold the same way
- [x] T003 [US1] [test] One test per failure mode above through advanceCard and runDueWithAgent in src/lib/__tests__/check-retries.test.ts, each seen red on the old engine
- [x] T004 [US1] [test] Fixtures that relied on a missing output being counted now write real content: check-retries, flow and gates-runs-setup tests

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: <each interview answer and the spec.md field that holds it, path:line>
- S6 pass: <the not_building: line in spec.md, path:line>
