---
title: Ship one self-contained HTML gallery page composed from
scope:
  - .codeloop/design-system/blocks.css
  - docs/artifacts/codeloop-ui-design.html
freq: 1
severity: warning
cards:
  - c-132
updated: 2026-10-14
---

## Options

- Ship one self-contained HTML gallery page composed from `.codeloop/design-system/` (tokens + blocks), listing all twelve blocks from the card description / design §4, each with every documented state; extend `blocks.css` only where a named block still has no class. Serve it with the existing mock/artifact paths so `check mock` can hold it to the design system. Chosen — matches the title, build-order step 2, and the design-system layer (c-130–c-132) staying CSS + HTML before React screens (c-133+).
- Treat the design proposal §4 grid as done and close the card. Rejected — one specimen per block is not "every state"; build-order step 2 still asks for a dedicated page; the proposal is not the project-owned design system.
- Stand up Storybook / React components in `ui/` for the twelve blocks. Rejected for this card — screens and workspace restyle start at c-133; c-130/c-131 already chose inlined HTML + project CSS; Storybook would widen scope past S and duplicate the mock check path.
- Fold block specimens into the mock gallery index. Rejected — the gallery is card mocks with lineage; mixing block states would blur `check mock` and the index's job.

## Why

agents and people assemble screens from a design doc that shows each block once, so states get invented (wrong pill, missing proof segment, agent vs person holder) and only show up late when a screen mock drifts. Source: `docs/artifacts/codeloop-ui-design.html:412` ("a page that shows each in every state" as the step before patterns and screens), the card description naming the twelve blocks, and `.codeloop/design-system/blocks.css` covering only part of that vocabulary with no gallery page. Confirmed by c-130/c-131 research reserving "the every-state blocks gallery" for this card.

## Consequences

Ship one self-contained HTML gallery page composed from `.codeloop/design-system/` (tokens + blocks), listing all twelve blocks from the card description / design §4, each with every documented state; extend `blocks.css` only where a named block still has no class. Serve it with the existing mock/artifact paths so `check mock` can hold it to the design system. — matches the title, build-order step 2, and the design-system layer (c-130–c-132) staying CSS + HTML before React screens (c-133+). The other options are not built; reopening one is a new decision.
