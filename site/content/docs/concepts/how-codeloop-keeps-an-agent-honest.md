---
title: How codeloop keeps an agent honest
description: Three layers, context files, MCP tools, and hooks/git/watch, so the host's agent follows the active card even when the chat asks it not to.
---

A chat can tell an agent to skip the card and edit whatever it likes, and the agent may do it.

codeloop is not the agent. In Cursor, Copilot and Claude Code, the person chats with the host's
own agent; codeloop's job is to make that agent pick the next card, follow the stage's skill, ask
its open questions, and get warned or refused when it tries to bypass the workflow. Three layers
do this, in order of how hard they are to ignore:

| Layer | What it is | Can the agent ignore it? |
|---|---|---|
| Context files | `CLAUDE.md`, `.cursor/rules/codeloop.mdc`, `.github/copilot-instructions.md`, `AGENTS.md` | Yes, these are read, not enforced |
| MCP tools | `brief`, `ask`, `answer`, `check`, `propose`, `inbox`, plus the existing card tools | Yes, if the host never calls them |
| Hooks + git + watch | SessionStart/PreToolUse/UserPromptSubmit/Stop (Claude Code), sessionStart/sessionEnd/subagentStart/subagentStop (Cursor), pre-commit/pre-push, `watch --guard` | No, these run outside the chat |

## Layer 1: context files

`codeloop render` writes [the standing protocol](https://github.com/sixfactors/codeloop/blob/main/templates/protocol.md), with the active card
filled in, into a marked block in `CLAUDE.md`, `.github/copilot-instructions.md` and `AGENTS.md`,
and as a whole file at `.cursor/rules/codeloop.mdc` with `alwaysApply: true`. Running it twice
changes nothing; text outside the markers is kept.

```sh
codeloop card activate c-012   # or `codeloop start "<title>"`, which activates the new card
codeloop render                # fills CLAUDE.md, copilot-instructions.md, AGENTS.md, codeloop.mdc
```

This layer is advisory. A model can read `CLAUDE.md` and still edit a file the active card never
named, which is what layer 3 exists to catch.

## Layer 2: MCP tools

`codeloop mcp` serves `brief`, `ask`, `answer`, `check`, `propose` and `inbox` (plus the card tools
`next_up`, `get_card`, `advance`, `approve`, `reject`, `task_done`, `wiki_inject`, `wiki_capture`)
over stdio. Every tool calls the engine directly, so a refusal comes back as the engine's own
`RefusalError` message, the host agent sees exactly why, not a generic tool error.

| Tool | Does |
|---|---|
| `brief` | The current stage's brief as plain text: skill, output, the check that must pass, feedback, wiki pages |
| `ask` / `answer` | Puts up to 5 questions in the card's interview, or answers one by number |
| `check` | Runs the stage's check without moving the card, pass/fail plus its output |
| `propose` | Drops a card in the inbox; nothing starts it until the owner promotes it |
| `inbox` | Gates waiting on a person, what shipped, numbers per lane |

This layer only runs if the host is configured to call the MCP server. Copilot in VS Code has no
hook system, so MCP is its only enforcement surface.

## Layer 3: hooks, git, and watch

These run outside the chat, so they catch an agent that never reads the context files or never
calls an MCP tool.

**Claude Code** (`codeloop init --hooks` or `codeloop render --hooks` merges
[the Claude hooks template](https://github.com/sixfactors/codeloop/blob/main/templates/hooks/claude-hooks.json) into `.claude/settings.json`, additively, it never drops an
existing hook):

| Event | Runs | Effect |
|---|---|---|
| `SessionStart` | `codeloop guard session` | Prints the active story and the instruction to run its brief; with none active, the top three open stories by priority band and the `card activate` command, so the session starts from the board's order |
| `PreToolUse` on `Edit\|Write\|MultiEdit` | `codeloop guard edit` | Exits 2 with no active card, or when the path is outside the active card's plan and the plan names files |
| `UserPromptSubmit` | `codeloop guard prompt` | Prints the active card, its stage, open-question count, and flags a prompt whose words match none of the card's title (a heuristic, stated as one). Exits 2, which blocks the prompt, when the repo has open stories and none is active; a repo with no stories yet passes |
| `Stop` | `codeloop wiki capture --quiet` | No-ops without a title; the hook is a reminder slot, not yet an auto-summarizer |

**Cursor** (same install, writes `.cursor/hooks.json` from [the Cursor hooks template](https://github.com/sixfactors/codeloop/blob/main/templates/hooks/cursor-hooks.json)):

| Event | Runs | Effect |
|---|---|---|
| `sessionStart` | `codeloop presence start` | Writes `.codeloop/state/presence/<session>.json`: host, session id, machine |
| `sessionEnd` | `codeloop presence end`, `codeloop guard release` | Removes that file and releases the session's active story, so its files are free for other sessions |
| `subagentStart` / `subagentStop` | `codeloop presence event <kind>` | Appends a line to `<session>.events.jsonl` |
| `beforeShellExecution` | `codeloop-hook bash --format cursor` | The shell guard: `codeloop approve`, `reject`, `answer`, `card done|drop` and `--as owner|reviewer` go to the person as a permission prompt, and their Allow is the decision |
| `stop` | `codeloop guard stop` | Records in the active story's activity that the session finished a turn |

`codeloop whoami` reads the presence files plus your git identity and the active card.

**Git** (a `pre-commit` and a `pre-push` hook, installed next to the existing `commit-msg`
hook by the same `--hooks` flag):

| Hook | Runs | Effect |
|---|---|---|
| `pre-commit` | `codeloop guard diff --staged` | Refuses with the list when a staged file is outside the active card's plan; warns (does not refuse) when the plan has no `## Files` list yet |
| `pre-push` | `codeloop gate check <active card> --require local` | Refuses the push until the active card's local gate is approved |

Both skip cleanly with no `.codeloop/`, no active card, or `CODELOOP_GUARD=off`.

**Watch**: `codeloop watch --guard` appends a line to `.codeloop/state/warnings.jsonl` (and prints
it) whenever a file changes with no active card. `codeloop inbox` reading this as a `warnings`
section, and serving it at `/api/inbox`, is not built yet, today it is a file you can `tail`.

## What enforces what, per host

| Host | Advisory (layer 1) | Tool-gated (layer 2) | Enforced regardless of chat (layer 3) |
|---|---|---|---|
| Claude Code | `CLAUDE.md` block | MCP (`init` writes `.mcp.json`) | `guard edit`/`guard prompt` on every edit and prompt, `Stop` hook |
| Cursor | `.cursor/rules/codeloop.mdc` | MCP (`init` writes `.cursor/mcp.json`) | presence hooks and a shell guard before every command, no edit-time guard (explained under "What is not done") |
| Copilot (VS Code) | `.github/copilot-instructions.md` | MCP, if configured | none, Copilot has no hook system; context + MCP are the whole story |
| Headless (CI, a scripted agent) | `AGENTS.md`, if the harness reads it | MCP, if wired | git hooks and `watch --guard` still run, since they are outside any chat |

## What is not done

- **Cursor has no edit-time guard.** Cursor gets presence hooks and a shell guard before every
  command, but nothing on Cursor refuses an edit the way `guard edit` does for Claude Code. Cursor
  documents a `preToolUse` hook event that codeloop does not wire.
- **The shape of `.cursor/hooks.json` is not confirmed against Cursor.** Cursor does not publish a
  full schema for it, so codeloop writes the simplest plausible shape
  (`{"hooks": {"<event>": [{"command": "..."}]}}`). If Cursor's real format differs, the merge
  still works and only the written file's shape needs correcting.
- **The pre-commit hook calls `codeloop guard diff --staged`**, which lists staged files outside the
  active card's plan. There is no `check diff --staged`.
- **Plan enforcement starts once `plan.md` has a non-empty `## Files` list.** Before that, early
  in a card's research/spec stages, `guard edit`, `guard diff` and the pre-commit hook only warn.
  This is deliberately permissive: a card with no stated file scope has nothing to enforce against
  yet.
- **`codeloop inbox` has no `warnings` section**, and there is no `GET /api/presence` or
  `GET /api/inbox` warnings field. `watch --guard` and the Cursor presence hooks write their own
  files under `.codeloop/state/`; wiring them into the board is a follow-up.
