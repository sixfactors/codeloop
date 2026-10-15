# c-122 research: I can find any story with a query and change many at once

## What exists

exists: build — the cards index already filters by facet query params and full-text `q` (`cardFilter` in `src/lib/services.ts`, `filterCards` / MiniSearch in `src/lib/index/index.ts`; `CARD_FILTERS` = lane, stage, initiative, epic, feature, band, persona, size). There is no `key:value` query language (`status:build holder:agent P1`), no saved-views store (only a UI shell `SavedViewTabs` that expects `/saved-views`), and no bulk-change endpoint that mutates only a selection. Facets do not cover holder, six-state status or priority; those fields are still owned by c-118 / c-119. Supersedes c-112.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: a query bar and saved views (plainer than JQL), multi-select and bulk change on every list. Linear's pattern is the same idea — filter, select all matches, then one field change on the selection — and is cited under Sources, not as a wiki row.

## Options

- Add a query parser over the index (`key:value` tokens plus free text), a saved-views persistence path, and a bulk-change service that applies one patch to an explicit id list through the same write rules as a single card. Expose as API only; SDK is c-127 and screens come later. Chosen — matches the card description, the design's "JQL → query bar and saved views", and the api-first build order.
- Ship only the existing facet/`q` params and call that the query bar. Rejected — the story names `status:build holder:agent P1`; facets today cannot express status, holder or priority, and there is still no bulk write.
- Fetch the full card list and filter / bulk-mutate in the browser. Rejected — contradicts `docs/architecture.md` (UI must not join or aggregate what the API can serve) and cannot safely share compare-and-swap / engine rules across many cards.

## The pain, grounded

pain: a founder cannot type a short query, select the matches and change them in one move, so triage is click-by-click instead of seconds. Source: card story on c-122 ("type status:build holder:agent P1 and act on the selection" / "triage takes seconds"), `docs/artifacts/codeloop-ui-design.html` (query bar, saved views, multi-select and bulk change; Jira row "JQL and saved filters"), and `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof). Confirmed by no query parser, no `/saved-views` API and no bulk endpoint in `src/lib/server.ts` / `services.ts`.

## Risks

- Query keys for holder, type, labels, area, priority and six-state status need c-118 fields and c-119 state derivation; shipping the language before those fields lands forces a second schema pass or empty facets.
- Bulk change must touch only the given ids, go through engine / compare-and-swap writes, and refuse illegal transitions (gate, wrong role) the same way a single advance does — a naive `cards.json` patch would skip that.
- Saved-view storage (who owns a view, project vs person) is undefined; inventing a shape here without a doc forces rework when screens wire `SavedViewTabs`.
- Scope bleed into c-127 (SDK/hooks) and "Everywhere" UI (command palette, multi-select chrome): this card owns the API contracts; those cards own typed clients and screens.
- A bulk of N cards under one lock can starve other writers; bound size and fail clearly when the selection is too large.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:388 - JQL and saved filters map to query bar and saved views; multi-select and bulk change
- source: src/lib/index/index.ts:55 - CARD_FILTERS and filterCards: facets plus MiniSearch q, not a key:value language
- source: src/lib/services.ts:465 - cardFilter maps URL params to CardFilter; no query string parser or bulk write
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md - c-112 dropped; c-122 owns query and bulk in the api layer
- source: .codeloop/wiki/architecture/ui.md:43 - query bar is a building block; api before screens
- source: https://linear.app/docs/select-issues - filter, select all matches, then one bulk field change on the selection

verdict: build
