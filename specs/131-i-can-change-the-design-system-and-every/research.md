# c-131 research: I can change the design system and every mock follows

## What exists

exists: build — ownership path is shipped (c-130 / `51fd313`): `.codeloop/design-system` at init (`overwrite: false`), `update` installs missing files only, `mock new` inlines current tokens/blocks, `check mock` fails when a mock's inlined blocks drift. Absent for this story: rewriting existing mocks after an edit, and any workspace (`ui/`) consumer of the design system.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: one owned design system that mocks and later screens share. Vocabulary and twelve building blocks live in `docs/artifacts/codeloop-ui-design.html` §4; cited under Sources, not as a wiki row.

## Options

- Add a sync that rewrites only the `codeloop-tokens` / `codeloop-blocks` markers in every existing mock from `designSystem()`, keep inlining for offline/shareable HTML, and document that the workspace (and later screens) import `.codeloop/design-system/` the same way. Chosen — matches the title ("every mock follows"), keeps `check mock`'s equality contract, stays size S, and leaves the gallery of block states to c-132 and real screens to c-133+.
- Stop inlining: link mocks to `.codeloop/design-system/*.css` so a file edit follows with no rewrite. Rejected for this card — breaks self-contained mock HTML the board and gallery serve today; bigger change than S; revisit if sync proves painful.
- Close as have because init/update/mock-new/check already exist. Rejected — c-130's own boundary reserved "owner edit-once propagation and workspace consumers" for this card; README already says only "every new mock" picks up an edit; `mock new` never overwrites, so there is no path to refresh; `ui/` has zero references to the design system.

## The pain, grounded

pain: a founder can edit `.codeloop/design-system`, but existing mocks keep the old inlined look and fail `check mock` until someone hand-edits each HTML; the workspace never reads that folder, so the product UI stays on a separate palette. Source: `.codeloop/design-system/README.md` ("every new mock uses it"), `src/lib/mock.ts` inlines at create and `newMock` refuses overwrite, `checkMock` compares inlined blocks to the live design system, and a repo search of `ui/` finds no `design-system` / `tokens.css` consumer. Confirmed by c-130 research naming this card for edit-once propagation and workspace consumers.

## Risks

- Sync that rewrites whole mock files would destroy hand-drawn screens; only the marked tokens/blocks regions may change.
- Calling the ownership path "missing" would rebuild c-130; this card must not re-install or restyle the design-system template.
- "Workspace reads the design system" before screens exist (c-133+) could invent a dead import; keep the consumer contract thin (path + how screens will load tokens/blocks) and defer screen restyle to those cards.
- Older mocks under `docs/mocks/` still participate in check drift; sync should cover every path `findMock` / `allMocks` knows.

## Sources

- source: .codeloop/design-system/README.md — edit here; only every new mock uses it; check holds mocks to these files
- source: src/lib/mock.ts:30 — designSystem reads project copy then package default; template inlines at create
- source: src/lib/mock.ts:222 — checkMock fails when inlined tokens/blocks differ from the live design system
- source: src/commands/mock.ts:14 — mock new never overwrites an existing mock
- source: src/lib/scaffold.ts:92 — init installs design system with overwrite false
- source: src/commands/update.ts:122 — update copies missing design-system files only, never overwrites
- source: specs/130-mocks-are-built-from-the-project-s-desig/research.md:27 — c-131 owns edit-once propagation and workspace consumers
- source: .codeloop/wiki/architecture/ui.md:45 — screens made from `.codeloop/design-system/` (c-130, c-131)
- source: docs/artifacts/codeloop-ui-design.html:206 — building blocks every screen is assembled from

verdict: build
