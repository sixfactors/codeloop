---
title: Publish launch copy nobody ships by accident
description: Have an agent draft the launch post for every shipped feature, with you approving the claim and then the publish.
---

## The problem

You ship a feature and the launch post never gets written, or an agent writes it and it goes out with a claim nobody checked.

## Without codeloop

Launch copy is the task after the task. You finish the feature, plan to write the post later and do not. When an agent drafts it, the draft arrives as a chat message with no number behind the claim, and posting it is one more command. Nobody records which claim a post made or whether it moved the signup number.

## With codeloop

A feature finishing in the build lane starts a card in the market lane by itself, because the market lane's trigger is `on: lane.done` for build. A lane is a file that lists the stages a kind of work goes through. Market has four stages, brief, draft, publish and measure, and each is done when its check passes: the brief must name an `audience:`, a `claim:` and a `metric:`, the draft must carry a `claim:`, the publish record must carry a `url:` and the measure record a `verdict:`.

Two gates sit in the lane. The copy gate stops the card after the draft, and the publish gate is an outward gate: it parks the card before the publish stage runs, so nothing is posted until you approve a second time. The transcript of one run, with a stand-in agent:

```text
      19:05  c-009: agent fake ran brief
      19:35  c-009: agent fake ran draft
      19:35  c-009: waiting for you
  ok   the agent wrote the brief and the launch post; the post waits at the copy gate
```

You reject a post whose claim has no proof, and the note goes into the next brief:

```text
  $ cat marketing/c-009/blog.md
      Export is here.
      claim: any list, exported in one click
  $ codeloop reject c-009 "No number behind the claim: cite the measured export time."
      c-009 rejected at draft; note recorded
  $ cat marketing/c-009/blog.md
      Export is here.
      claim: any list, exported in one click
      proof: 214 rows exported in 0.4 seconds in our test run
```

After you approve the copy gate the card enters publish and stops again:

```text
  ok   publishing is a public step: the card entered it and waits before anything is posted
  ok   nothing is published yet
  ok   published, measured, done
  ok   the published URL is recorded
```

When three rejections land on the same stage, codeloop proposes a tighter check for the lane, so the same fault stops being rejected by hand. [Stop the agent repeating the same mistake](/docs/use-cases/stop-the-agent-repeating-the-same-mistake) shows how.

## What you still do

- Approve the copy gate, or reject with a note.
- Approve the publish gate. This is the step that makes the post public.
- Read the measure result: the lane's metric is `signups_from_launch`, with a target of +10%, and the number comes from your analytics.

## Not yet

`codeloop stats` does not compute the lane's metric itself in this version. The measure stage records a verdict you or the agent write.

Next: the [market lane, stage by stage](/docs/reference/lanes).
