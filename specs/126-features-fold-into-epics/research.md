# c-126 research: Features fold into epics

## What exists

exists: build — the product still has four levels. `FeatureSchema` carries optional `rice` on `.codeloop/wiki/features/<id>.md`; `EpicSchema` has no rice and an epic's score is only the sum of its features (`scoreEpic` in `src/lib/index/index.ts`). Cards name `feature:` (and optional `epic:` / `initiative:`); `scoreFeature` / `POST /api/features/:id/score` write rice on the feature. Target design and `.codeloop/wiki/architecture/ui.md` already say feature folds into epic with score on the epic, but nothing has migrated pages, schema, scoring or the story standard yet. Sixteen feature pages and five epic pages live in this repo today.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

## Options

- Fold feature into epic: move `rice` onto the epic, make epic the story's one parent (initiative inherited), migrate each `wiki/features/<slug>.md` into an epic (or merge into its named epic), rewrite cards from `feature:` to `epic:`, retire feature store/API/filters. Chosen — matches the design's recommended yes, the card story ("initiative, epic and story only"), and the architecture objects table.
- Keep four levels (initiative → epic → feature → story) and only rename labels in the UI. Rejected — the design's pain is the extra object, not the word; score would still sit on a level founders confuse with epic.
- Soft-delete features: leave wiki pages and `feature:` on cards, hide the level in Plan. Rejected — filters, RICE, SDK and story-standard would keep teaching a dead level; migration would still be owed later.

## The pain, grounded

pain: the plan hierarchy has a level nobody can tell apart from epic — feature was "an epic with a score", so founders and agents argue about which container to open instead of ranking work. Source: docs/artifacts/codeloop-ui-design.html ("Feature is not a separate object… Score moves onto the epic"; decision "Fold Feature into Epic… Removes a level nobody could tell apart from epic") and the card story ("plan with initiative, epic and story only"). Confirmed by docs/terminology.md (RICE on feature; epic score is a sum) and FeatureSchema vs EpicSchema.

## Risks

- Blast radius: `docs/story-standard.md`, `docs/terminology.md`, store schema, `src/lib/features.ts` scoring, initiative tree, CARD_FILTERS, SDK `createFeature` / `scoreFeature`, CLI, workspace routes and Plan (c-137) all assume features exist.
- Migration must rewrite sixteen feature pages and every card's `feature:` without breaking compare-and-swap writes or cloud sync; features that already name an epic need a merge rule (absorb rice vs keep separate epic).
- Owner's formal yes is still open: `.codeloop/wiki/decisions/ui-rebuild-bottom-up.md` says folding waits for it; the design only recommends yes. Spec gate should confirm before code lands.
- Priority on stories today inherits the feature's band; after the fold it must inherit the epic's score, or Up next and inbox ranking drift.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:155 — feature is not a separate object; score moves onto the epic; three levels
- source: docs/artifacts/codeloop-ui-design.html:422 — fold feature into epic recommended yes; removes a level nobody could tell apart
- source: src/lib/store/schema.ts:91 — FeatureSchema carries rice; EpicSchema has none
- source: docs/terminology.md:25 — RICE lives on the feature; epic score is the sum of its features
- source: .codeloop/wiki/architecture/ui.md:27 — feature folds into epic (c-126, pending owner yes)
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md — folding waits for the owner's yes; api layer includes c-126

verdict: build
