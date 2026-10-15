verdict: redo

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| `exists:` line under-reports what's already built: it says facets "do not cover ... priority" and that priority "is still owned by c-118 / c-119", but `band` (values P1-P4, same tokens as the story's example query) is already a working facet in `CARD_FILTERS` (`src/lib/index/index.ts:55`) and `CardListFilter` (`src/lib/services.ts:96`). c-118's own description (fields: holder, owner, reviewer, type, links, labels, area, risk, release) never claims priority either. The research invents a dependency that doesn't exist and could cause a builder to skip wiring `band` into the new query language, or wait on the wrong card. | Checked `CARD_FILTERS`, `CardListFilter`, and `node dist/index.js card show c-118` directly; none mention a missing priority facet. | high |
| "only a UI shell `SavedViewTabs` that expects `/saved-views`" states a specific route name with no backing source. `workspace/app/artifacts/page.tsx:61` passes `savedViews={[]}` — there's no fetch call, no `/saved-views` string anywhere in the repo or the design doc. The Risks section then contradicts this by saying saved-view storage shape is "undefined", so the exists-line's specificity is unearned. | `grep -rn "saved-view" workspace docs/artifacts/*.html .codeloop/wiki` returns nothing beyond the component itself. | medium |
| `- source: src/lib/services.ts:465` points one line past the actual `cardFilter` function start (line 464, the JSDoc is 463). Cosmetic, doesn't change the claim. | Read `src/lib/services.ts:463-467`. | low |
| Everything else checks out: no query-string key:value parser, no bulk-change endpoint, no saved-views persistence anywhere in `server.ts`/`services.ts`/`sdk/*`; c-112 really is dropped and superseded by c-122 (`node dist/index.js card show c-112`); the Linear source accurately describes filter-then-select-all-then-bulk-edit; the chosen option (API-only, SDK in c-127, screens later) matches `ui.md`'s build order and c-127's own card text. | Verified each claim against the cited file or a live fetch of linear.app/docs/select-issues. | — |

## Summary

The research correctly identifies the two real gaps — a key:value query parser and a bulk-change endpoint touching only the selection — and the chosen option matches the api-first build order. But the `exists:` line is wrong about priority already being unavailable: `band` already does that job with the exact P1-P4 tokens the story names, so a builder following this research as-is would risk re-deriving or needlessly blocking on c-118/c-119 for a facet that's already there. That's a correctness error in the one line every downstream stage inherits verbatim into the wiki decision page, so it needs a fix before promotion, not just a note.
