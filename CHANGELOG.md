# Changelog

One section per published version of `@protoboxai/codeloop`, newest first. A version is published
when `npm publish` ran for it; "unreleased" is on the branch and not on the registry. Entries say
what a user can now do, not which files moved. `src/__tests__/changelog.test.ts` fails the build
when package.json names a version this file has no heading for.

## 0.5.0 (unreleased)

### Watch an agent work a story
- Every card has an activity stream (`.codeloop/state/activity/<card>.jsonl`): the Claude Code and
  Cursor hooks record edits, commands, prompts and session start and stop on the session's active
  card; headless runs copy their log into it; checks, commits (via a `Card:` trailer and the new
  post-commit hook) and gate events land there too. `activity: off` in config.yaml turns it off.
- `GET /api/cards/:id/activity` with cursor paging, `activity` frames on `/api/events`,
  `cards.activity` and `cards.activityStream` on both SDK transports, and
  `codeloop card activity <id> --follow` in the terminal.
- Sessions carry a host, a machine and a label ("claude on <machine>, since HH:MM"); the board and
  Home show the label instead of a UUID.

### Board and Home
- Home shows what needs you, what is moving, which agents are working and what shipped this week;
  the board reads as six states, each screen loads with one call.
- Approvals hold while the card's own work is unchanged and ignore verify's workspace line.
- Page artifacts open from the board, in the hub too.

### Verify and mock
- `codeloop verify` runs use cases in an export of HEAD, so other sessions' uncommitted edits in a
  shared tree cannot fail a card, and requires a live walk on the real dev stack.
- Mocks are built from a design system the project owns and are written beside the spec.
- A promoted proposal gets its spec folder.

### Wiki and hub
- One wiki shape codeloop owns, with agent-written architecture pages judged by a check.
- One local hub serves every registered project under `/p/<id>`; stuck and finished stories stop
  holding slots; a person can sign in and approve from any terminal.
- One active story per session, with file leases and shared paths; stories waiting on the person
  stop counting against WIP; split children wait in Up next.
- `lane update` installs missing lanes; the inbox lists failing checks and counts the backlog.

## 0.4.3 (2026-10-11, published)
- Mermaid diagrams render in the wiki; `wiki init` seeds the architecture folder in the C4 shape.
- The legacy board and knowledge files are dropped in favour of the wiki.

## 0.4.2 (2026-10-10, published)
- `codeloop shape`: a problem in, an epic of ordered shippable stories out.
- `codeloop run` advances a card until it stops on its own; `init` configures the agent; sessions
  start from the board.
- The board is a kanban again.
- Headless runs carry their card; hooks land where husky looks; `render` follows `init`; the guard
  appends to a hook the repo already has.
- A file in the repo counts as a research or brief source; `serve --bg` refuses a taken port.

## 0.4.1 (2026-10-09, published)
- Stage skills at depth, an interview stage with recommended answers, and a strict `spec check`.
- A host agent stays on its card from Claude Code, Cursor, Copilot and git.
- Wiki outline from the repo, skill eval, and three opinionated artifact kinds.

## 0.4.0 (2026-10-09, published)
- The codeloop app: board, inbox, initiatives, wiki, artifacts, stats, settings and setup, served by
  `codeloop serve`.
- Docs site with a generated command reference and a trial kit.
- First-user path verified from a packed install.

## 0.3.0 (2026-10-08, published)
- Renamed to `@protoboxai/codeloop`, site at codeloop.protobox.ai.
- Lanes as YAML files run by one engine, with gates, cards, inbox, `run --agent`, verify with
  evidence, CI templates, wiki and learn, `stats`, and a Dev Loop pack for Protobox.

## 0.2.0 (2026-10-02)
- Ten skills installed into `.claude/commands`, `.cursor/commands` and `.agents/skills`; skill
  registry with install, search and publish; watch mode; a static kanban board.

## 0.1.1 and 0.1.0 (2026-02)
- First release: `init`, `status`, `update` and four skill templates over `.codeloop/` knowledge
  files.
