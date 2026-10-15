---
title: Extend the research stage that already runs, and expose it for
scope:
  - .codeloop/lanes/build.yaml
  - templates/skills/spec/SKILL.md
  - src/lib/artifact.ts
  - src/lib/run.ts
  - .codeloop/lanes/plan.yaml
  - templates/skills/research/SKILL.md
  - src/lib/research.ts
  - src/commands/card.ts
  - src/lib/engine.ts
  - src/lib/cards.ts
  - src/lib/interview.ts
  - src/lib/scan.ts
  - .codeloop/config.yaml
  - .codeloop/wiki/initiatives/founder-ships-without-ceremony.md
  - .codeloop/wiki/features/agent-thinks-first.md
  - .codeloop/state/agent-runs/c-067-research-1.log
freq: 1
severity: warning
cards:
  - c-067
updated: 2026-10-14
---

## Options

- Extend the research stage that already runs, and expose it for backlog cards. The research skill in `templates/skills/research/SKILL.md` gains a second output, a draft `specs/{id}/spec.md` with the Story line, US1 to US3 and `## Not building` written from the `exists:`, `pain:` and `## Options` it just settled; `checkResearch` in `src/lib/research.ts` gains `--draft-spec`, which fails unless spec.md has a filled `Story:` line, one acceptance line and a non-empty `## Not building`, and it reads a `screenshots:` line that is either paths under the spec folder or `none`; `codeloop research <card>` in `src/commands/card.ts` is `card run` that first places a proposed card in the research stage through `placeCard` in `src/lib/engine.ts` so `inLane` in `src/lib/cards.ts` lets `src/lib/run.ts` start the agent; when the verdict is `have` or `unlock` the run posts one question through `addQuestions` in `src/lib/interview.ts` ("close? recommended yes") and parks the card the way `card park` does. Chosen. Every piece it needs is already there and tested: the brief, the competitor inlining, the source counter, the decision landing, `card run`, `park` and `addQuestions`; the check can fail on a named line (no Story, no US line, empty `## Not building`, a screenshot path that does not exist); and the founder opens the same two files at the spec gate that exist today, now already filled.
- A standalone `codeloop research <card>` written in TypeScript that fetches the competitor pages with `pageText` from `src/lib/scan.ts`, searches the web and writes research.md deterministically with no agent. Rejected: the `exists:` verdict is a judgement over this codebase and its siblings, which a fetcher cannot make, and there is no web search without an API key in `.codeloop/config.yaml`. Failure mode: three URLs that answer `--online` and settle nothing, which is the filler Q4 names as the riskiest assumption.
- A separate `draft` stage between research and interview with its own output `{spec}/draft.md` and check. Rejected: one more agent run on every card (`src/lib/run.ts` starts one agent per stage), and the interview then reads a third file; c-116 is already trying to cut stages for shaped stories. Failure mode: the draft passes while spec.md is still the template, so the spec stage rewrites from scratch and the draft was waste.

## Why

the founder spends the first hour of every card gathering, not deciding: search the repo for what exists, find the competitor's docs, copy the story into a spec. Source: the card's own story ("so that my time goes to deciding, not gathering"), `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (metric human turns per shipped card, median under 4 by 2026-12-01; a card that arrives at the spec gate with an empty spec costs a turn to send it back), and `.codeloop/wiki/features/agent-thinks-first.md`, which names "research reads the competitor pages and the web and writes the first draft of the spec" as the third story of the feature. The dogfood number: this card's first research run (`.codeloop/state/agent-runs/c-067-research-1.log`, 2026-10-13) exited 1 in 693 ms with the template untouched, so the founder got nothing to decide on.

## Consequences

Extend the research stage that already runs, and expose it for backlog cards. The research skill in `templates/skills/research/SKILL.md` gains a second output, a draft `specs/{id}/spec.md` with the Story line, US1 to US3 and `## Not building` written from the `exists:`, `pain:` and `## Options` it just settled; `checkResearch` in `src/lib/research.ts` gains `--draft-spec`, which fails unless spec.md has a filled `Story:` line, one acceptance line and a non-empty `## Not building`, and it reads a `screenshots:` line that is either paths under the spec folder or `none`; `codeloop research <card>` in `src/commands/card.ts` is `card run` that first places a proposed card in the research stage through `placeCard` in `src/lib/engine.ts` so `inLane` in `src/lib/cards.ts` lets `src/lib/run.ts` start the agent; when the verdict is `have` or `unlock` the run posts one question through `addQuestions` in `src/lib/interview.ts` ("close? recommended yes") and parks the card the way `card park` does. Every piece it needs is already there and tested: the brief, the competitor inlining, the source counter, the decision landing, `card run`, `park` and `addQuestions`; the check can fail on a named line (no Story, no US line, empty `## Not building`, a screenshot path that does not exist); and the founder opens the same two files at the spec gate that exist today, now already filled. The other options are not built; reopening one is a new decision.
