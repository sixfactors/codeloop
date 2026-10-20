## Q1 Scope: which project commands read `checks.timeout_minutes`: only stage checks, or every command codeloop runs for the project? (builds on research.md:Open questions)
recommended: Every command that runs a project's own check, proof, use case, lint or post-merge step. Setup and post-merge steps keep their longer floors of 15 minutes.
answer: Every command that runs a project's own check, proof, use case, lint or post-merge step. Setup and post-merge steps keep their longer floors of 15 minutes.

## Q2 Acceptance: what is the unit and default, and what does a killed check say? (builds on research.md:Open questions)
recommended: Minutes, default 10, and any value that is not a positive number falls back to 10. A killed check says "timed out after N min (checks.timeout_minutes)" and is a crash, not a failed verdict.
answer: Minutes, default 10, and any value that is not a positive number falls back to 10. A killed check says "timed out after N min (checks.timeout_minutes)" and is a crash, not a failed verdict.

## Q3 Risk: should a split count idle stories against the lane limit? (builds on research.md:Open questions)
recommended: No. Only stories an agent is working on count, as on every other path, so a split passes the project directory.
answer: No. Only stories an agent is working on count, as on every other path, so a split passes the project directory.

## Rubric

- I2 pass: Q1 scope, Q2 acceptance, Q3 risk, each named in its own `## Qn` heading in this file
- I4 pass: research.md R7 open questions (1) which commands read the setting is Q1, (2) unit and default is Q2, (3) split and idle stories is Q3 (specs/365-the-lane-limit-small-story-carry-and-bat/research.md:35)
- I6 pass: each answer is a line under `## Decisions` in specs/365-the-lane-limit-small-story-carry-and-bat/spec.md (scope :21, unit and default :22, split count :23), and is also acceptance US1 to US3
