---
title: A story goes stuck without anyone working on it
scope:
  - src/lib/engine.ts
  - src/lib/run.ts
  - workspace/components/story
freq: 1
severity: warning
cards:
  - c-136
  - c-307
updated: 2026-10-16
---

On 2026-10-16, 25 of the 57 open build stories were stuck, and the story page told the owner only that "research.md cites 0 sources, needs 3". c-136 shows the pattern:

| When (UTC) | What happened | Counted as a failure |
|---|---|---|
| 10-12 21:47 | owner promotes to research | |
| 10-13 03:46 | the whole board is built and merged in 9ade47c, straight from the design artifact | |
| 10-13 03:49 | check runs before any spec folder exists | yes |
| 10-14 16:54 | check runs on the empty template | yes |
| 10-14 23:06 | a lane-upgrade sweep reruns every check | yes, and the story goes stuck |

There were three causes:

- **Failures are counted when nobody worked.** The no-change guard in `engine.ts` (`opts.unattended` and the fingerprint) skips only unattended reruns. A check on a folder the owner has just created, or a sweep after a lane upgrade, spends a retry. The story reached the retry cap with zero agent turns.
- **Merged work never moves the story.** Commits carrying the story's id landed while it sat at research. Nothing compares the merged code with the stage, which is c-307's review pass.
- **The page explains the check, not the story.** It prints the raw check output and offers "Approve: unstick", which reruns the same check on the same empty file, so the story fails again. It never says that no agent has run, or that the code shipped in 9ade47c.

A stuck explanation should answer three things: whether any work was tried, what already shipped under this id, and which action will change the outcome (place it, skip the stage, or let it run).

A related trap: the verify health score counts every critical gotcha page in the repo (`health.ts:133`). It is not limited to the story being verified. Writing this page as critical dropped c-302's score from 88 to 75 and failed its verify, although c-302 never touched the page.
