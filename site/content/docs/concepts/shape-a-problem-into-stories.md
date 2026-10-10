---
title: Shape a problem into stories
description: A shape workflow turns a typed problem into a brief, an answered interview and an epic of sized, dependency-checked stories, ready to queue.
---

`codeloop start` wants one story already sized S, M or L. A person with a problem, "let a
workspace publish a skill pack from the web app", has to do that sizing by hand first. The shape
workflow does it instead:

```sh
codeloop shape "Let a workspace publish a skill pack from the web app"
```

## What it does

Shape is a lane with four stages, run in order:

| Stage | Who | Writes | Check |
|---|---|---|---|
| brief | agent | `shape/{id}/brief.md` | problem, users, at least one `exists:` line, three sources |
| interview | agent asks, owner answers | `shape/{id}/interview.md` | at least three questions answered |
| breakdown | agent | `shape/{id}/breakdown.md` | the rules below |
| rank | agent | `rice:` on every story in `breakdown.md` | the rules below, plus RICE on every line |

The owner approves the ranked plan at the last stage. Everything up to there runs unattended.

## The brief

Before any story gets written, the brief stage searches this codebase, the wiki and any sibling
repo the problem names, and writes what it finds:

```
# pack-publish brief: Let a workspace publish a skill pack from the web app

problem: A workspace that has installed or built several skills in Acme has no way to turn a
chosen set of them into one thing a developer installs elsewhere.
users: team

## What exists

exists: have, the workspace skill library and the one-server install page for a single skill
already ship (apps/web/app/skills/page.tsx, apps/web/app/install/[slug]/page.tsx)
exists: unlock, `pack build` on the CLI already assembles a skill pack and uploads it to the
catalog (packages/cli/src/commands/pack.ts); the web app has no UI for it
exists: build, there is no way in the web app to select skills into a draft pack, save it, or
reopen it

## Sources

- source: https://acme.example/docs/skills — the library page today, one card per skill
- source: packages/cli/src/commands/pack.ts — `pack build` already shipped on the CLI
- source: .codeloop/wiki/decisions/role-packs.md — packs are an explicit install, the web
app is the store
```

`exists:` is the same have/unlock/port/build verdict the [story standard](/docs/reference/story-standard)
uses everywhere else. A capability the brief finds already shipped never gets a story; one it finds
half-built gets a story to expose it, not rebuild it.

## The breakdown

Once the brief and the interview are in, the breakdown stage writes an epic:

```
# Epic: Publish a skill pack from the web app
hypothesis: letting a workspace turn its own skills into one installable pack gets its developers
using the hosted MCP endpoint instead of wiring up each skill by hand.
metric: packs published per workspace
feature: skill-pack-publishing

## Stories
- S1 [S] See my skills listed in the web app · exists: unlock apps/web/app/skills/page.tsx · done_when: open /skills, see the list · depends_on: none · rice: R=8 I=5 C=9 E=1
- S2 [M] Pick skills into a draft pack · exists: build · done_when: a draft pack with two skills saved and reopened · depends_on: S1 · rice: R=7 I=7 C=7 E=2
- S3 [S] Publish the pack to the workspace catalog · exists: unlock packages/cli/src/commands/pack.ts · done_when: the pack appears in the catalog with its skills · depends_on: S1, S2 · rice: R=7 I=8 C=8 E=1
- S4 [S] Install page for a published pack · exists: unlock apps/web/app/install/[slug]/page.tsx · done_when: open the install page, copy the MCP URL · depends_on: S3 · rice: R=6 I=6 C=9 E=1

## Later
- Versions and deprecation
```

Fields separate with ` · ` (space, middle dot, space). Size is `[S]` or `[M]` in brackets.
`depends_on` is `none` or an earlier story in the same file. The rank stage appends
`rice: R=<n> I=<n> C=<n> E=<n>` (reach, impact, confidence on 1–10, effort in weeks, the same scale
as a feature's RICE) to every line once the stories are settled.

## What the check refuses, and why

| Refused | Why |
|---|---|
| A story with no size, or `[L]` | A card that takes three days or more, or needs design, is a feature with several stories, not one. Split it with SPIDR (paths, interfaces, data, rules, spike) before it reaches this file. |
| A missing or placeholder `done_when` ("all tasks complete") | A story nobody can tell is finished isn't a story. |
| A missing `exists:` verdict | The whole point of shaping first is to not build what already exists; a story with no verdict skipped that question. |
| A `depends_on` naming a later or unknown story | Every story has to be shippable the moment its listed dependencies are done. A forward reference would let an unshippable story queue anyway. |
| More than seven stories in `## Stories` | Past seven, it's an epic that needs cutting, not a longer list. The rest goes under `## Later`, deferred, not queued. |
| No `hypothesis:` or `metric:` on the epic | An epic with no stated belief and no number it's meant to move can't be checked against reality later. |
| (with `--ranked`) a story with no `rice:` | Ranking has to cover every story once breakdown is done, not just the ones that got to it first. |

## What happens on approval

When the owner approves the ranked plan, the engine writes `wiki/epics/<slug>.md` with the stories
as a table, a `wiki/features/<slug>.md` page per feature named in the breakdown, and starts one
build story per line, carrying `split_from: <epic>`, its size, metric and `done_when` into the new
card. The first story goes active; the rest wait in the backlog in the order they were written.
When a story reaches done, the next one starts.

## Not yet

- Pulling a problem from a tracker (Linear, Jira, GitHub). The problem is typed or pasted into
  `codeloop shape`.
- Re-planning an epic after a story has already shipped. The breakdown is written once; changes
  after that are made by hand.
- Cost or time estimates beyond size and RICE's effort-in-weeks.

See [Cards and gates](/docs/concepts/cards-and-gates) for how an approval moves a card once it's
queued, and the [story standard](/docs/reference/story-standard) for the size, RICE and
unlock-before-build rules this workflow shares with the rest of the board.
