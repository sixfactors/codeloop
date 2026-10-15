---
title: Close the card
scope:
  - src/lib/mock.ts
  - templates/skills/mock/SKILL.md
  - docs/artifacts/codeloop-ui-design.html
  - src/lib/__tests__/research-mock.test.ts
  - README.md
  - src/lib/mcp.ts
  - src/lib/interview.ts
  - ui/components/card-detail.tsx
freq: 2
severity: warning
cards:
  - c-130
  - c-143
updated: 2026-10-14
---

## Options

- Close the card: the capability the story names is already shipped and exposed (`mock new`, `check mock`, design-system dir, mock skill). Chosen — matches `exists: have` and the story standard ("have = shipped and exposed, close the card").
- Rebuild the mock/design-system path under a new API. Rejected — `designSystem` and `checkMock` already enforce the contract; a rebuild would duplicate what `51fd313` proved.
- Leave the card open to "document only." Rejected — docs and skill already describe the compose-from-design-system path; further work belongs on c-131 (owner edits follow through) and c-132 (blocks gallery), not here.

## Why

mocks used to come from a fixed template palette with a few generic classes, so they read as sketches rather than a real spec of the product. Source: commit `51fd313` message ("Mocks came from a fixed template palette… so they read as sketches") and the card story ("a mock is a real spec, not a sketch"). Confirmed by the design proposal requiring screens built from shared tokens and the twelve building blocks (`docs/artifacts/codeloop-ui-design.html` §4), and by this repo already holding `.codeloop/design-system/` plus `checkMock` comparing against it.

## Consequences

Close the card: the capability the story names is already shipped and exposed (`mock new`, `check mock`, design-system dir, mock skill). — matches `exists: have` and the story standard ("have = shipped and exposed, close the card"). The other options are not built; reopening one is a new decision.

## Notes

- 2026-10-14 (c-143): ## Options
