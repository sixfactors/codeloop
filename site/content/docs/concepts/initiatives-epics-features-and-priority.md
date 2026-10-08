---
title: Initiatives, epics, features and priority
description: The four levels above a card, where the RICE score lives, and how the inbox and the Initiatives page order work by it.
---

A card is a story: one slice a user could use, shipped through one lane run. Above it sit three levels that are wiki pages, not cards, so the board never mixes containers with work. The names follow what Jira, Linear, Azure DevOps and Aha! converge on; the mapping is in the repo's `docs/terminology.md`.

## The levels

| Level | codeloop | What it is | Lives in |
|---|---|---|---|
| Strategy | **initiative** | A goal, a hypothesis and the metric that proves it. Open-ended. | `.codeloop/wiki/initiatives/<slug>.md` |
| Delivery | **epic** | An outcome that takes several features and usually more than one release. Optional: a feature may hang on an initiative directly. | `.codeloop/wiki/epics/<slug>.md` |
| Value | **feature** | A capability the user gets, titled by what they can now do. Ships in one release. One to many stories. | `.codeloop/wiki/features/<slug>.md` |
| Unit of work | **story** (a card) | One slice a user could use, in under a week. | the board, `specs/NNN/` |
| Step | **task** | One layer-tagged line, traceable to an acceptance line. | `specs/NNN/tasks.md` |

Rules that follow:

- A story names its `feature`. A feature names its `initiative` and, when there is one, its `epic`. Nothing names two parents.
- Size lives on the story only. A feature's size is the sum of its stories. An epic is never estimated.
- Splitting a story makes sibling stories under the same feature, each with `split_from: <id>`.
- Titles at every level say what the user can now do. Initiatives and epics may be phrased as outcomes: "Founder ships without ceremony".

The pages are made from the terminal: `codeloop feature new <slug>`, `codeloop epic new <slug>`. Initiatives are written by hand under `.codeloop/wiki/initiatives/` with `title`, `status`, `metric`, `goal`, `persona` and `hypothesis` in the frontmatter. A card is tied to its feature at creation (`codeloop start ... --feature <slug>`, or the Feature field in the board's New card dialog) or later with `codeloop card migrate-features`.

## RICE lives on the feature

Every tool that ranks puts the score on the unit of value, not on the unit of work. codeloop does the same.

```sh
codeloop feature score <slug> --reach 8 --impact 7 --confidence 6 --effort 2
```

Reach, impact and confidence are 1 to 10; effort is weeks. The score is `reach × impact × confidence ÷ effort`, one decimal, derived on every read and never stored. No rice block, no score.

| Level | Score | Band |
|---|---|---|
| feature | From its `rice:` block | P1 to P4 by quartile over the features that have a score: the top quarter is P1, the bottom quarter P4, equal scores share a band. A feature without rice is P4. |
| story | Inherited from its feature. `--effort <weeks>` on the card replaces the feature's effort in the card's own score; the band stays the feature's. | Inherited. A card with no feature, or naming one with no page, is P4. |
| epic | The sum of its features' scores | none |
| initiative | The sum of the scores of the features naming it | none |

Bands are quartiles over the whole set, so scoring one feature can move another's band. `codeloop feature list` prints every feature highest first; `codeloop initiative tree <slug>` prints initiative › epics › features › stories with the score at every level and done/total per feature.

## What the inbox does with it

`codeloop inbox` lists parked cards highest score first, then oldest parked first; `--by age` is oldest first only. `codeloop card list --band P1` and `codeloop inbox --band P1` narrow to one band; `--initiative`, `--epic` and `--feature` narrow by the chain.

The board's Inbox page shows the gates waiting on a person in bands, each band a section with its own heading, P1 first:

| Band | Heading on the board |
|---|---|
| P1 | P1 · do now |
| P2 | P2 · next |
| P3 | P3 · later |
| P4 | P4 · someday |
| no score | Unranked |

Inside a band the highest score is first. Each row has the card's title, lane and stage, the gate name and a Review button that opens the card drawer with Approve and Reject. The filter bar above narrows by initiative, epic, feature, priority band and "Needs me", which keeps only the gates your role approves and the open questions. Below the gates are three more sections: Questions to answer (each with its band chip and score), Shipped this week, and Numbers per lane.

## The Initiatives page

The board's Initiatives page is a table, one row per initiative, highest score first. Columns: Initiative, Status, Metric, Goal, Epics, Features, Stories (done of total), Score. The counts come from each initiative's tree, so the table and the detail page print the same numbers. Opening a row shows the tree: the initiative's epics, the features under each, and the stories under each feature, with the score and band at every level. A feature naming the initiative but no epic sits directly under the initiative. The same tree is `GET /api/initiatives/<slug>/tree` and `codeloop initiative tree <slug>`.

With no initiative pages the table says so and names the folder to write one in.

## Releases and environments, briefly

codeloop has no sprint object; the cadence is the lanes' schedule. The unit that ships is the release, a git tag (`vYYYY-MM-DD.N` by default). A feature carries `release:` with a target tag or `next`, and is released when every one of its stories is live, which is derived from the prod ref and never set by hand. A card's deployment state (`staged`, `live`) is shown beside its stage, never as a stage of its own. [Cards and gates](/docs/concepts/cards-and-gates) has the stage and gate side; [The inbox](/docs/concepts/the-inbox) has the rest of the inbox.
