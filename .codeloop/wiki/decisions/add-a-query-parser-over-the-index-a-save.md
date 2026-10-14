---
title: Add a query parser over the index, a saved-views persistence path
scope:
  - src/lib/services.ts
  - src/lib/index/index.ts
  - docs/architecture.md
  - docs/artifacts/codeloop-ui-design.html
  - .codeloop/wiki/initiatives/people-and-agents-workplace.md
  - src/lib/server.ts
freq: 1
severity: warning
cards:
  - c-122
updated: 2026-10-14
---

## Options

- Add a query parser over the index (`key:value` tokens plus free text), a saved-views persistence path, and a bulk-change service that applies one patch to an explicit id list through the same write rules as a single card. Expose as API only; SDK is c-127 and screens come later. Chosen — matches the card description, the design's "JQL → query bar and saved views", and the api-first build order.
- Ship only the existing facet/`q` params and call that the query bar. Rejected — the story names `status:build holder:agent P1`; facets today cannot express status, holder or priority, and there is still no bulk write.
- Fetch the full card list and filter / bulk-mutate in the browser. Rejected — contradicts `docs/architecture.md` (UI must not join or aggregate what the API can serve) and cannot safely share compare-and-swap / engine rules across many cards.

## Why

a founder cannot type a short query, select the matches and change them in one move, so triage is click-by-click instead of seconds. Source: card story on c-122 ("type status:build holder:agent P1 and act on the selection" / "triage takes seconds"), `docs/artifacts/codeloop-ui-design.html` (query bar, saved views, multi-select and bulk change; Jira row "JQL and saved filters"), and `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof). Confirmed by no query parser, no `/saved-views` API and no bulk endpoint in `src/lib/server.ts` / `services.ts`.

## Consequences

Add a query parser over the index (`key:value` tokens plus free text), a saved-views persistence path, and a bulk-change service that applies one patch to an explicit id list through the same write rules as a single card. Expose as API only; SDK is c-127 and screens come later. — matches the card description, the design's "JQL → query bar and saved views", and the api-first build order. The other options are not built; reopening one is a new decision.
