---
name: spec-brief
stage: draft
lane: eval-fixture
inputs: [spec.md]
outputs: ["{spec}/brief.md"]
check: "test -f {spec}/brief.md && grep -q '## Summary' {spec}/brief.md"
questions: []
---
Read `{spec}/spec.md` (and `{spec}/research.md` when it exists) and write `{spec}/brief.md`: a
one-page brief a reviewer can approve without opening the spec.

- A `## Summary` heading, 2-3 sentences restating the goal in the reviewer's terms.
- A `## Risks` heading naming the one thing most likely to go wrong.
- If `research.md` names a competitor or a prior decision, cite it by name — do not invent one.

This is codeloop's own fixture skill for `codeloop skill eval`, used to prove the eval runner
works end to end. It is not a product skill.
