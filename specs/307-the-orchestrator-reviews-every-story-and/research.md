# c-307 research: The orchestrator reviews every story and fixes what is wrong before it picks the next one

## What exists

exists: build. Parts exist; the review pass does not. `doctorTick` (src/lib/run.ts:445) already walks every card at night and acts: nudges a quiet builder, retries a waiting orch turn, starts a stage agent once on a never-written scaffold, tells an over-cap story to split (`split-nudge`), reruns a check after work landed, and asks to park a stale card as an inbox question with a recommended answer (`addQuestions`, src/lib/interview.ts:119). Every move verb it would need exists but is owner-only: `placeCard` (src/lib/engine.ts:520), `closeCard` (engine.ts:436), `parkCard` (engine.ts:461), `moveCard` (src/lib/story-control.ts:89). `stageApplies` (src/lib/lane.ts:100) reads only `size`. The orchestrator protocol is prose on the docs page (site/content/docs/concepts/orchestrator-and-workers.md, "Reference: the orchestrator protocol"); `templates/orch/` holds only the two brief footers, and `codeloop render` writes no `/orch` for any host.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | No board review: each feature's spec, plan and tasks are run in order by the person; nothing re-reads open features and fixes their state | https://github.com/github/spec-kit |

## The pain, grounded

pain: the founder opens the board and finds 25 of 43 build-lane cards stuck on checks that do not describe the work. 20 have merged code but sit at research with an empty research.md (c-149: promoted to research 10-14 18:07, hand-back merged 18 commits at 20:05, failed research for 0 sources at 23:06 and has not moved since); 5 were never started and need no research. Nobody re-reads the board between turns, so the owner clears it by hand. Source: `codeloop inbox` on this repo, 2026-10-16 ("10 waiting on you, 33 failing"), and `codeloop card show c-149`.

## Options

- **Plan, then apply, inside the orchestrator loop.** Each pass reads every open card into one summary, plans fixes from a fixed list of verbs, applies the safe ones with an event naming the reason, and turns the risky ones (a gate crossed, a split, a drop) into inbox questions with the recommended answer. Chosen: it is Terraform's plan-then-apply split and a Kubernetes controller's observe-diff-act loop, both of which keep a person on the destructive change and let the routine one run alone; it extends `src/lib/run.ts` (doctorTick) and the verbs in `src/lib/engine.ts` and `src/lib/story-control.ts`.
- **Separate rules per failure** (c-306 as first ruled: a drift event at the gate, a doctor list of drift cards, a research-skip flag and a research-check exception). Lost: each new failure shape needs a new rule in a new place, and the owner still runs the fix list by hand.
- **Owner clears the board by hand with `card place` and `card drop`.** Lost: it is the pain.

## Risks

- An orchestrator that can move cards can move them wrongly. Bounded by: verbs never cross a gate (c7e7add's rule), each writes an event with its evidence, and a headless pass stops at the run budget.
- Evidence can mislead: a Card-trailer commit can touch only docs, and the mock stage writes into the app's own mocks folder (`mock.target: app`, src/lib/mock.ts). Placement must count only changes outside .codeloop, docs and the resolved mock target.
- The orchestrator is an agent role; verbs that are owner-only today need a new role rule bounded by gates, not a bypass of the owner check.

## Open questions

- Should the edit guard from c-306 (no source edits before build) fold into this card or stay its own?
- Does the review pass run before every pick or once per pass, given 40+ open cards cost one summary read each?
- Which fix verbs may a headless `orch run --review` apply with no session present, and which only queue a question?

## Sources

- source: src/lib/run.ts:445 — doctorTick already walks every card and acts, and asks to park via an inbox question; the review pass extends it rather than adding a second walker
- source: src/lib/engine.ts:520 — placeCard is owner-only; the orchestrator's place verb needs its own role rule bounded by gates
- source: src/lib/lane.ts:100 — stageApplies reads only size, so skipping research for a research-none card needs a card field in the predicate
- source: site/content/docs/concepts/orchestrator-and-workers.md — the protocol text to render as /orch, and "What is not done" lists the missing rendered command
- source: https://developer.hashicorp.com/terraform/cli/commands/plan — plan shows proposed changes without applying; apply needs approval unless pre-approved, the model for safe fix versus ask
- source: https://kubernetes.io/docs/concepts/architecture/controller/ — a controller compares desired and actual state each loop and acts to close the gap, the shape of review before pick

## Rubric

- R2 pass: `grep -rn "templates/orch" src/lib src/commands` finds only the brief footers and no rendered orchestrator command; `grep -n "^export" src/lib/run.ts src/lib/engine.ts` lists doctorTick, placeCard, closeCard, parkCard and no review or summary function
- R5 pass: specs/307-the-orchestrator-reviews-every-story-and/research.md:17
- R7 pass: specs/307-the-orchestrator-reviews-every-story-and/research.md:29

verdict: build
