---
title: Extend page metadata and a pages service so each typed page exposes
scope:
  - docs/artifacts/codeloop-ui-design.html
freq: 1
severity: warning
cards:
  - c-124
updated: 2026-10-14
---

## Options

- Extend page metadata and a pages service so each typed page (decision|gotcha|runbook|architecture|reference) exposes `owner`, `verified_at`, server `backlinks`, and `changed_by` from commits that touch the page path and carry a `Feature: <card-id>` trailer; keep values in frontmatter where editable (`owner`, `verified_at`) and compute the rest on read for the API (and later c-121's wiki view / c-138 screen). Chosen — matches the card's `[api]` note, the design wireframe, and the api-before-screens order.
- Treat existing `cards:` + `updated:` + client backlink search as done. Rejected — `cards:` is capture history, not commit provenance; `updated` / mtime is not "verified against the code"; backlinks are a second request the screen view is meant to fold in.
- Add a separate wiki-metadata index beside the files. Rejected — pages already live as files the store and agents read; a sidecar forces every read to join two stores and drifts from the file.

## Why

a builder opening a wiki page cannot tell who owns it, when it was last checked against the code, or which stories changed it, so they cannot trust what it says. Source: card story on c-124 ("see a page's owner, verified date, backlinks and changed-by stories" / "trust what the wiki says") and `docs/artifacts/codeloop-ui-design.html` (wiki wireframe subtitle and caption: owner, verified, changed by stories). Confirmed by `WikiPageSchema` having no such fields, capture writing only `cards`/`updated`, and backlinks living only in the client (`wiki-page-view.tsx`).

## Consequences

Extend page metadata and a pages service so each typed page (decision|gotcha|runbook|architecture|reference) exposes `owner`, `verified_at`, server `backlinks`, and `changed_by` from commits that touch the page path and carry a `Feature: <card-id>` trailer; keep values in frontmatter where editable (`owner`, `verified_at`) and compute the rest on read for the API (and later c-121's wiki view / c-138 screen). — matches the card's `[api]` note, the design wireframe, and the api-before-screens order. The other options are not built; reopening one is a new decision.
