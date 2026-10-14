---
title: Fold feature into epic
scope:
  - src/lib/index/index.ts
  - .codeloop/wiki/architecture/ui.md
  - docs/story-standard.md
  - docs/terminology.md
  - src/lib/features.ts
  - .codeloop/wiki/decisions/ui-rebuild-bottom-up.md
freq: 1
severity: warning
cards:
  - c-126
updated: 2026-10-14
---

## Options

- Fold feature into epic: move `rice` onto the epic, make epic the story's one parent (initiative inherited), migrate each `wiki/features/<slug>.md` into an epic (or merge into its named epic), rewrite cards from `feature:` to `epic:`, retire feature store/API/filters. Chosen — matches the design's recommended yes, the card story ("initiative, epic and story only"), and the architecture objects table.
- Keep four levels (initiative → epic → feature → story) and only rename labels in the UI. Rejected — the design's pain is the extra object, not the word; score would still sit on a level founders confuse with epic.
- Soft-delete features: leave wiki pages and `feature:` on cards, hide the level in Plan. Rejected — filters, RICE, SDK and story-standard would keep teaching a dead level; migration would still be owed later.

## Why

the plan hierarchy has a level nobody can tell apart from epic — feature was "an epic with a score", so founders and agents argue about which container to open instead of ranking work. Source: docs/artifacts/codeloop-ui-design.html ("Feature is not a separate object… Score moves onto the epic"; decision "Fold Feature into Epic… Removes a level nobody could tell apart from epic") and the card story ("plan with initiative, epic and story only"). Confirmed by docs/terminology.md (RICE on feature; epic score is a sum) and FeatureSchema vs EpicSchema.

## Consequences

Fold feature into epic: move `rice` onto the epic, make epic the story's one parent (initiative inherited), migrate each `wiki/features/<slug>.md` into an epic (or merge into its named epic), rewrite cards from `feature:` to `epic:`, retire feature store/API/filters. — matches the design's recommended yes, the card story ("initiative, epic and story only"), and the architecture objects table. The other options are not built; reopening one is a new decision.
