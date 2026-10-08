## Q1 Scope: BMAD `tickets.toml` and Spec Kit specs with clarifications and checklists. Which first, and both in one S card?
recommended: Spec Kit first (its `specs/nnn/` layout is ours); BMAD in the same card if it stays S, else a child.
answer: Spec Kit first (its `specs/nnn/` layout is ours); BMAD in the same card if it stays S, else a child.

## Q2 What does a card get: title, story and acceptance only, or the whole spec folder copied in?
recommended: Card plus spec, plan and tasks copied into `specs/<nnn>/` with an `imported_from:` line; clarifications become `interview.md`; the source is never written.
answer: Card plus spec, plan and tasks copied into `specs/<nnn>/` with an `imported_from:` line; clarifications become `interview.md`; the source is never written.

## Q3 Acceptance: what proves it?
recommended: Given vendored fixtures from the current Spec Kit and BMAD versions, when `codeloop import speckit ./specs`, then N backlog cards exist, each passing `check story` or tagged `needs-story` with the failing line, and the source directory hash is unchanged.
answer: Given vendored fixtures from the current Spec Kit and BMAD versions, when `codeloop import speckit ./specs`, then N backlog cards exist, each passing `check story` or tagged `needs-story` with the failing line, and the source directory hash is unchanged.

## Q4 Riskiest assumption: their titles fail our title check and every card lands as `needs-story`.
recommended: Expected; import prints the count and posts one inbox question "rewrite titles? recommended yes", which runs the interview stage over them.
answer: Expected; import prints the count and posts one inbox question "rewrite titles? recommended yes", which runs the interview stage over them.

## Q5 Fixtures: vendored or fetched at test time?
recommended: Vendored under `usecases/import/fixtures/` with the version in the folder name.
answer: Vendored under `usecases/import/fixtures/` with the version in the folder name.
