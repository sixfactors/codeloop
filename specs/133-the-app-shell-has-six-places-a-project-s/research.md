# c-133 research: The app shell has six places, a project switcher and command palette

## What exists

exists: unlock, `workspace/components/shared/app-shell.tsx` already mounts a sidebar that collapses to icons (`collapsible="icon"`), a hub `ProjectSwitcher` (with "All projects"), and a ⌘K `CommandPalette`; `CardDrawer` / `DetailSheet` give peek with j/k on several lists. The left nav is still today's set (Home, Board, Initiatives, Roadmap, Wiki, Artifacts, Stats) plus Settings — not the six places (Home, Board, Plan, Releases, Wiki, Reports). There is no Releases route in `workspace/lib/routes.ts` or `workspace/app/`. The palette finds stories and wiki pages only; it does not run approve / answer / create / move.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: six fixed places in every project, project switcher including All projects, and Everywhere chrome (⌘K, peek, keyboard) — see Sources.

## Options

- Retarget today's AppShell to the six places: map Initiatives+Roadmap → Plan, Stats → Reports, drop Artifacts from the rail (Proof absorbs it per design §8), add a Releases nav slot (empty shell until the releases screen card), keep ProjectSwitcher and CommandPalette, and extend palette actions plus list keyboard to match the card note. Chosen — matches design §5 / §10 ("fresh shell, reusing the shared components that fit"), `architecture/ui.md` screen map, and unlock-before-build (chrome exists; IA does not).
- Delete the workspace shell and rebuild from a private project's templates. Rejected — switcher, palette, collapsible sidebar and peek already fit; a rewrite burns the hub `/p/<id>` work for no product gain.
- Close the card as `have` because switcher and ⌘K ship. Rejected — a founder still cannot find Plan, Releases or Reports; the title names six places first.
- Defer nav until every screen card (c-134+) lands. Rejected — build order starts screens at c-133 with the shell; later cards own screen bodies, not the rail.

## The pain, grounded

pain: a founder opening any project cannot trust where things live — Initiatives and Roadmap compete with each other, Releases is missing, Stats is not Reports, and Artifacts sits in the rail instead of on the story — so "I always know where things are" fails. Source: card story ("move between Home, Board, Plan, Releases, Wiki and Reports in every project"), `docs/artifacts/codeloop-ui-design.html:225` (six places + project switcher), `.codeloop/wiki/decisions/ui-rebuild-bottom-up.md` (pages added one at a time; confusing to read and act from), and today's `navGroups` in `app-shell.tsx` still listing Initiatives/Roadmap/Artifacts/Stats.

## Risks

- Scope bleed into screen bodies (Home layout, Board swimlanes, Plan tree, Releases list, Reports charts): this card owns the shell — six nav places, switcher, palette, peek/keyboard chrome — not the content of each place (later screen cards).
- Renaming or removing routes (roadmap, initiatives, artifacts, stats, inbox) without redirects breaks bookmarks and hub `/p/<id>/...` links; keep aliases or redirects until those screens move.
- Shipping an empty Releases place before c-123 / the releases screen card forces a second pass; stub the nav destination, do not invent release UI here.
- Growing the command palette into a second API surface for approve/answer/bulk will duplicate screen actions unless it calls the same mutations the lists already use.
- Agents panel in the design Home nav is not this card's six places; leaving it out of the rail is correct until the Home/agents screen card.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:225 — six places, project switcher, All projects; Settings at the bottom
- source: docs/artifacts/codeloop-ui-design.html:370 — Everywhere: ⌘K, peek, keyboard; design §10 chose a fresh shell reusing shared components
- source: docs/artifacts/codeloop-ui-design.html:396 — today's Initiatives/Roadmap/Stats/Artifacts map to Plan/Reports/Proof
- source: .codeloop/wiki/architecture/ui.md:48 — screen map: Home, Board, Plan, Releases, Wiki, Reports, Settings
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md — adopt the design; current pages stay until screens land; c-133 listed
- source: workspace/components/shared/app-shell.tsx:66 — navGroups still Home/Board/Initiatives/Roadmap/Wiki/Artifacts/Stats
- source: workspace/lib/routes.ts:13 — no releases route; roadmap, initiatives, artifacts, stats still first-class
- source: workspace/components/shared/project-switcher.tsx:14 — hub project switcher with All projects full navigation
- source: workspace/components/shared/command-palette-dialog.tsx:15 — ⌘K searches stories and wiki only, no actions

verdict: build
