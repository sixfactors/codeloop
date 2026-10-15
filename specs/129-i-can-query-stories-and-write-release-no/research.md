# c-129 research: I can query stories and write release notes from the terminal

## What exists

exists: build — `src/commands/card.ts` `card list` already filters by facets (lane, stage, initiative, epic, feature, band, persona, size) through the SDK (`client().cards.records`), but has no `--q` and does not pass a query-language string. There is no `codeloop release` / `release notes` command under `src/commands/` or `src/index.ts`. The SDK exposes facet/`q` listCards only; it has no releases view or notes write yet (c-127). Query parse and bulk live in c-122; tag→stories and notes draft live in c-123. Nothing to unlock or port for the terminal surface this card names.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design and feature wiki: terminal peers of the board for query and release notes. GitHub's `gh release view` / `gh release create --notes` and Linear's issue list filters are the familiar pattern and are cited under Sources, not as wiki rows.

## Options

- Add `codeloop card list --q <query>` and `codeloop release notes <tag>` (Commander) that call the SDK for the c-122 query and the c-123 releases/notes shape, printing what the board and Releases screen will show. Chosen — matches the card story (`card list --q` and `release notes v0.5.0`), feature `ui-cli` ("Query and release notes commands over the SDK"), and the onion (CLI thin on SDK).
- Fold release notes under `card` or `inbox` and skip a `release` command. Rejected — the story and design name Releases as its own object (git tag + stories + notes); a nested subcommand hides that.
- Rely on the board / Releases UI only and skip CLI. Rejected — the card exists so scripts and agents read the same views as the board from the terminal.
- Curl `/api/cards` and `/api/releases` from shell scripts without SDK methods. Rejected — contradicts `docs/architecture.md` (CLI peers the UI on the SDK; neither invents shapes).

## The pain, grounded

pain: a builder or agent in the terminal cannot run the same story query the board will use, or print / write release notes for a tag, so scripts scrape facets or edit notes by hand while the UI gets a different path. Source: card story on c-129 ("run codeloop card list --q and codeloop release notes v0.5.0" / "scripts and agents read the same views as the board"), `docs/artifacts/codeloop-ui-design.html` (Releases: notes from titles and so-that, editable before they go out), `.codeloop/wiki/features/ui-cli.md` (query and release notes), and sibling research (c-122 owns query API, c-123 owns notes draft, c-128 parks query/release-notes CLI here). Confirmed by no `--q` on `card list --help` and no release command in `src/commands/`.

## Risks

- Layer dependency: commands are empty until c-122 ships the query language, c-123 ships tag→stories and the notes draft, and c-127 (or a thin slice here) exposes those ops on the SDK; sequence api → sdk → this card.
- Layering: CLI must not import `src/lib/` (`docs/architecture.md`, layering test); wire Commander only through `CodeloopClient`.
- Notes write vs draft: c-123 owns the generated draft only and parks "CLI release-notes write or edit" and persisting founder-edited notes on this card — decide in spec whether `release notes` prints the draft, writes an edited file, or both, so c-123 and c-139 do not invent a second store.
- `--q` vs today's MiniSearch `q`: the card names the c-122 query bar language (`status:build holder:agent P1`), not only free-text; shipping a free-text-only `--q` that ignores key:value tokens would diverge from the board.
- Scope bleed into c-128 (link, label, hold, own), c-122 bulk change, and c-139 (Releases screen HTML): this card owns query list and release-notes CLI only.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:334 — Releases wireframe: tags, stories, Unreleased, notes from titles and so-that; editable before they go out
- source: src/commands/card.ts:123 — card list is facet filters only; no --q option
- source: .codeloop/wiki/architecture/ui.md:63 — build order: api → sdk → cli (c-128, c-129)
- source: .codeloop/wiki/features/ui-cli.md — feature: link, label, hand off, query and release notes from the terminal
- source: specs/123-releases-list-what-shipped-from-git-tags/interview.md:14 — CLI release-notes write or edit parked on c-129; c-123 draft only
- source: specs/122-i-can-find-any-story-with-a-query-and-ch/interview.md:14 — CLI query is c-129; c-122 is service plus HTTP
- source: docs/architecture.md:14 — CLI and UI are thin peers on the SDK; neither calls a service directly
- source: https://cli.github.com/manual/gh_release_view — gh release view / notes as the familiar terminal pattern for release notes

verdict: build
