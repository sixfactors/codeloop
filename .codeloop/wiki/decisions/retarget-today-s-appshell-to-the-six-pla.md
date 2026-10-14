---
title: Retarget today's AppShell to the six places
scope:
  - workspace/components/shared/app-shell.tsx
  - workspace/lib/routes.ts
  - .codeloop/wiki/decisions/ui-rebuild-bottom-up.md
freq: 1
severity: warning
cards:
  - c-133
updated: 2026-10-14
---

## Options

- Retarget today's AppShell to the six places: map Initiatives+Roadmap → Plan, Stats → Reports, drop Artifacts from the rail (Proof absorbs it per design §8), add a Releases nav slot (empty shell until the releases screen card), keep ProjectSwitcher and CommandPalette, and extend palette actions plus list keyboard to match the card note. Chosen — matches design §5 / §10 ("fresh shell, reusing the shared components that fit"), `architecture/ui.md` screen map, and unlock-before-build (chrome exists; IA does not).
- Delete the workspace shell and rebuild from chanl-admin templates. Rejected — switcher, palette, collapsible sidebar and peek already fit; a rewrite burns the hub `/p/<id>` work for no product gain.
- Close the card as `have` because switcher and ⌘K ship. Rejected — a founder still cannot find Plan, Releases or Reports; the title names six places first.
- Defer nav until every screen card (c-134+) lands. Rejected — build order starts screens at c-133 with the shell; later cards own screen bodies, not the rail.

## Why

a founder opening any project cannot trust where things live — Initiatives and Roadmap compete with each other, Releases is missing, Stats is not Reports, and Artifacts sits in the rail instead of on the story — so "I always know where things are" fails. Source: card story ("move between Home, Board, Plan, Releases, Wiki and Reports in every project"), `docs/artifacts/codeloop-ui-design.html:225` (six places + project switcher), `.codeloop/wiki/decisions/ui-rebuild-bottom-up.md` (pages added one at a time; confusing to read and act from), and today's `navGroups` in `app-shell.tsx` still listing Initiatives/Roadmap/Artifacts/Stats.

## Consequences

Retarget today's AppShell to the six places: map Initiatives+Roadmap → Plan, Stats → Reports, drop Artifacts from the rail (Proof absorbs it per design §8), add a Releases nav slot (empty shell until the releases screen card), keep ProjectSwitcher and CommandPalette, and extend palette actions plus list keyboard to match the card note. — matches design §5 / §10 ("fresh shell, reusing the shared components that fit"), `architecture/ui.md` screen map, and unlock-before-build (chrome exists; IA does not). The other options are not built; reopening one is a new decision.
