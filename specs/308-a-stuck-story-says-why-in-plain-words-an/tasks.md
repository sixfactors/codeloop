# c-308 tasks: A stuck story says why in plain words and which action will move it

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [US1] [api] One stuck explanation beside stuckReason: work tried at this step (from the same facts as workTried), shipped commits outside docs, .codeloop and the mock target, and one action from a fixed list, in src/lib/cards.ts and src/lib/journey.ts
- [ ] T002 [US2] [api] The offered actions: move to the step the shipped work shows, stopping before the first gate, and one more agent try only when the work changed since the last try, in src/lib/story-control.ts and src/lib/services.ts
- [ ] T003 [US3] [api] A broken check reads as the check broke, with the step and time, and keeps the raw error apart from the reason, in src/lib/journey.ts
- [ ] T004 [US4] [api] The inbox failing list drops a failure once a later check at the same step passed, in src/lib/inbox.ts
- [ ] T005 [US5] [api] `codeloop card show` and the inbox print the same explanation the page shows, in src/commands/card.ts and src/lib/inbox.ts
- [ ] T006 [US2] [sdk] The move-to-step action in the SDK and a hook for it, in src/sdk and workspace/lib/queries.ts
- [ ] T007 [US1] [ui] The explanation as the summary's "what you must do" line with the two buttons and Show the error, in workspace/components/shared/current-step-panel.tsx
- [ ] T008 [US1] [test] One test per failure mode uc-308-01 to uc-308-07 in src/lib/__tests__/stuck-explanation.test.ts, each seen failing once with the fix reverted

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 in specs/308-a-stuck-story-says-why-in-plain-words-an/spec.md:15 and spec.md:40; Q2 in spec.md:17; Q3 in spec.md:16; Q4 in spec.md:14 and spec.md:39; mapping at spec.md:28
- S6 pass: specs/308-a-stuck-story-says-why-in-plain-words-an/spec.md:35 lists moving stories alone, the summary card, extra buttons and the retry count as not built
