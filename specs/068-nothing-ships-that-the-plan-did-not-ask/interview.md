## Q1 Scope: `check diff` and `spec check --strict` here; is the `## Not building` section here or in c-066?
recommended: Here: `check diff` and `--strict`; `## Not building` is written by c-066 and only required by this card's check.
answer: Here: `check diff` and `--strict`; `## Not building` is written by c-066 and only required by this card's check.

## Q2 What does `check diff` compare against: `plan.md files:`, task ownership, or both? And new dependencies from package.json?
recommended: Both: a changed file must be in `plan.md files:` or named by a task; a new package.json dep must appear under plan `deps:`; the test count from the runner summary must not drop.
answer: Both: a changed file must be in `plan.md files:` or named by a task; a new package.json dep must appear under plan `deps:`; the test count from the runner summary must not drop.

## Q3 Acceptance: what proves it?
recommended: Given a plan listing three files, when the agent edits a fourth, then `codeloop next` fails at build naming the file; adding it to plan.md passes. Proven non-vacuous by running it on CL-001's real diff first.
answer: should be flexible - if there is a good evidence that files were needed let them be. What is more important is code quality and reducing the waste - i.e. minimum changes that are not impacting existing users.

## Q4 Riskiest assumption: agents just append every file to plan.md. Does that need Dean?
recommended: Allow it, but any plan.md edit after the spec gate is shown as a diff in the local gate note so the growth is visible. No second gate.
answer: make it flexible per plan - if plan can show what files are needed great. If implementation produces a few more or less but work is done as acceptance criteria - allow flexibility based on case.

## Q5 Test-count source: runner JSON or a line in verify.md?
recommended: Runner JSON (`vitest --reporter=json`); a plugin may override with `checks/test-count`.
answer: Runner JSON (`vitest --reporter=json`); a plugin may override with `checks/test-count`.
