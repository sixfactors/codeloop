verdict: accept

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| "What exists" claim is accurate: homeView/boardView already exist, four screen routes do not | Confirmed `boardView`/`homeView` at `src/lib/services.ts:751,778`, wired at `src/lib/server.ts:367-368`; grepped every `app.get(` in server.ts, no `/plan`, `/releases`, `/stories/:id`, `/wiki/:path` route exists | high (correctness of the core claim) |
| Story-page fan-out claim is accurate and understates the count | `workspace/app/cards/[id]/card-page.tsx:13` calls `useCard`; the `CardDetailBody` it renders (`workspace/components/shared/card-detail.tsx:31,114-115`) separately calls `useCardFull` and `useQuestions` — three calls for one screen, as research says | low (claim holds, just not the full picture) |
| Wiki fan-out is worse than described, not "backlinks" | `workspace/app/wiki/[...slug]/page.tsx` prefetches `pagesQueryOptions()` and `pageQueryOptions(path)`; `WikiBrowser` (`workspace/components/shared/wiki-browser.tsx:25,42`) further calls `useCards`, `usePage`, `usePages`, `useWikiShape` — four hooks, not a page-then-backlink-search as phrased | low (wording imprecise, substance correct) |
| Plan fan-out claim verified | `workspace/app/roadmap/page.tsx:5-6` comment states trees come "from one request per initiative" via `/api/initiatives/:id/tree`, matching the research's claim | low (confirms, not a gap) |
| Architecture citation is exact | `docs/architecture.md:27` reads verbatim "join or aggregate what the API can serve pre-joined" in the UI row's "Must not" column | low |
| Does not propose rebuilding what exists | Options section explicitly keeps `homeView`/`boardView` as-is and only proposes the four missing routes, matching the ui-rebuild decision's "API fields and one call per screen first" order | high (the exact failure mode this review is told to flag — absent here) |
| Route-collision risk correctly flagged, not resolved | Risks section names `/stories/:id` vs `/api/cards/:id/full` and `/wiki/:path` vs `/api/wiki/entries|inject|lint|outline|shape` as open; this is deferred to the interview (Q3), which is the right lane for naming decisions, not research | medium (acceptable deferral, but a builder hitting this card needs the interview answered first) |
| Design artifact's "Reports" screen is absent from research and the card | `docs/artifacts/codeloop-ui-design.html:225,414` lists nav as Home, Board, Plan, Releases, Wiki, Reports (Story reached via link, not nav); card c-121 and research only cover /home /board /plan /releases /stories/:id /wiki/:path, no /reports | low (card's own scope, research correctly followed it) |

## Summary

Research correctly maps existing code (`homeView`/`boardView`, `/api/cards/:id/full`, wiki utility routes) against the card's six target screens and finds no seam it missed or duplicated. Sources are real, quote-accurate, and the fan-out claims for Plan/Story/Wiki hold up against the actual client code, with wiki's fan-out understated rather than overstated. Risks correctly flag unresolved route-naming collisions (stories vs cards/full, wiki page path vs wiki utility routes) and defer them to the interview stage rather than guessing, which is the right call given Q3 in interview.md addresses exactly this.
