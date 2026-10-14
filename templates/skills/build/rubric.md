# Build rubric

What the build stage must satisfy before it counts as done. The build stage has no single output file, so its attest lines go under `## Rubric` in `{spec}/rubric-build.md`.

B1 | Every task ticked, each with the commit that did it | check
B2 | Each task's test was seen red once, the output quoted | attest
B3 | Tests drive the real seam (HTTP, CLI, SDK), not a mocked service | review
B4 | No file outside the plan's list changed, or the plan was updated first | check
B5 | Gotchas matching the changed files were read and acked | check
B6 | Commits carry the Card trailer and say why the old behaviour was wrong | review
