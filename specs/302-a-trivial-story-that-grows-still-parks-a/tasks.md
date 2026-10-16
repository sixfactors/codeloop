# c-302 tasks: A trivial story that grows still parks at the first gate

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [api] resizeTrivial picks the smallest size that runs an earlier gate, in src/lib/engine.ts
- [x] T002 [US1] [test] Real-template and `size >= M` fixture cases in src/lib/__tests__/trivial-ceremony.test.ts

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: no interview ran: the stage was skipped at size trivial (`codeloop card show c-302` shows "skip interview" at 2026-10-16T16:53:43), so there is no answer to fold
- S6 pass: specs/302-a-trivial-story-that-grows-still-parks-a/spec.md:24
