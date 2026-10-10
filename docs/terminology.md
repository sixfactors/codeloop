# Terminology

Status: current. The words codeloop uses for work, releases and environments, and how they map to the tools people come from. Survey of those tools: Jira, Linear, GitHub, Azure DevOps, Shortcut, Aha!, Productboard (2026-10-07).

## The levels

Every tool converges on four layers: a strategy container, a delivery container, a unit of value, and an implementation step. They disagree on names. codeloop uses:

| Level | codeloop | What it is | Lives in | Estimated | Jira | Linear | Azure DevOps | Aha! |
|---|---|---|---|---|---|---|---|---|
| Strategy | **initiative** | A goal plus a hypothesis and the metric that proves it. Open-ended. | `wiki/initiatives/<slug>.md` | no | initiative / theme | initiative | — | goal / initiative |
| Delivery | **epic** | An outcome that takes several features and usually more than one release. Has a target and an end. Optional: a feature may hang on an initiative directly. | `wiki/epics/<slug>.md` | no, rolls up | epic | project | epic | epic |
| Value | **feature** | A capability the user gets, titled by what they can now do. Ships in one release. One to many stories. | `wiki/features/<slug>.md` | rolls up from stories | — (no level) | milestone | feature | feature |
| Unit of work | **story** (a card) | One slice a user could use, in under a week, through one lane run. | the board, `specs/NNN/` | yes: size S/M/L, points optional | story | issue | user story | requirement |
| Step | **task** | One line in `tasks.md`, layer-tagged, traceable to an acceptance line. | `specs/NNN/tasks.md` | no | sub-task | sub-issue | task | to-do |

Rules that follow:

- A card is always a story. Epics and features are wiki pages with frontmatter, not cards, so the board never mixes containers with work.
- A story names its `feature`. A feature names its `epic` (optional) and its `initiative`. Nothing names two parents.
- Splitting a story makes sibling stories under the same feature, each with `split_from: <id>`. The old `epic:` field on a card is retired; `card split` writes `feature:` and `split_from:`.
- Size lives on the story only. A feature's size is the sum of its stories; an epic is never estimated.
- Titles at every level say what the user can now do. Initiatives and epics may be phrased as outcomes ("Founder ships without ceremony").

## RICE: where the score lives

Every tool that ranks puts the score on the unit of value, not on the unit of work. codeloop does the same: RICE lives on the **feature** and everything else reads it.

| Level | Score | Band |
|---|---|---|
| feature | `rice: { reach, impact, confidence, effort }` in its frontmatter; reach, impact and confidence on 1–10, effort in weeks. `score = reach × impact × confidence ÷ effort`, one decimal. No rice, no score. | P1–P4 by quartile over the features that have a score: the top quarter is P1, the bottom P4, equal scores share a band. A feature without rice is P4. |
| story (card) | Inherited from its feature. A card may carry `effort:` (weeks) to replace the feature's effort in its own score; the band stays the feature's. A card with no feature, or naming one with no page, has no score and is P4. | inherited |
| epic | The sum of its features' scores, whichever initiative they serve. In an initiative's tree an epic shows only the features naming that initiative, and its score there is the sum of those. | — |
| initiative | The sum of the scores of the features naming it. | — |

Rules that follow:

- `codeloop feature score <slug> --reach --impact --confidence --effort` writes the rice block; the score and band are derived on every read, never stored. Bands are quartiles over the whole set, so scoring one feature can move another's band.
- A card's `initiative`, `epic` and `feature` on the board are the slugs of the chain its feature names. A card without a feature keeps whatever text it was given.
- The inbox lists parked cards by score, highest first, then the oldest parked first; `codeloop inbox --by age` is oldest first only. `codeloop card list --band P1`, `GET /api/cards?band=P1&sort=score` and `GET /api/inbox?band=P1` narrow by band; `initiative=`, `epic=` and `feature=` narrow by the chain; `needsMe=1` keeps only the gates the caller's role approves and the open questions.
- `codeloop initiative tree <slug>` and `GET /api/initiatives/:id/tree` print initiative › epics › features › stories with the score at every level and done/total per feature.
- `codeloop card migrate-features` reads `.codeloop/migrations/features.yaml` (`c-NNN: <feature slug>` per line) and writes `feature:` and the feature's initiative onto each card; an unknown slug refuses the whole run.

## Time-box vs release

Tools split into two ideas and most model only one:

- A **time-box** is when a team works: sprint, cycle, iteration. Team-owned, repeating.
- A **release** is what ships together to customers: version, fix version, release. Product-owned, may span several time-boxes.

codeloop has no sprint object. The cadence is the lanes' schedule: plan on Monday, triage nightly, analyze on Friday. The unit that ships is the **release**:

| Term | codeloop | Means |
|---|---|---|
| **release** | a git tag, `vYYYY-MM-DD.N` by default, semver if the repo uses it | The set of features that went live together. The deploy lane starts on the tag. |
| `release:` on a feature | target tag or `next` | Where the feature is meant to ship. The roadmap groups by it. |
| **unreleased / released** | derived | A feature is released when every story is live, which is derived from the prod ref, never set by hand. |

## Environments

Every CI tool with deployments uses the same names and gates promotion with named approvers on the environment, not with a work-item status. codeloop does the same:

| Environment | codeloop stage | Check | Who promotes |
|---|---|---|---|
| **local** | `verify` in the build lane | `codeloop verify` evidence at HEAD | owner, at the local gate |
| **staging** | `staging` in the build lane, `staging` → `verify` in the deploy lane | `deploy.staging` command then `verify --env staging` | automatic after merge |
| **production** | `live` in the build lane, `prod` → `smoke` in the deploy lane | GitHub Environment `production` with required reviewers, then smoke | owner, outward gate |

Config names them once under `environments:` in `.codeloop/config.yaml` (url, deploy command, verify command). Evidence records which environment each verify ran in. A card's deployment state (`staged`, `live`) is derived from where its merge commit is reachable, and shown beside the stage, never as a stage of its own.

## Gates: rejected or returned

A gate is asked at one of two moments, and a rejection means a different thing at each:

| Gate | Asked | Reject sends the card | The next brief says |
|---|---|---|---|
| after the check (`gate:` on a stage) | once the stage's check passed | nowhere: it stays in the stage for a redo | `Latest rejection: <note>` |
| on entry (`gate: { outward: true }`) | before the stage runs | back to the stage before the gate, with the note | `Latest return from <stage>: <note>` |

An entry gate on the first stage of a lane has nothing before it, so the card stays. The card's event log holds the `reject` on the gated stage and, for a return, a `returned` event on the stage it went back to; `card show` and the brief's Feedback section print which happened.

## Tickets, splits and runs

| Term | Means |
|---|---|
| **ticket** | A tracker key on a card (`ticket: ACME-412`). `codeloop start "ACME-412: add CSV export"` splits it off: the key becomes the ticket, the rest the title, and the story check runs on the rest. `--ticket` sets it too. |
| **split_from** | The card a sibling was split from (`card split <id> <titles...>`, `POST /api/cards/:id/split`). Siblings share the parent's feature. |
| **run** | One card's stage run started from the board or the SDK (`cards.run`): the check, the configured agent when it fails, one advance. Its record and log are `.codeloop/state/agent-runs/<runId>.{json,log}`. |
| **auto_start** | `lanes: { auto_start: true }` in config.yaml lets a lane's `on_done: { start }` make the follow-on card. Off, a finished card only announces what it would start; a lane's own `trigger: { on: lane.done }` is not affected. |

## Status words

Two orthogonal things, kept apart as every tool does:

| Work status (the lane) | Deployment state (environments) |
|---|---|
| **backlog**: proposed, not promoted | — |
| **active**: in a stage, an agent may be on it | — |
| **waiting**: parked at a gate for a person | — |
| **stuck**: three failed checks | — |
| **done**: accepted at the last gate | **staged**: reachable from the staging ref |
| **dropped** | **live**: reachable from the prod ref |

"Done" means accepted, as in every tool. "Live" is only ever derived.

## What this changes on the board and roadmap

- Roadmap rows are initiative → epic → feature. Stories stay collapsed under their feature with a count and a status bar. Columns are releases (`next`, the tagged ones) rather than NOW / NEXT / LATER, with an unscheduled column for features without a release.
- The board filter gains **feature** and **release**; **epic** filters through the feature.
- The card drawer shows the chain: initiative › epic › feature › this story.
- `codeloop feature new`, `codeloop epic new` create the wiki pages; `codeloop initiative tree <slug>` prints the tree with score, band and status.

## Migration from today's fields

| Today | Becomes |
|---|---|
| `card.initiative` (title text) | `card.feature` → feature page → `initiative` slug |
| `card.epic` (parent card id from split) | `card.split_from`; `card.feature` carries the grouping |
| `card.feature` (free text) | slug of a `wiki/features/` page; `feature new` creates it |
| roadmap NOW / NEXT / LATER | releases, with unscheduled |
