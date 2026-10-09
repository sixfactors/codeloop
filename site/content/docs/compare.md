---
title: Compare
description: codeloop next to the two kinds of agent-workflow tool it is most often weighed against. Where it is ahead, and where it is not.
---

Two kinds of tool are common today. **Spec-first tools** give an agent a sequence of slash commands that write a specification, a plan and a task list before any code, with one feature per branch and folder. **Agile-persona tools** give an agent a cast of roles (analyst, architect, developer, reviewer) and a ticket list, and run the roles in turn. Both are good at getting a better plan out of a model. This table is about what happens after the plan.

The rows are from reading their documentation and issue trackers in October 2026. Where codeloop is behind, the row says so.

## The table

| | Spec-first tools | Agile-persona tools | codeloop 0.4.1 |
|---|---|---|---|
| Unit of work | A feature: one branch, one spec folder | A ticket in a list, with artifacts per initiative | A card with a story, in a lane. `.codeloop/cards.json` |
| The flow | Constitution, specify, clarify, plan, tasks, implement | Clarify, plan, build and verify, learn; ceremony sized after a look at the code | A lane file per kind of work: build, deploy, market, plan, triage, scan, analyze, learn |
| What decides a step is done | The agent, following the prompt. A shell script checks that the plan file exists | The agent writes the ticket's status | A command exits 0. `done.cmd` on every stage; the engine runs it |
| Where a person decides | In the chat, when the agent asks | A ticket stops one state short of done for a human to close | Named gates in the lane, with a role. Public steps stop before they run |
| Can the model skip a gate | Yes; gates are prompt text | Yes; status is model-written | No. An agent process cannot approve, and the engine refuses it |
| Board | None; a branch and checkboxes | An ordered ticket file | Cards, `inbox`, a web board, an optional cloud copy |
| Beyond the code | An idea-assessment extension | Modules for other kinds of work | Lanes for release, launch post, weekly plan, triage, competitor scan, growth review |
| Deploy | Not covered | Not covered; a human opens the PR | Staging and live stages, CI templates, a GitHub environment as the prod gate |
| Evidence | Verdicts from a bug extension | A review verdict per finding | `evidence/<nnn>/verify.md` with the commit SHA, per use case. An approval is bound to the output and the check; change either and the card parks again |
| A test that cannot fail | Not detected | Not detected | `verify --mutate` exits 4; `lane eval` refuses a changed check with no failing fixture |
| Learning | A tech-stack block in the agent context | A memory log per artifact | Wiki pages with frequency; critical at 3, promoted to rules at 10; lanes change through proposal, eval, promote |
| Unattended | A converge command inside one session | A loop command | `run --agent` from cron, with triggers, WIP and a per-agent run cap |
| Numbers | None | None | `stats`: human turns, unattended span, cycle time, rework, first pass per gate, per lane version |
| Priority | None; the order of the feature folders | The order of the ticket list | RICE on the feature, P1 to P4 bands by quartile; the inbox, `card list --band` and the Initiatives page sort by it |
| One SDK under CLI and UI | Slash commands only; no API | Slash commands only; no API | `@protoboxai/codeloop/sdk`: the CLI and the board call the same client, and each operation is tested through the HTTP and the local transport against one project |
| Hosts | Forty or more, through per-host command folders | Twenty or more, as generic skills | Claude Code, Cursor, Codex, and MCP |
| Ceremony for a one-line fix | The full pipeline | Sized after a short investigation | The full lane; an L card is refused at the spec gate until split. Size-adaptive lanes are planned |
| Cost per card | Not reported | Not reported | Not reported. Planned |
| Importing from the other | | | `import speckit`; `import bmad` reads an older file layout |
| Install | A Python tool plus `uv` | A Node installer, or generic skills | `npm install -g @protoboxai/codeloop` |
| Age and community | Large | Large | Small. 0.4.1, one team, MIT |

## What the table says

Spec-first and agile-persona tools help an agent write a better plan and then hand the code back to you. codeloop runs the whole loop, checks each stage with a command instead of a prompt, stops only at the gates you chose, and counts what happened. The [founder's week](/docs/start/founders-week) is the proof for every row in the last column.

Where codeloop is behind: a trivial fix goes through every stage of the build lane, the cost of a card is invisible, three hosts is fewer than forty, and the BMAD importer reads a file its current releases no longer write. Each is on the [Planned](/docs/planned) page.

## Bringing work across

```sh
codeloop import speckit
codeloop import bmad
```

One card per existing feature or story. The source folders are only read. Lanes keep their checks, so an imported card goes through the same gates as any other.
