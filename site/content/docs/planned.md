---
title: Planned
description: What is on the board and not in 0.3.0. Nothing on this page works today.
---

Everything on this page is <span class="planned">planned</span>. It is here so the rest of the docs can stay about what the CLI does now. The order is the order on codeloop's own board.

## Size-adaptive lanes

A card gets a size from a short investigate stage that reads the code, and the founder confirms it. Lane stages take a `when:` clause, so a trivial card skips research, mock and spec and goes build, verify, review. Today every build card goes through every stage. This is the biggest gap in the [compare table](/docs/compare).

## Splitting a card

`codeloop card split <id>` turns an L card into two or three sibling stories under the same feature, each following the story standard, each with `split_from: <parent>`. The spec template already names the command. Until it exists, `codeloop start ... --feature <slug> --epic <parent>` by hand.

## Cost per card

`run --agent` records tokens and dollars per stage from the host's output. `stats` and the board show cost per shipped card beside human turns and first pass. Today a run records its start, end and exit code, and nothing about cost.

## Executable rules

A rule in `rules.md` can carry a `check:` command. `codeloop check rules` runs them as part of the build and review checks. A rule with a check blocks; a rule without one advises. Today rules are prose the skills read.

## Review as triage

`review.md` becomes one row per finding with a verdict (fix now, defer, reject) and evidence. Deferred findings become triage cards with the source card and SHA. Today the review check is `--has 'verdict: approve'`.

## Importers for current formats

`import bmad` reads `tickets.toml` and the newer artifact layout, with status mapped to a stage. `import speckit` also brings in checklists and clarifications. Today `import bmad` reads `sprint-status.yaml`, which newer releases of that tool no longer write.

## Plugins

Core stays the engine: lanes, cards, gates, inbox, run, verify, wiki, learn, stats, cloud sync, render, the board. Everything stack-specific moves to plugins with one shape, loaded from `.codeloop/plugins/`, `~/.codeloop/plugins/`, an npm package or the Protobox catalog:

```text
plugins/<name>/
  plugin.yaml      name, kind (stage | specialist | lane | integration | importer),
                   detect (globs that mean "this repo uses me"), languages, layer tag,
                   stages it serves, spines it owns, checks it provides
  rules.md         what the output must look like; each rule may carry a check: command
  skill.md         the prompt body; rendered per host by core
  patterns/        templates the skill copies from
  gotchas.md       learned; core's learn promotes entries into rules.md
  checks/          scripts core runs as done-checks (exit 0 / non-zero)
  spines/          templates for the living docs (ERD.md, contracts.md, DESIGN.md)
```

| Kind | Examples | What core does with it |
|---|---|---|
| stage | interview, whys, options, premortem, scope-cut | A lane can name the stage; core runs its skill, output and check |
| specialist | backend-nestjs, backend-fastapi, ui-shadcn, marketing-site, qa, deploy, review | `init` maps build stages to the specialist whose `detect` matches; its rules become checks; its spines must change when its files change |
| lane | market, analyze, scan, triage, and any founder lane | Installed as a lane file plus the stages and specialists it needs |
| integration, importer | github, slack, vercel, fly; speckit, bmad | Reconcile, notify, deploy; import |

The first two specialists ship together, one for NestJS and one for FastAPI, so the plugin interface is proven on two languages before it is called an interface. Today the ten skills from `init` are the only stage prompts, and `codeloop pack build` is the only packaging command.

## A hosted board with roles

The cloud copy on Protobox becomes a board a team opens, with authenticated owner and reviewer roles, so `gate check` can say who approved. Today approvals are local events, and `gate check` says so.

## An interview stage in a lane

A lane stage that asks the owner one question at a time and writes the answer into the spec section it changes. `codeloop ask` and `codeloop answer` ship today, and the inbox and the board show the questions with a recommended answer; no shipped lane has a stage that uses them.

## An importer for Linear, Jira or GitHub

A ticket id now lives on the card (`ticket:`, shipped — see below). What is still planned is an importer that reads a Linear, Jira or GitHub tracker directly, the way `import speckit` reads a Spec Kit folder. Today the id comes in one card at a time, from a `"ACME-412: "` title prefix or `--ticket`.

## Shipped since this page was first written

No longer planned: story fields on a card (`--persona`, `--can`, `--so`, `--size`) with the story check; `ask` and `answer` with the questions band in the inbox; RICE on features with P1 to P4 bands; the Initiatives page and `initiative tree`; the SDK the CLI and the board both call; a `ticket:` field on the card, set from a ticket-style title prefix or `--ticket` and printed by `card show`. They are on `main` and not yet in the npm package; the README lists what the next publish carries.
