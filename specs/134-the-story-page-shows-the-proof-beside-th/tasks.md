# c-134 tasks: The story page shows the proof beside the decision

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->
- [ ] T001 [US1] [ui] Reshape workspace/components/shared/card-detail.tsx (RecordLayout, GateCard): Proof tab with acceptance rows + use-case keys, review and commits; gate banner Approve / Send back on the same pane; property panel on the right
- [ ] T002 [US2] [ui] In card-detail.tsx set default tab from waiting reason: Proof at a gate, Questions when open questions exist, Tasks while an agent run is active
- [ ] T003 [US3] [ui] Replace tabs with Proof, Spec, Tasks, Questions, Wiki, Activity; fold Evidence into Proof and History into Activity; Wiki links architecture only; keep CardDrawer peek on the same CardDetail body
- [ ] T004 [US4] [ui] Redirect workspace/app/evidence/[nnn] into the story record Proof tab (deep-link bookmarks)
- [ ] T005 [US1] [test] Vitest on CardDetail: at a gate Proof is default and acceptance rows render with use-case keys beside Approve
- [ ] T006 [US2] [test] Vitest: default tab is Questions with open questions and Tasks while an agent runs; stacked peek and full page share one body
- [ ] T007 [P] [US4] [test] Use case or route test: evidence/[nnn] lands on the story Proof tab
- [ ] T008 [P] [US3] [docs] Update .codeloop/wiki/architecture/ui.md: evidence page → story Proof tab; card page/drawer → story record and peek
