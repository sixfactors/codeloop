# c-310 tasks: Every story shows its real working time and finds its own spec

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [api] Carry durationMs onto the mirrored agent-run line, src/lib/cards.ts
- [x] T002 [US1] [api] Working time = union of agent-run spans and person bursts (a lone line counts a minute), src/lib/activity.ts
- [x] T003 [US1] [test] Agent run, its own edits and a lone edit through recordEvent and readAllActivity, src/lib/__tests__/working-time.test.ts
- [x] T004 [US2] [api] One namer specFolderFor and one resolver pickSpecDir that repairs a missing spec field, src/lib/spec.ts, src/lib/import.ts, src/lib/index/index.ts
- [x] T005 [US2] [test] Missing recorded folder resolves to the one numbered folder and repairs the card, src/lib/__tests__/spec-folder-repair.test.ts

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: no interview was held for this S story; the story, size and feature come from the card (`codeloop card show c-310`) at specs/310-every-story-shows-its-real-working-time/spec.md:4, spec.md:6 and spec.md:8; US1 is proven by src/lib/__tests__/working-time.test.ts:20 and US2 by src/lib/__tests__/spec-folder-repair.test.ts:20
- S6 pass: specs/310-every-story-shows-its-real-working-time/spec.md:26 lists renaming folders on disk, the ambiguous-number case and the idle-gap rule as not built
