# c-370 tasks: Codeloop's own board carries its review verdicts, re-checks and dotfolder layout

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->
- [ ] T001 [US1] [docs] Review verdicts for c-097, c-098 and c-102 in evidence/097/review.md, evidence/098/review.md and evidence/102/review.md, each through its own `codeloop next`
- [ ] T002 [US1] [docs] Run `codeloop orch run --review` for c-120, c-126, c-140 and c-152 after the trunk fix and record what it did on each
- [ ] T003 [US1] [docs] `codeloop projects prune --write` on the hub registry
- [ ] T004 [US1] [docs] `codeloop store move --layout dotfolder` in its own commit once nothing is untracked under specs/, or name why not in the hand-back

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: c-367's interview Q3 and Q4 are `dotfolder move:` and `re-check:` under `## Decisions` in specs/370-codeloop-s-own-board-carries-its-review/spec.md; Q1, Q2 and Q5 went to c-369
- S6 pass: specs/370-codeloop-s-own-board-carries-its-review/spec.md `## Not building` names the c-369 fix and the early dotfolder move
