---
title: Add a sync that rewrites only the codeloop-tokens / codeloop-blocks
scope:
  - docs/artifacts/codeloop-ui-design.html
  - .codeloop/design-system/README.md
  - src/lib/mock.ts
freq: 1
severity: warning
cards:
  - c-131
updated: 2026-10-14
---

## Options

- Add a sync that rewrites only the `codeloop-tokens` / `codeloop-blocks` markers in every existing mock from `designSystem()`, keep inlining for offline/shareable HTML, and document that the workspace (and later screens) import `.codeloop/design-system/` the same way. Chosen — matches the title ("every mock follows"), keeps `check mock`'s equality contract, stays size S, and leaves the gallery of block states to c-132 and real screens to c-133+.
- Stop inlining: link mocks to `.codeloop/design-system/*.css` so a file edit follows with no rewrite. Rejected for this card — breaks self-contained mock HTML the board and gallery serve today; bigger change than S; revisit if sync proves painful.
- Close as have because init/update/mock-new/check already exist. Rejected — c-130's own boundary reserved "owner edit-once propagation and workspace consumers" for this card; README already says only "every new mock" picks up an edit; `mock new` never overwrites, so there is no path to refresh; `ui/` has zero references to the design system.

## Why

a founder can edit `.codeloop/design-system`, but existing mocks keep the old inlined look and fail `check mock` until someone hand-edits each HTML; the workspace never reads that folder, so the product UI stays on a separate palette. Source: `.codeloop/design-system/README.md` ("every new mock uses it"), `src/lib/mock.ts` inlines at create and `newMock` refuses overwrite, `checkMock` compares inlined blocks to the live design system, and a repo search of `ui/` finds no `design-system` / `tokens.css` consumer. Confirmed by c-130 research naming this card for edit-once propagation and workspace consumers.

## Consequences

Add a sync that rewrites only the `codeloop-tokens` / `codeloop-blocks` markers in every existing mock from `designSystem()`, keep inlining for offline/shareable HTML, and document that the workspace (and later screens) import `.codeloop/design-system/` the same way. — matches the title ("every mock follows"), keeps `check mock`'s equality contract, stays size S, and leaves the gallery of block states to c-132 and real screens to c-133+. The other options are not built; reopening one is a new decision.
