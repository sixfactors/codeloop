# c-367 tasks: The board moves a story when its work ships, so shipped work never looks unfinished

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [US1] [api] The commit graph keeps remote-tracking tips, and a commit reads as merged when the local trunk or its remote-tracking branch (upstream, else origin) reaches it, in src/lib/commit-graph.ts and src/lib/diff-budget.ts
- [ ] T002 [US2] [api] A commit with no Card or Feature trailer links to the story whose activity records its sha, in src/lib/commit-graph.ts
- [ ] T003 [US3] [api] Turn `doctor.review: on` in .codeloop/config.yaml
- [ ] T004 [US1] [test] Review pass with the local main behind and the merge only on origin/main places the story, red on the old code, in src/lib/__tests__/review-pass.test.ts
- [ ] T005 [US2] [test] Review pass links a trailer-less commit from the activity record, and a trailer naming another story wins, in src/lib/__tests__/review-pass.test.ts
- [ ] T006 [US4] [docs] Review verdicts for c-097, c-098 and c-102 in evidence/097/review.md, evidence/098/review.md and evidence/102/review.md, each through its own `codeloop next`
- [ ] T007 [US4] [docs] Run `codeloop orch run --review` for c-120, c-126, c-140 and c-152 after the trunk fix and record what it did on each
- [ ] T008 [US4] [docs] `codeloop projects prune --write` on the hub registry
- [ ] T009 [US4] [docs] `codeloop store move --layout dotfolder` in its own commit once nothing is untracked under specs/, or name why not in the hand-back
- [ ] T010 [US1] [docs] CHANGELOG.md line under 0.5.0 (unreleased)

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 in `trunk:`, Q2 in `linking:`, Q3 in `dotfolder move:`, Q4 in `re-check:`, Q5 in `proof:`, all under `## Decisions` in specs/367-the-board-moves-a-story-when-its-work-sh/spec.md:24
- S6 pass: specs/367-the-board-moves-a-story-when-its-work-sh/spec.md:33 lists fetching, a trailer rule and the early dotfolder move
