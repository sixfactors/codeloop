# c-058 tasks: Small fixes skip the ceremony

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [x] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->
- [x] T001 [US1] [api] Add `trivial` to Size in src/lib/cards.ts and SIZES in src/lib/story.ts; accept `--size trivial` on card new
- [x] T002 [US1] [api] Add Stage `when` in src/lib/lane.ts (size comparisons); propose `when: size >= S` on research, interview, mock and spec in templates/lanes/build.yaml so trivial cards enter at build
- [x] T003 [US1] [docs] Add a `trivial` row to the size table in docs/story-standard.md and note that ceremony stages use `when: size >= S`
- [x] T004 [US1] [test] scripts/e2e-trivial-ceremony.sh (and a unit test): a trivial card run writes no research.md or spec.md and events are create → build → verify
- [x] T005 [US2] [ui] Show the trivial size badge on board tiles and the card drawer (board-with-size, card-drawer-size); local gate note includes "size: trivial, skipped research/spec"
- [x] T006 [US3] [api] Enforce the trivial diff cap (≤3 files, ≤50 lines) at verify; on breach re-size to S and park at the spec gate
- [x] T007 [US3] [test] Use case: an over-cap trivial card is re-sized to S and parked at the spec gate
- [x] T008 [US4] [api] Report cycle time for trivial cards in src/lib/stats.ts so `codeloop stats` shows it under one hour for the dogfood card
