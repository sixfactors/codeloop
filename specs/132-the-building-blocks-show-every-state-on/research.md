# c-132 research: The building blocks show every state on one page

## What exists

exists: build — the twelve building blocks are named and sketched (design §4; wiki `architecture/ui.md`), and `.codeloop/design-system/blocks.css` ships CSS for key, status pills, holder, priority, proof meter, property row (`.prop`), and layout patterns (row, tile, record). There is no page that shows each of the twelve in every state. The design proposal grid (§4) shows one specimen each; the mock gallery (`codeloop mocks index`, `/mocks/`) indexes card mocks, not block states. Query bar, doc block, activity entry, link chip, gate badge and question bubble have no dedicated gallery rows (gate/question/link are only pill reuse in the design HTML).

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: shared components with one page that shows each block in every state before screens are built. That requirement lives in `docs/artifacts/codeloop-ui-design.html` build-order step 2 and is cited under Sources, not as a wiki row.

## Options

- Ship one self-contained HTML gallery page composed from `.codeloop/design-system/` (tokens + blocks), listing all twelve blocks from the card description / design §4, each with every documented state; extend `blocks.css` only where a named block still has no class. Serve it with the existing mock/artifact paths so `check mock` can hold it to the design system. Chosen — matches the title, build-order step 2, and the design-system layer (c-130–c-132) staying CSS + HTML before React screens (c-133+).
- Treat the design proposal §4 grid as done and close the card. Rejected — one specimen per block is not "every state"; build-order step 2 still asks for a dedicated page; the proposal is not the project-owned design system.
- Stand up Storybook / React components in `ui/` for the twelve blocks. Rejected for this card — screens and workspace restyle start at c-133; c-130/c-131 already chose inlined HTML + project CSS; Storybook would widen scope past S and duplicate the mock check path.
- Fold block specimens into the mock gallery index. Rejected — the gallery is card mocks with lineage; mixing block states would blur `check mock` and the index's job.

## The pain, grounded

pain: agents and people assemble screens from a design doc that shows each block once, so states get invented (wrong pill, missing proof segment, agent vs person holder) and only show up late when a screen mock drifts. Source: `docs/artifacts/codeloop-ui-design.html:412` ("a page that shows each in every state" as the step before patterns and screens), the card description naming the twelve blocks, and `.codeloop/design-system/blocks.css` covering only part of that vocabulary with no gallery page. Confirmed by c-130/c-131 research reserving "the every-state blocks gallery" for this card.

## Risks

- Scope bleed into React app shell or product screens (c-133–c-139): this card owns the gallery of the twelve blocks and any missing CSS classes for them, not Home/Board/Story layouts.
- Confusing the twelve vocabulary blocks (key, status, holder, …) with layout patterns already in `blocks.css` (app frame, columns, tree): the gallery must cover the twelve named in the card / design §4 / `ui.md`; patterns are build-order step 3, not this card.
- Calling the design HTML §4 grid "have" would close the card without every-state coverage and without a page owned under the design-system / mock check path.
- Inventing states not grounded in the design (e.g. extra proof colours) would poison later screens; states should come from §4 text and existing CSS variants (pill agent/you/ok/warn/danger, holder vs holder.agent, proof pass/fail/empty, prio p1–p4).

## Sources

- source: docs/artifacts/codeloop-ui-design.html:206 — twelve building blocks every screen is assembled from
- source: docs/artifacts/codeloop-ui-design.html:412 — build order: shared components with a page that shows each in every state
- source: .codeloop/wiki/architecture/ui.md:41 — names the twelve blocks and five patterns; design system c-130–c-132 before screens
- source: .codeloop/design-system/README.md — project-owned tokens and blocks mocks compose from
- source: .codeloop/design-system/blocks.css:17 — key, pill variants, holder, priority, proof classes exist; no gallery page
- source: specs/131-i-can-change-the-design-system-and-every/research.md:16 — leaves the gallery of block states to c-132
- source: src/lib/mock.ts:283 — mock gallery indexes card mocks, not block states

verdict: build
