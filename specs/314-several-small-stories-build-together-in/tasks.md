# c-314 tasks: Several small stories build together in one turn

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US4] [api] Form a batch: trivial and S stories at build whose planned files do not overlap, at most five, features mixed, the rest left for the next batch, in src/lib/orch-isolation.ts
- [ ] T002 [US1] [api] One brief listing each batched story's tasks, planned files and commit trailer, with a lease taken per story, in src/lib/orch.ts
- [ ] T003 [US1] [api] One hand-back per batched story from the same turn, each with its own head and proof, in src/lib/handback.ts
- [ ] T004 [US2] [api] Settle each batched story on its own hand-back, its own trailered commits and its own scope, and advance each through its own check, in src/lib/orch.ts
- [ ] T005 [US3] [api] A failing story leaves the batch: its lease is dropped, the failure is named on it, it gets its own next turn, and the others still advance, in src/lib/orch.ts
- [ ] T006 [US5] [api] An activity line on each batched story naming the batch and the stories built with it; approvals stay per story, in src/lib/orch.ts
- [ ] T007 [US2] [test] One test per failure mode uc-314-01 to uc-314-07 in src/lib/__tests__/orch-batch.test.ts, each seen failing once with the fix reverted

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 in specs/314-several-small-stories-build-together-in/spec.md:14, spec.md:17 and spec.md:38; Q2 in spec.md:16; Q3 in spec.md:17 and spec.md:18; Q4 in spec.md:10, spec.md:15, spec.md:18 and spec.md:39; mapping at spec.md:27
- S6 pass: specs/314-several-small-stories-build-together-in/spec.md:34 lists merged stories, shared files, more than five, one approval per batch and M or L stories as not built
