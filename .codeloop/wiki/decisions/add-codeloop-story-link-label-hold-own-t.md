---
title: Add codeloop story link|label|hold|own that call the SDK / services
scope:
  - src/commands/card.ts
  - docs/artifacts/codeloop-ui-design.html
  - .codeloop/wiki/architecture/ui.md
  - docs/architecture.md
freq: 1
severity: warning
cards:
  - c-128
updated: 2026-10-14
---

## Options

- Add `codeloop story link|label|hold|own` (Commander under a `story` command) that call the SDK / services to mutate the c-118 fields on one card, append a hand-off or link event, and print the updated story the way `card show` does. Chosen — matches the card story ("codeloop story link, label, hold and own"), feature `ui-cli` ("Commands over the SDK for fields and links"), and the onion (CLI thin on SDK).
- Fold the same verbs under `codeloop card` (`card link`, `card hold`, …). Rejected — the card title and story name `story`; `card` stays the lane lifecycle (advance, gates, park).
- Rely only on c-122 bulk change / query and skip single-story CLI. Rejected — agents and builders need one-card hand-off and link edits; bulk is triage, not the daily hand-off path named here.
- Auto-set `holder` on agent-start / gate park inside the engine and skip CLI. Rejected — c-118 interview parked auto-updates with the CLI/SDK cards; this card should own explicit `hold` / `own` and any auto rule that follows.

## Why

a builder or agent in the terminal cannot link, label or hand off a story the way the board will, so clearing a `blocked_by`, changing labels or naming who holds the card means editing `cards.json` or waiting for UI. Source: card story on c-128 ("agents and people do in the terminal what the board does"), `docs/artifacts/codeloop-ui-design.html` (holder hand-off history; labels; typed links), specs/120 and specs/119 interviews (Up next / blocked flag must wait on a link-edit path — this card), and `.codeloop/wiki/architecture/ui.md` (cli layer after sdk). Confirmed by no link/label/hold/own commands in `src/commands/` and no those fields on `Card` until c-118 lands.

## Consequences

Add `codeloop story link|label|hold|own` (Commander under a `story` command) that call the SDK / services to mutate the c-118 fields on one card, append a hand-off or link event, and print the updated story the way `card show` does. — matches the card story ("codeloop story link, label, hold and own"), feature `ui-cli` ("Commands over the SDK for fields and links"), and the onion (CLI thin on SDK). The other options are not built; reopening one is a new decision.
