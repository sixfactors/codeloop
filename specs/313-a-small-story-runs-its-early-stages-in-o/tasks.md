# c-313 tasks: A small story runs its early stages in one agent turn

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [api] A `carry` key on lane stages, refused when the carried stages are not consecutive or run past a gate, in src/lib/lane.ts, and set on research to spec in .codeloop/lanes/build.yaml and templates/lanes/build.yaml
- [ ] T002 [US1] [api] One brief for a carried turn listing each stage's skill, output and check, with the time limit summed over the carried stages and capped, in src/lib/orch.ts
- [ ] T003 [US1] [api] Settle a carried turn: one hand-back names every stage it moved, each stage advances only through its own check, and each gets its own agent-run event, in src/lib/orch.ts
- [ ] T004 [US2] [api] End a carried turn as soon as the story has open questions, recorded as waiting for answers, in src/lib/orch.ts and src/lib/run.ts
- [ ] T005 [US3] [api] End a carried turn at the first failed stage check, naming the failure on the story and writing no later stage, in src/lib/orch.ts
- [ ] T006 [US4] [api] Review runs `when: size >= M`; for an S story verify's brief carries the review triage and the reviewer's approval moves to verify, in src/lib/lane.ts and .codeloop/lanes/build.yaml
- [ ] T007 [US5] [api] Agent starts per story to the spec gate and from build to merged in `codeloop stats`, in src/lib/stats.ts
- [ ] T008 [US1] [test] One test per failure mode uc-313-01 to uc-313-07 in src/lib/__tests__/stage-carry.test.ts, each seen failing once with the fix reverted

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 in specs/313-a-small-story-runs-its-early-stages-in-o/spec.md:14 and spec.md:34; Q2 in spec.md:17 and spec.md:40; Q3 in spec.md:15; Q4 in spec.md:10 and spec.md:18; mapping at spec.md:27
- S6 pass: specs/313-a-small-story-runs-its-early-stages-in-o/spec.md:34 lists merging stages, carrying past the spec gate, session resume and dropping the reviewer's approval as not built
