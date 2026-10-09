---
title: Story standard
description: How a card is titled, written, sized and tied to a metric. The check behind codeloop check story.
---

How a card is written, sized, titled and tied to a metric. Every card on a codeloop board follows it, and `codeloop check story <card>` fails a card that does not. This is `docs/story-standard.md` from the codeloop repo, as shipped in 0.3.0.

## The hierarchy a card sits in

```
NORTH STAR  one measurable outcome and the stage that is leaking      (.codeloop/config.yaml north_star:)
  └ BET     a goal and a hypothesis: "we get X by doing Y, because Z"  (wiki/bets/<slug>.md)
      └ FEATURE  a capability, titled by what the user can now do        (card.feature)
          └ STORY  one independent, shippable slice = one card             (the card)
```

A card names its feature and bet. A bet names the metric it moves and the pain it answers. A pain is grounded in research with a source, or marked `assumption:`. A feature with no pain and no metric is not ready for the board.

## Personas

Every card names one. Add repo personas under `personas:` in `.codeloop/config.yaml`, ranked, each with its top pains.

| Persona | Who |
|---|---|
| founder | Owns the product, approves gates, is away from the keyboard most of the day |
| builder | A developer or an agent doing a stage |
| reviewer | Approves pull requests |
| dev | A developer installing or adopting codeloop in their repo |
| visitor | Reads the site or README before installing |
| team | Several people on one hosted board |

## The title is what the user can now do

A verb phrase a user would say. Never the mechanism, never a codename, never a file, flag, command or key.

| Write | Not |
|---|---|
| Small fixes skip the ceremony | Size-adaptive lanes: investigate stage sets size, stages carry when: |
| Get pinged when a card needs me | Gate notifications to Slack or a webhook |
| Bring my Spec Kit or BMAD work with me | Importers: BMAD tickets.toml; Spec Kit clarifications |
| Make any AI know your documents in one paste | Paste→Link |

Check: at most twelve words; none of `` ` `` `--` `:` `.yaml` `.md` `/` `()`; no camelCase token.

## The story has three parts and the third is required

```
As a <persona>, I can <what>, so that <pain relieved>.
```

`what` is the title with the detail the title left out. `so that` names the outcome; no outcome, no card. Two unrelated outcomes mean two cards.

Check: all three parts present; persona is known.

## INVEST, and the first story is the thinnest usable thing

Independent, Negotiable, Valuable, Estimable, Small, Testable. Stories under a feature stack: story 1 is the thinnest version a user could use; later stories add on. Never a story that only makes sense once the others ship.

## Acceptance: one to five lines, outcome checks not steps

```
acceptance:
- US1 Given <state>, when <action>, then <result>.
```

Each line is something a user would notice, asserted through the real seam (API, SDK, CLI, UI). Each becomes at least one use case and at least one task. Six lines means split.

Check: one to five lines; each starts `Given`, contains `when` and `then`.

## Size and split

| Size | Means |
|---|---|
| S | hours |
| M | one to two days |
| L | three days or more, or needs design; split it |

A card ships in under a week. Bigger is an epic: split with SPIDR (paths, interfaces, data, rules, spike) into two or three children, each a story in this standard, each with `epic: <parent>`. More than three children is a lane, not an epic.

Check: `size:` is S, M or L; L cards cannot pass the spec gate unsplit.

## One metric per card

The card names the stage metric it moves, threaded up: story → feature → metric → bet goal → north star. `no-data` means instrument first, not guess. Lanes already carry a `metric:`; a card may override it.

Check: `metric:` present and defined under the lane or in `wiki/numbers/`.

## Unlock before build

Before a card enters build, research states what already exists for it:

| Verdict | Meaning | Default move |
|---|---|---|
| have | shipped and exposed | nothing, close the card |
| unlock | built but not exposed | expose it, do not rebuild |
| port | exists in a sibling repo | decide port vs build |
| build | absent | build |

Check: `research.md` has `exists: have|unlock|port|build` with a path or URL when it is not `build`.

## Done when is a command or a screen

The spec's `done_when:` line names a command that exits 0 or a screen a person opens. Never "all stories complete".

## Technical detail lives below the story

`plan.md` carries files, commands, flags and schema. `tasks.md` carries up to eight layer-tagged tasks in dependency order, each naming the acceptance line it satisfies. The card and `spec.md` carry none of that.

## Keep plumbing off the board unless it moves a metric

Branch protection, CI setup, refactors and renames are logistics. They are cards only when they move a lane metric; otherwise they are tasks under a story that does.

## Sequence by the bottleneck

The plan lane ranks cards by RICE and by which funnel stage is leaking. Do not build past a broken upstream stage.

## Where the checks run

- `card new` and `card propose` refuse a title that fails the title check and a story missing `so that`.
- `spec check` fails on a malformed story or acceptance block, a missing size, metric or `exists:` verdict, or an unsplit L.
- `check story <id>` runs all of it on demand and in the spec gate.

## What 0.4.1 enforces

| Rule | Enforced by |
|---|---|
| Title says what the user can do, with none of the banned characters | `start`, `card new`, `card propose`, `check story` |
| Story has all three parts and a known persona; size is S, M or L; points are 1, 2, 3, 5 or 8 | `start`, `card new`, `card propose`, `check story` |
| `spec.md` has a filled `Story:` line, `size:` S, M or L, a `metric:` that is not a placeholder, and a `done_when:` that is a command or a screen | `spec check` |
| One to five acceptance lines, each reading given, when, then; every task layer-tagged; every acceptance line has a task | `spec check` |
| An L card cannot pass the spec gate unsplit | `spec check`; split it with `codeloop card split <id> <titles...>` |
| A `verdict:` line and enough `- source:` lines in research | `check research` |
| At least three questions on the card, each answered, before the interview stage passes | `check questions` |

The `exists:` verdict is in the template and the standard; `spec check` does not read it in 0.4.1. `north_star:` in `config.yaml` is a convention the standard asks for; no command reads it.
