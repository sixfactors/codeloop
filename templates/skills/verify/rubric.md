# Verify rubric

What the verify stage must satisfy before it counts as done. Attest lines go under `## Rubric` at the end of verify.md, outside the block `codeloop verify` rewrites.

V1 | `codeloop verify` passes on an export of HEAD | check
V2 | Every acceptance line has a use case naming it | check
V3 | Each use case names a specific production breakage it would catch | review
V4 | Each use case was watched failing once | attest
V5 | A live walk on the real stack with the page, two steps, the calls that answered, none a stub | check
V6 | Evidence files for every claim; screenshots open | check
