# c-130 research: Mocks are built from the project's design system

## What exists

exists: have, `src/lib/mock.ts` (`designSystem`, `checkMock`) and `.codeloop/design-system/` — shipped in commit `51fd313` (Card: c-130). `codeloop mock new` inlines the project's `tokens.css` and `blocks.css` into the template; `codeloop check mock` refuses a mock whose tokens or blocks differ from that design system, or that uses colours outside them. `init` installs `.codeloop/design-system` (`overwrite: false`); `update` adds missing files and never overwrites. The mock skill (`templates/skills/mock/SKILL.md`) composes screens from those blocks.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: every screen assembled from shared tokens and building blocks so a mock reads as the product, not a sketch. That vocabulary lives in `docs/artifacts/codeloop-ui-design.html` §4 and is cited under Sources, not as a wiki row.

## Options

- Close the card: the capability the story names is already shipped and exposed (`mock new`, `check mock`, design-system dir, mock skill). Chosen — matches `exists: have` and the story standard ("have = shipped and exposed, close the card").
- Rebuild the mock/design-system path under a new API. Rejected — `designSystem` and `checkMock` already enforce the contract; a rebuild would duplicate what `51fd313` proved.
- Leave the card open to "document only." Rejected — docs and skill already describe the compose-from-design-system path; further work belongs on c-131 (owner edits follow through) and c-132 (blocks gallery), not here.

## The pain, grounded

pain: mocks used to come from a fixed template palette with a few generic classes, so they read as sketches rather than a real spec of the product. Source: commit `51fd313` message ("Mocks came from a fixed template palette… so they read as sketches") and the card story ("a mock is a real spec, not a sketch"). Confirmed by the design proposal requiring screens built from shared tokens and the twelve building blocks (`docs/artifacts/codeloop-ui-design.html` §4), and by this repo already holding `.codeloop/design-system/` plus `checkMock` comparing against it.

## Risks

- Calling this `have` wrongly would close the card while mocks still diverge from the design system; mitigated by `check mock` already failing on token/blocks drift and colour literals (covered in `src/lib/__tests__/research-mock.test.ts`).
- Scope bleed into c-131 (edit tokens once, every mock follows / workspace reads the system) and c-132 (one page showing every block state): those remain open; this card only owns compose + check from the project's design system.
- Older mocks under `docs/mocks/` or written before `51fd313` may still fail `check mock` until regenerated with `mock new`; that is migration, not a missing feature.

## Sources

- source: src/lib/mock.ts:30 — designSystem reads project `.codeloop/design-system` then package default
- source: src/lib/mock.ts:222 — checkMock holds tokens and blocks to the design system
- source: .codeloop/design-system/README.md — tokens and building blocks mocks compose from
- source: templates/skills/mock/SKILL.md:32 — mock skill composes from the project's design system
- source: docs/artifacts/codeloop-ui-design.html:206 — building blocks every screen is assembled from
- source: .codeloop/wiki/architecture/ui.md:45 — screens made from `.codeloop/design-system/` (c-130, c-131)
- source: src/lib/scaffold.ts:92 — init installs design system with overwrite false
- source: src/lib/__tests__/research-mock.test.ts:165 — mocks built from project's design system; restyle fails check

verdict: drop
