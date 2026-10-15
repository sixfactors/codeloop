verdict: redo

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| Misses the existing migration framework for exactly this job | `src/lib/store/migrations/` already runs numbered migrations (`001-story-fields.ts`, applied via `.codeloop/store.json`, `src/lib/store/README.md` "Migrations" section). The card asks for "migration of cards.json" and 001 is precedent for filling new fields onto old cards; research's Options section never mentions it, so a builder could reinvent a second migration mechanism. | high |
| Misses `src/lib/store/schema.ts`, the file the task brief names for "validation" claims | `CardSchema` there is explicitly `.loose()` with the comment "cards.json is the engine's and carries fields the store does not interpret." The chosen option says "validate on write" but never says where: the zod schema is deliberately not where card-field validation lives. This is a design fork research should have surfaced. | high |
| All 4 citations check out against the files | `docs/artifacts/codeloop-ui-design.html` lines 155-195 has the exact fields table (Holder, Owner, Reviewer, Type, Links, Labels/Area, Release). `src/lib/cards.ts` StoryFields/CardExtras confirmed to lack all requested fields; `awaiting` confirmed to be a gate role string, not a holder. `.codeloop/wiki/architecture/ui.md` and `ui-rebuild-bottom-up.md` confirmed to say what's claimed. | low (no action, noted for credit) |
| No external URLs cited, but none were owed | `codeloop wiki competitor list` returns "no competitor pages"; the skill only requires a row for a competitor that already has a wiki page, so the empty "How others show it" table is correct, not a gap. | low |
| `exists:`, `pain:`, source count, and verdict line all pass the mechanical check | `codeloop check research c-118 --min-sources 3` exits 0 with no output. | low |

## Gaps a builder still has to close

- Whether the new fields validate inside `cards.ts` (application code) or get a non-loose zod schema; `schema.ts`'s current looseness was never discussed.
- Whether this ships as `002-<name>.ts` in `src/lib/store/migrations/`, following `001-story-fields.ts`, or some other path; research gives no option that uses the mechanism already in the repo.
- Exact migration behavior for the 515-version-deep `cards.json` already on disk: does it default `type` to `story` for all existing cards, or leave the field absent until set?

## Summary

Sources are real and each citation matches the file it points to; the verdict to build is reasonable given no existing fields. The research fails on relevance where it counts most: it never found `src/lib/store/schema.ts` or `src/lib/store/migrations/`, the two places in this codebase that already answer "how does cards.json get validated and migrated," which is the part of the card's description research was supposed to resolve.
