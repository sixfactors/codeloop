verdict: accept

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| Correctly identifies existing chrome instead of proposing a rebuild | `workspace/components/shared/app-shell.tsx:263` has `<Sidebar collapsible="icon">`; `ProjectSwitcher` (project-switcher.tsx) and `CommandPalette` are already mounted at app-shell.tsx:343; `detail-sheet.tsx:69` has j/k keys. All match the research's "unlock" claim word for word. | low |
| IA gap is real and correctly scoped | `navGroups()` in app-shell.tsx:66-88 lists Home, Board, Initiatives, Roadmap, Wiki, Artifacts, Stats — not the six places (Home, Board, Plan, Releases, Wiki, Reports). `routes.ts` has no `releases` key. Confirmed by reading both files directly. | n/a (verified true) |
| Palette capability gap is real | `command-palette-dialog.tsx` only queries `useCards({q})` and `useWikiSearch`, builds two `CommandGroup`s (Stories, Wiki), no approve/answer/create/move action wired. Matches research claim exactly. | n/a (verified true) |
| Design artifact line citations are exact | Checked `docs/artifacts/codeloop-ui-design.html:225` (six places sentence), `:370` (Everywhere heading), `:396` ("Today's screens" heading) — all three land on the claimed line. | low |
| Wiki citation accurate | `.codeloop/wiki/architecture/ui.md:48` section header reads "Screens" with the Home/Board/Plan/Releases/Wiki/Reports/Settings table immediately after — matches. | low |
| Competitor table correctly left empty | `.codeloop/wiki/competitors/` has no files — research's "No competitor pages" claim and empty table are correct per the skill's rule (only add a row for an existing page). | low |
| `exists: unlock` is a defensible call, not a hidden rebuild | Chosen option ("Retarget today's AppShell... keep ProjectSwitcher and CommandPalette") reuses the seam named in the review brief (app-shell, project-switcher, command-palette, card-drawer/detail-sheet) rather than replacing it. No instance of building something that already exists. | low |
| Risks section names real downstream breakage | "Renaming or removing routes... without redirects breaks bookmarks and hub `/p/<id>/...` links" is grounded in the actual `routesFor()` prefixing logic read in `routes.ts`. | low |
| Interview stage is currently broken (out of scope for this research review) | `codeloop card show c-133` log: "fail interview: c-133 Q4 has no answer" — a downstream-stage problem, not a defect in research.md itself. | low |

## Summary

Every path, line number, and code claim in research.md checks out against the actual files — the sidebar, switcher, palette, and peek components exist exactly as described, and the six-place IA and Releases route are genuinely missing. The research correctly avoids the "build what already exists" trap by choosing to retarget the existing shell rather than rebuild it. No corrections needed; the verdict (build) and its chosen option are sound.
