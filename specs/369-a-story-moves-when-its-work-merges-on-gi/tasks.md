# c-369 tasks: A story moves when its work merges on GitHub, even with no card id in it

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->
- [x] T001 [US1] [api] The commit graph keeps remote-tracking tips, and a commit reads as merged when the local trunk or its remote-tracking branch (upstream, else origin) reaches it, in src/lib/commit-graph.ts and src/lib/diff-budget.ts
- [x] T002 [US2] [api] A commit with no Card or Feature trailer links to the story whose activity records its sha, in src/lib/commit-graph.ts
- [x] T003 [US3] [api] Turn `doctor.review: on` in .codeloop/config.yaml
- [x] T004 [US1] [test] Review pass with the local main behind and the merge only on origin/main places the story, red on the old code, in src/lib/__tests__/review-pass.test.ts
- [x] T005 [US2] [test] Review pass links a trailer-less commit from the activity record, and a trailer naming another story wins, in src/lib/__tests__/review-pass.test.ts
- [x] T006 [US1] [docs] CHANGELOG.md line under 0.5.0 (unreleased)

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: c-367's interview Q1, Q2 and Q5 are `trunk:`, `linking:` and `proof:` under `## Decisions` in specs/369-a-story-moves-when-its-work-merges-on-gi/spec.md:23; Q3 and Q4 went to c-370
- S6 pass: specs/369-a-story-moves-when-its-work-merges-on-gi/spec.md `## Not building` lists fetching, a trailer rule and the c-370 housekeeping
