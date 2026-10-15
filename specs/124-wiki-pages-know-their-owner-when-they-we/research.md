# c-124 research: Wiki pages know their owner, when they were checked and which stories changed them

## What exists

exists: build — wiki pages are markdown under `.codeloop/wiki/` with a loose `WikiPage` schema (`id`, `folder`, `title`, `frontmatter`, `body`). Folder types already match the design's set via `WIKI_SHAPE` (architecture, gotchas, decisions, runbooks, reference, …). Capture stores `cards:` and `updated:` on gotcha/decision/concept pages, and `wiki lint` flags `updated` older than 90 days as stale. The UI can show an `owner` frontmatter key if present and computes "Pages linking here" in the browser with `GET /api/pages?q=<slug>`. None of that is the card's contract: there is no page `owner` person field, no `verified_at` (checked against the code), no server-side `backlinks`, and no `changed_by` derived from git commits that touch the page (the feature note: "changed_by from commits"). `IndexedPage.updated` is file mtime, not a verified date. c-121 owns the wiki screen route shell; c-138 owns the doc UI chrome.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: every page shows owner, verified date, and "changed by" story keys, with backlinks under "Referenced by". Confluence is the Jira analogue named in the design ("Confluence → The wiki, linked both ways") and is cited under Sources, not as a wiki row.

## Options

- Extend page metadata and a pages service so each typed page (decision|gotcha|runbook|architecture|reference) exposes `owner`, `verified_at`, server `backlinks`, and `changed_by` from commits that touch the page path and carry a `Feature: <card-id>` trailer; keep values in frontmatter where editable (`owner`, `verified_at`) and compute the rest on read for the API (and later c-121's wiki view / c-138 screen). Chosen — matches the card's `[api]` note, the design wireframe, and the api-before-screens order.
- Treat existing `cards:` + `updated:` + client backlink search as done. Rejected — `cards:` is capture history, not commit provenance; `updated` / mtime is not "verified against the code"; backlinks are a second request the screen view is meant to fold in.
- Add a separate wiki-metadata index beside the files. Rejected — pages already live as files the store and agents read; a sidecar forces every read to join two stores and drifts from the file.

## The pain, grounded

pain: a builder opening a wiki page cannot tell who owns it, when it was last checked against the code, or which stories changed it, so they cannot trust what it says. Source: card story on c-124 ("see a page's owner, verified date, backlinks and changed-by stories" / "trust what the wiki says") and `docs/artifacts/codeloop-ui-design.html` (wiki wireframe subtitle and caption: owner, verified, changed by stories). Confirmed by `WikiPageSchema` having no such fields, capture writing only `cards`/`updated`, and backlinks living only in the client (`wiki-page-view.tsx`).

## Risks

- `changed_by` from commits needs the same `Feature:` trailer discipline as c-123; pages edited without a trailer stay unattributed until hooks/CI enforce it.
- `cards:` (capture) and `changed_by` (commits) must stay distinct names so agents and the UI do not conflate "mentioned in a gotcha" with "touched this file".
- `verified_at` needs a write path (CLI or gate) or it never moves past `updated` / mtime; do not pretend mtime is verified.
- c-121 may stub a wiki view with empty arrays for these fields; agree one payload shape (page + owner + verified_at + backlinks + changed_by) so the route does not get a second schema pass.
- Scope bleed into c-138 (doc UI): this card owns the api data; that card owns the Notion-style reader chrome.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:359 — wiki wireframe: Owner, verified, changed by story keys, Referenced by
- source: docs/artifacts/codeloop-ui-design.html:368 — caption: typed pages with owner, last checked against the code, stories that changed it
- source: .codeloop/wiki/architecture/ui.md:25 — wiki page types architecture, runbook, reference, decision, gotcha
- source: .codeloop/wiki/architecture/ui.md:57 — Wiki screen: typed pages, owner, verified date, changed-by
- source: src/lib/store/schema.ts:43 — WikiPageSchema is id/folder/title/frontmatter/body only
- source: src/lib/wiki.ts:18 — capture Page has cards and updated, not owner, verified_at or changed_by
- source: src/lib/wiki.ts:427 — lint treats updated older than 90 days as stale, not verified_at
- source: workspace/components/shared/wiki/wiki-page-view.tsx:30 — backlinks are a client search, not on the page payload
- source: .codeloop/wiki/decisions/each-screen-loads-its-data-with-one-call.md — c-124 owns wiki owner/verified/changed-by; c-121 owns the view shell
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md — api layer before screens; c-124 sits in ui-data-api

verdict: build
