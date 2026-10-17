# c-307 tasks: The orchestrator reviews every story and fixes what is wrong before it picks the next one

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [US1] [api] Plan step: read each open story and its story-id commits, count only changes outside .codeloop, docs and the resolved mock target, and plan one fix per story from a fixed verb list (place, close, write-stage, ask), in a new src/lib/review-pass.ts
- [ ] T002 [US1] [api] Apply step: place forward only when no gate lies between and close a merged and verified story, each writing an event that names the commits, through an orchestrator role rule on placeCard and closeCard in src/lib/engine.ts
- [ ] T003 [US2] [api] Write-stage verb: fill the stage file from its template with content drawn from the merged work and the code, then a gap review that turns each real gap into an inbox question through addQuestions; never write a skip event (src/lib/review-pass.ts, src/lib/interview.ts)
- [ ] T004 [US3] [api] Gate, split and drop fixes become one inbox question each with the recommended answer and leave the story where it is; a question already open on the story is not asked twice (src/lib/review-pass.ts)
- [ ] T005 [US4] [api] Run the pass at the start of each orchestrator pass and before each pick on stories changed since the last pass, and add `codeloop orch run --review` that reads every open story and stops at the run budget (src/lib/run.ts, src/commands/orch.ts)
- [ ] T006 [US5] [api] Pass report with fixed, asked and could-not-tell sections, each line naming the story and its evidence, printed by `codeloop orch run --review` (src/commands/orch.ts)
- [ ] T007 [US1] [test] One test per failure mode uc-307-01 to uc-307-07 in src/lib/__tests__/review-pass.test.ts, each seen failing once with the fix reverted
- [ ] T008 [US4] [docs] The review pass in the orchestrator protocol on site/content/docs/concepts/orchestrator-and-workers.md

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 answer in specs/307-the-orchestrator-reviews-every-story-and/spec.md:37 (Not building); Q2 in spec.md:14, spec.md:15, spec.md:16 and spec.md:38 to spec.md:39; Q3 in spec.md:17; Q4 in spec.md:10 (done_when) and spec.md:18; the mapping is listed at spec.md:24
- S6 pass: specs/307-the-orchestrator-reviews-every-story-and/spec.md:34 lists the edit guard (Q1), gate, split and drop without the owner (Q2) and any skipped stage (Q2) as not built
