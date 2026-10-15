# c-123 research: Releases list what shipped from git tags with notes

## What exists

exists: build — git tags and `Feature: <card-id>` commit trailers already exist as inputs (`git.tag` in `src/lib/run.ts` reads only the latest tag for the deploy trigger; `templates/hooks/commit-msg` and `src/lib/verify.ts` map commits to cards). Features may carry a target `release:` in the wiki store. The inbox lists recent done cards flat, not by tag. `storyState` treats an optional `card.release` as the done→shipped split, but cards do not store release yet (c-118) and the design marks Release as computed from the tag. There is no service that lists tags, groups stories into the tag their commits landed in, or drafts notes from titles and so-that lines. No `/api/releases` body for that shape yet (c-121 owns the screen route shell). Supersedes c-111.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: Releases groups by git tag, with an Unreleased bucket and notes generated from story titles and "so that" lines. Jira's Versions map to the same idea (tag is the truth) and are cited under Sources, not as a wiki row.

## Options

- Build a releases service that lists git tags, places each done story under the tag whose commit range contains its `Feature:` commits (else Unreleased), and drafts copyable notes from titles and so-that lines; expose that shape for the API (c-121's `/api/releases` and later CLI/screens). Chosen — matches the card description, terminology ("release = a git tag"), and the design's "Versions → Releases from git tags".
- Store `release` on the card when it finishes (or keep only the wiki feature `release:` target). Rejected — design says Release is computed and "the tag is the truth"; a hand-set field drifts from git.
- Ship a flat "shipped this week" list and call it Releases. Rejected — the inbox already does that; the story needs per-tag stories and notes a founder can paste to customers.

## The pain, grounded

pain: a founder cannot open one place, see which stories landed in each release, and copy notes that tell customers what changed. Source: card story on c-123 ("see each release's stories and copy its notes" / "tell customers what changed"), `docs/artifacts/codeloop-ui-design.html` (Releases wireframe and caption: notes from titles and so-that), and `docs/terminology.md` (release = git tag). Confirmed by no releases service or tag→story grouping in `src/lib/services.ts` / `server.ts`, and inbox shipped remaining a flat recent-done list.

## Risks

- Stories whose commits lack a `Feature:` trailer cannot be placed in a tag range; they stay Unreleased or missing until hooks/CI enforce trailers.
- `card.release` from c-118 and computed tag membership must not disagree: shipped state should follow the tag (or a derived field written from it), not a parallel manual value.
- c-121 may stub `/api/releases` before this data lands; agree one payload shape (tags, stories, notes, Unreleased) so the route does not get a second schema pass.
- Non-version tags (or many tags) can pollute the list; bound to the repo's release tag pattern (`v*` / configured) or the check will show noise.
- Scope bleed into c-129 (CLI notes write) and c-139 (Releases screen): this card owns the api data and notes draft; those own the terminal and UI chrome.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:334 — Releases wireframe: tags, story rows, Unreleased, notes from titles and so-that
- source: docs/terminology.md:55 — release is a git tag; feature `release:` is a target, not what shipped
- source: src/lib/run.ts:30 — git.tag trigger reads only the latest tag; no releases list
- source: src/lib/verify.ts:111 — Feature: trailer greps are how commits already map to a card
- source: templates/hooks/commit-msg — commit-msg hook writes Feature: <card-id> from the branch
- source: .codeloop/wiki/architecture/ui.md:24 — Release is computed: a git tag and the stories that shipped in it
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md — c-111 dropped; c-123 owns releases in the api layer
- source: src/lib/states.ts:41 — done vs shipped today depends on optional card.release, not on tags yet

verdict: build
