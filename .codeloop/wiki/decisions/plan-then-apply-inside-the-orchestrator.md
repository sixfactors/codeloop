---
title: Plan, then apply, inside the orchestrator loop
scope:
  - src/lib/run.ts
  - src/lib/engine.ts
  - src/lib/story-control.ts
freq: 1
severity: warning
cards:
  - c-307
updated: 2026-10-16
---

## Options

- **Plan, then apply, inside the orchestrator loop.** Each pass reads every open card into one summary, plans fixes from a fixed list of verbs, applies the safe ones with an event naming the reason, and turns the risky ones (a gate crossed, a split, a drop) into inbox questions with the recommended answer. Chosen: it is Terraform's plan-then-apply split and a Kubernetes controller's observe-diff-act loop, both of which keep a person on the destructive change and let the routine one run alone; it extends `src/lib/run.ts` (doctorTick) and the verbs in `src/lib/engine.ts` and `src/lib/story-control.ts`.
- **Separate rules per failure** (c-306 as first ruled: a drift event at the gate, a doctor list of drift cards, a research-skip flag and a research-check exception). Lost: each new failure shape needs a new rule in a new place, and the owner still runs the fix list by hand.
- **Owner clears the board by hand with `card place` and `card drop`.** Lost: it is the pain.

## Why

the founder opens the board and finds 25 of 43 build-lane cards stuck on checks that do not describe the work. 20 have merged code but sit at research with an empty research.md (c-149: promoted to research 10-14 18:07, hand-back merged 18 commits at 20:05, failed research for 0 sources at 23:06 and has not moved since); 5 were never started and need no research. Nobody re-reads the board between turns, so the owner clears it by hand. Source: `codeloop inbox` on this repo, 2026-10-16 ("10 waiting on you, 33 failing"), and `codeloop card show c-149`.

## Consequences

**Plan, then apply, inside the orchestrator loop.** Each pass reads every open card into one summary, plans fixes from a fixed list of verbs, applies the safe ones with an event naming the reason, and turns the risky ones (a gate crossed, a split, a drop) into inbox questions with the recommended answer.: it is Terraform's plan-then-apply split and a Kubernetes controller's observe-diff-act loop, both of which keep a person on the destructive change and let the routine one run alone; it extends `src/lib/run.ts` (doctorTick) and the verbs in `src/lib/engine.ts` and `src/lib/story-control.ts`. The other options are not built; reopening one is a new decision.
