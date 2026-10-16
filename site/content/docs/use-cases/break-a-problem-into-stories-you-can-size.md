---
title: Break a problem into stories you can size
description: Turn one sentence about a problem into a ranked list of small stories, after the agent has checked what already exists and asked you what it needs.
---

## The problem

You have a problem in one sentence, such as "let a workspace publish a skill pack from the web app". Before an agent can build it, someone has to find what already exists, decide what is in scope, and cut the work into slices small enough to ship one at a time.

## Without codeloop

You search the code yourself to see what is already built, write a list of tasks, and guess their sizes. Often the first task turns out to rebuild something that already ships, and one of the tasks is really three weeks of work. An agent given the same sentence starts building the whole thing in one pass. Nobody records why a story is in the list or which one should go first.

## With codeloop

`codeloop shape` runs the shape lane. A lane is a file that lists the stages a kind of work goes through, and a stage is done when its check passes. You type the problem once:

```sh
codeloop shape "Let a workspace publish a skill pack from the web app"
```

The lane has four stages, run in order:

| Stage | Who | Writes | Check |
|---|---|---|---|
| brief | agent | the problem, the users, what already exists and three sources | problem, users, at least one `exists:` line, three sources |
| interview | agent asks, you answer | three or more questions with recommended answers | at least three questions answered |
| breakdown | agent | an epic with up to seven stories, each sized | the rules below |
| rank | agent | a RICE score on every story | the rules below, plus `rice:` on every line |

Before any story is written, the brief stage searches the codebase and the wiki and records what it finds as `exists:` lines, each with a verdict: `have` (it ships), `unlock` (half built, so the story exposes it), `port` (it exists elsewhere) or `build`. A capability that already ships never gets a story. The breakdown that follows looks like this:

```text
# Epic: Publish a skill pack from the web app
hypothesis: letting a workspace turn its own skills into one installable pack gets its developers
using the hosted MCP endpoint instead of wiring up each skill by hand.
metric: packs published per workspace

## Stories
- S1 [S] See my skills listed in the web app · exists: unlock · done_when: open /skills, see the list · depends_on: none · rice: R=8 I=5 C=9 E=1
- S2 [M] Pick skills into a draft pack · exists: build · done_when: a draft pack with two skills saved and reopened · depends_on: S1 · rice: R=7 I=7 C=7 E=2
- S3 [S] Publish the pack to the workspace catalog · exists: unlock · done_when: the pack appears in the catalog with its skills · depends_on: S1, S2 · rice: R=7 I=8 C=8 E=1

## Later
- Versions and deprecation
```

The check refuses a breakdown that has a story with no size or an `[L]` size (split it first), a missing or placeholder `done_when`, a missing `exists:` verdict, a `depends_on` that names a later story, more than seven stories, or an epic without a `hypothesis:` and a `metric:`. The rank stage adds `rice: R=<n> I=<n> C=<n> E=<n>`: reach, impact and confidence on a scale of 1 to 10, and effort in weeks.

When you approve the ranked plan, codeloop writes the epic and a feature page to the wiki, and starts one build card per story, carrying its size, metric and `done_when` into the card. The first story goes active and the rest wait in order. When a story is done, the next one starts.

## What you still do

- Answer the interview questions.
- Approve the ranked plan at the plan gate. This approval covers the exact list of stories it queues.

## Not yet

- Pulling the problem from a tracker (Linear, Jira, GitHub) is not done. You type or paste it into `codeloop shape`.
- Re-planning an epic after a story has shipped is not done. The breakdown is written once, and later changes are made by hand.
- There are no cost or time estimates beyond size and the effort in the RICE score.

Next: [the story standard](/docs/reference/story-standard) for the size and RICE rules, and [how the shape lane works](/docs/concepts/shape-a-problem-into-stories).
