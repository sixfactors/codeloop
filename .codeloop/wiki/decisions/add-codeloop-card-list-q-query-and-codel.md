---
title: Add codeloop card list --q <query> and codeloop release notes <tag>
scope:
  - src/commands/card.ts
  - src/index.ts
  - docs/architecture.md
  - docs/artifacts/codeloop-ui-design.html
  - .codeloop/wiki/features/ui-cli.md
freq: 1
severity: warning
cards:
  - c-129
updated: 2026-10-14
---

## Options

- Add `codeloop card list --q <query>` and `codeloop release notes <tag>` (Commander) that call the SDK for the c-122 query and the c-123 releases/notes shape, printing what the board and Releases screen will show. Chosen — matches the card story (`card list --q` and `release notes v0.5.0`), feature `ui-cli` ("Query and release notes commands over the SDK"), and the onion (CLI thin on SDK).
- Fold release notes under `card` or `inbox` and skip a `release` command. Rejected — the story and design name Releases as its own object (git tag + stories + notes); a nested subcommand hides that.
- Rely on the board / Releases UI only and skip CLI. Rejected — the card exists so scripts and agents read the same views as the board from the terminal.
- Curl `/api/cards` and `/api/releases` from shell scripts without SDK methods. Rejected — contradicts `docs/architecture.md` (CLI peers the UI on the SDK; neither invents shapes).

## Why

a builder or agent in the terminal cannot run the same story query the board will use, or print / write release notes for a tag, so scripts scrape facets or edit notes by hand while the UI gets a different path. Source: card story on c-129 ("run codeloop card list --q and codeloop release notes v0.5.0" / "scripts and agents read the same views as the board"), `docs/artifacts/codeloop-ui-design.html` (Releases: notes from titles and so-that, editable before they go out), `.codeloop/wiki/features/ui-cli.md` (query and release notes), and sibling research (c-122 owns query API, c-123 owns notes draft, c-128 parks query/release-notes CLI here). Confirmed by no `--q` on `card list --help` and no release command in `src/commands/`.

## Consequences

Add `codeloop card list --q <query>` and `codeloop release notes <tag>` (Commander) that call the SDK for the c-122 query and the c-123 releases/notes shape, printing what the board and Releases screen will show. — matches the card story (`card list --q` and `release notes v0.5.0`), feature `ui-cli` ("Query and release notes commands over the SDK"), and the onion (CLI thin on SDK). The other options are not built; reopening one is a new decision.
