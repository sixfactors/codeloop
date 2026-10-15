# c-128 research: I can link, label and hand off stories from the terminal

## What exists

exists: build — `src/commands/card.ts` moves cards (new, show, list, advance, approve, park, done) but has no `story link`, `label`, `hold` or `own`. `check story` only validates the story standard. Holder, owner person, typed links and labels are not on `Card` yet (c-118 owns the schema; c-118 interview leaves hand-off and CLI setters to this card). Architecture requires CLI → SDK → services; no SDK mutation for those fields exists either (c-127). Nothing to unlock or port.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design and feature wiki: terminal peers of the board for link, label and hand-off. Linear's issue CLI (`linear issue update`, relations) and GitHub's `gh issue edit --add-label` / `--add-assignee` are the familiar pattern and are cited under Sources, not as wiki rows.

## Options

- Add `codeloop story link|label|hold|own` (Commander under a `story` command) that call the SDK / services to mutate the c-118 fields on one card, append a hand-off or link event, and print the updated story the way `card show` does. Chosen — matches the card story ("codeloop story link, label, hold and own"), feature `ui-cli` ("Commands over the SDK for fields and links"), and the onion (CLI thin on SDK).
- Fold the same verbs under `codeloop card` (`card link`, `card hold`, …). Rejected — the card title and story name `story`; `card` stays the lane lifecycle (advance, gates, park).
- Rely only on c-122 bulk change / query and skip single-story CLI. Rejected — agents and builders need one-card hand-off and link edits; bulk is triage, not the daily hand-off path named here.
- Auto-set `holder` on agent-start / gate park inside the engine and skip CLI. Rejected — c-118 interview parked auto-updates with the CLI/SDK cards; this card should own explicit `hold` / `own` and any auto rule that follows.

## The pain, grounded

pain: a builder or agent in the terminal cannot link, label or hand off a story the way the board will, so clearing a `blocked_by`, changing labels or naming who holds the card means editing `cards.json` or waiting for UI. Source: card story on c-128 ("agents and people do in the terminal what the board does"), `docs/artifacts/codeloop-ui-design.html` (holder hand-off history; labels; typed links), specs/120 and specs/119 interviews (Up next / blocked flag must wait on a link-edit path — this card), and `.codeloop/wiki/architecture/ui.md` (cli layer after sdk). Confirmed by no link/label/hold/own commands in `src/commands/` and no those fields on `Card` until c-118 lands.

## Risks

- Schema dependency: commands are useless until c-118 stores and validates holder, owner, links and labels; sequence api (c-118) → sdk (c-127) → this card, or stub against writeCards once the fields exist.
- Layering: CLI must not import `src/lib/` services directly (`docs/architecture.md`, layering test); ship or extend SDK methods in c-127 (or a thin slice here) before wiring Commander.
- Gate `awaiting` (role) vs `holder` / `own` (person or agent): setters must not rewrite `awaiting`; owner-person changes are structural and should stay refused to agents the way `card done` is.
- Hand-off history: the design says every hand-off is kept; a silent field write without an event breaks "who had this".
- Unblock path: once Up next skips `blocked_by` (c-120), `story link` (add/remove) is the escape hatch; a command that can only add links would strand cards.
- Scope bleed into c-129 (query and release notes from the terminal): this card owns single-story field and link commands only.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:180 — holder changes as the story moves; history keeps every hand-off; labels and typed links on the story
- source: src/commands/card.ts:67 — card lifecycle CLI only; no link, label, hold or own
- source: .codeloop/wiki/architecture/ui.md:63 — build order: api → sdk → cli (c-128, c-129)
- source: .codeloop/wiki/features/ui-cli.md — feature: link, label, hand off, query and release notes from the terminal
- source: specs/118-stories-carry-a-holder-an-owner-a-type-a/interview.md:13 — hand-off and CLI setters deferred to c-128 / c-129; c-118 stores only
- source: docs/architecture.md:14 — CLI and UI are thin peers on the SDK; neither calls a service directly
- source: https://cli.github.com/manual/gh_issue_edit — gh issue edit --add-label / --add-assignee as the familiar terminal pattern for label and hand-off

verdict: build
