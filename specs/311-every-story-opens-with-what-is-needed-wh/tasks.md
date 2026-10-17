# c-311 tasks: Every story opens with what is needed, what is done and what I must do

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US3] [api] A three-line summary on the story (needed, done, waiting on you), each line with its author, kind (agent or person), step and time, and a write that keeps every line a person wrote, in src/lib/cards.ts
- [ ] T002 [US3] [api] The agent writes or improves the summary at the end of its turn through the hand-back, and the stage brief footer asks for it, in src/lib/handback.ts and templates/orch
- [ ] T003 [US4] [api] The full story response carries the summary, or one worked out from the board's facts and marked unwritten when none exists, in src/lib/services.ts
- [ ] T004 [US5] [api] The response marks a summary written before the story's current step, and takes the waiting-on-you line from the board's holder, never from the text, in src/lib/services.ts
- [ ] T005 [US3] [sdk] A summary write in the SDK and a hook to edit one line from the page, in src/sdk and workspace/lib/queries.ts
- [ ] T006 [US1] [ui] A story summary card with who and when on each line and an Edit action, above the buttons and the step bar, in workspace/components/shared/story-summary.tsx and workspace/components/shared/card-detail.tsx
- [ ] T007 [US2] [ui] Fold checks and scores, history, raw output, tasks and commits and details under headings with counts, a failing check shown on its heading, in workspace/components/shared/card-detail.tsx
- [ ] T008 [US1] [test] One test per failure mode uc-311-01 to uc-311-07 in src/lib/__tests__/story-summary.test.ts and a story page browser test at phone width, each seen failing once with the fix reverted

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 in specs/311-every-story-opens-with-what-is-needed-wh/spec.md:14, spec.md:15 and spec.md:40; Q2 in spec.md:14 and spec.md:16; Q3 in spec.md:17; Q4 in spec.md:18; mapping at spec.md:27
- S6 pass: specs/311-every-story-opens-with-what-is-needed-wh/spec.md:34 lists the board and inbox, a separate model call, the stuck explanation and removing sections as not built
