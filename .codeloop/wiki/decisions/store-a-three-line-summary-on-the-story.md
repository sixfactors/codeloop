---
title: Store a three-line summary on the story, written by the agent at the
scope:
  - src/lib/cards.ts
  - src/lib/handback.ts
  - src/lib/services.ts
  - workspace/components/shared/card-detail.tsx
freq: 1
severity: warning
cards:
  - c-311
updated: 2026-10-17
---

## Options

- **Store a three-line summary on the story, written by the agent at the end of its turn.** Chosen: the agent that last worked the story writes or improves what the story needs, what is done and the one thing waiting on the founder, through the hand-back or a story command; the page shows it in one card above everything, and the step bar, rubric, events and raw check output fold under it. The "waiting on you" line is checked against the board's own facts, so a stale summary cannot hide a gate. It touches `src/lib/cards.ts`, `src/lib/handback.ts`, `src/lib/services.ts` and `workspace/components/shared/card-detail.tsx`.
- **Work the summary out from the board's facts, with no agent writing.** Lost: the facts say which step the story is on and whether a gate waits, but not what the story needs in plain words, and the owner asked for the agent that worked the story to write it. It survives as the fallback for a story no agent has summarised yet.
- **Fold the existing panels away and add nothing.** Lost: the page gets quieter, but there is still no sentence that says what to do.

## Why

the founder opens a story to find the one thing waiting on them and has to read past checks, rubric rows and logs to find it. The owner wrote on 2026-10-17 that the story page is overwhelming and that finding what to do in the noise is hard. Source: the card note on c-311 (`codeloop card show c-311`) and the page order in workspace/components/shared/card-detail.tsx:163.

## Consequences

**Store a three-line summary on the story, written by the agent at the end of its turn.**: the agent that last worked the story writes or improves what the story needs, what is done and the one thing waiting on the founder, through the hand-back or a story command; the page shows it in one card above everything, and the step bar, rubric, events and raw check output fold under it. The "waiting on you" line is checked against the board's own facts, so a stale summary cannot hide a gate. It touches `src/lib/cards.ts`, `src/lib/handback.ts`, `src/lib/services.ts` and `workspace/components/shared/card-detail.tsx`. The other options are not built; reopening one is a new decision.
