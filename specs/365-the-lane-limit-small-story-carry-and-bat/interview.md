## Q1 Scope: which project commands read `checks.timeout_minutes`: only stage checks, or every command codeloop runs for the project? (builds on research.md:Open questions)
recommended: Every command that runs a project's own check, proof, use case, lint or post-merge step. Setup and post-merge steps keep their longer floors of 15 minutes.
answer:

## Q2 Acceptance: what is the unit and default, and what does a killed check say? (builds on research.md:Open questions)
recommended: Minutes, default 10, and any value that is not a positive number falls back to 10. A killed check says "timed out after N min (checks.timeout_minutes)" and is a crash, not a failed verdict.
answer:

## Q3 Risk: should a split count idle stories against the lane limit? (builds on research.md:Open questions)
recommended: No. Only stories an agent is working on count, as on every other path, so a split passes the project directory.
answer:
