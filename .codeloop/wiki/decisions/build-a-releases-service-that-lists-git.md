---
title: Build a releases service that lists git tags, places each done story
scope:
  - src/lib/run.ts
  - src/lib/verify.ts
  - docs/artifacts/codeloop-ui-design.html
  - docs/terminology.md
  - src/lib/services.ts
freq: 1
severity: warning
cards:
  - c-123
updated: 2026-10-14
---

## Options

- Build a releases service that lists git tags, places each done story under the tag whose commit range contains its `Feature:` commits (else Unreleased), and drafts copyable notes from titles and so-that lines; expose that shape for the API (c-121's `/api/releases` and later CLI/screens). Chosen — matches the card description, terminology ("release = a git tag"), and the design's "Versions → Releases from git tags".
- Store `release` on the card when it finishes (or keep only the wiki feature `release:` target). Rejected — design says Release is computed and "the tag is the truth"; a hand-set field drifts from git.
- Ship a flat "shipped this week" list and call it Releases. Rejected — the inbox already does that; the story needs per-tag stories and notes a founder can paste to customers.

## Why

a founder cannot open one place, see which stories landed in each release, and copy notes that tell customers what changed. Source: card story on c-123 ("see each release's stories and copy its notes" / "tell customers what changed"), `docs/artifacts/codeloop-ui-design.html` (Releases wireframe and caption: notes from titles and so-that), and `docs/terminology.md` (release = git tag). Confirmed by no releases service or tag→story grouping in `src/lib/services.ts` / `server.ts`, and inbox shipped remaining a flat recent-done list.

## Consequences

Build a releases service that lists git tags, places each done story under the tag whose commit range contains its `Feature:` commits (else Unreleased), and drafts copyable notes from titles and so-that lines; expose that shape for the API (c-121's `/api/releases` and later CLI/screens). — matches the card description, terminology ("release = a git tag"), and the design's "Versions → Releases from git tags". The other options are not built; reopening one is a new decision.
