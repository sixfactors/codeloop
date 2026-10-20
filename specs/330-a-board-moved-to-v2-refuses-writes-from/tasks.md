# c-330 tasks: A board moved to v2 refuses writes from v1

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [api] Refuse in writeCards when .codeloop/moved.json exists, naming the command from the marker, in src/lib/cards.ts
- [x] T002 [US1] [api] Refuse wiki captures, merges and question writes the same way, in src/lib/wiki.ts, src/lib/interview.ts and src/lib/store/file.ts
- [x] T003 [US2] [api] Print the moved line once per read command on stderr, from src/program-base.ts (the preAction every command runs)
- [x] T004 [US3] [api] Guard hooks pass through on a moved board and print the moved line, in src/commands/guard-hooks.ts
- [x] T005 [US1] [test] One test per write path and per hook verb, in src/lib/__tests__/moved-board.test.ts (US1 writes, US3 hooks)
- [x] T006 [US4] [test] scripts/e2e-founder-loop.sh with no marker passes every step, as the run before this change did

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: size S, no interview; the marker's shape and the one message are set by the 10-18 plan S0.1 (docs/artifacts/codeloop/cloud/c-321-implementation-plan.html)
- S6 pass: not building: a v2 reader of the marker, a command that writes the marker (the v2 import writes it), or a refusal of reads
