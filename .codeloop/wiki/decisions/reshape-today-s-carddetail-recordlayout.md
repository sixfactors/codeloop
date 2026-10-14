---
title: Reshape today's CardDetail / RecordLayout / GateCard / CardDrawer
scope:
  - workspace/components/shared/card-detail.tsx
  - .codeloop/wiki/initiatives/people-and-agents-workplace.md
freq: 1
severity: warning
cards:
  - c-134
updated: 2026-10-14
---

## Options

- Reshape today's `CardDetail` / `RecordLayout` / `GateCard` / `CardDrawer` into the design's record: property panel on the right, Proof tab that absorbs Evidence (acceptance lines + runs + review + commits + mocks), gate banner with Approve / Send back on the same pane, and default tab = waiting reason (Proof at a gate, Questions when open, Tasks while an agent runs). Chosen — matches design §5 Story wireframe and §8 ("Card page, card drawer → Story record and peek"; "Evidence page → The story's Proof tab"), unlock-before-build, and build order ("Story record first").
- Delete the card page and rebuild from chanl-admin templates. Rejected — RecordLayout, GateCard, Questions, Spec/Tasks tabs and peek already fit; a rewrite burns the shared body for no product gain.
- Close the card as `have` because Approve and an Evidence tab ship. Rejected — a founder still opens a separate evidence folder and never sees each acceptance line next to the decision; the title names proof beside the decision.
- Wait for GET `/api/stories/:id` (c-121) before any UI change. Rejected — the screen can reshape with today's `useCard` / `useCardFull` / `useQuestions` joins; the one-call story view is a later swap, not a blocker for the layout.

## Why

a founder at a gate must leave the story to find evidence, never sees each acceptance line with its test beside Approve, and lands on Questions instead of Proof — so they cannot approve what they can see in under the initiative's two-minute target. Source: card story ("approve a gate with each acceptance line, its test, the review and commits in view"), `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof; "evidence on its own page"), `docs/artifacts/codeloop-ui-design.html:275` (Proof beside decision; opens on what it waits for), and today's `card-detail.tsx` (`defaultValue="questions"`, Evidence tab as file names, Evidence button to a separate route).

## Consequences

Reshape today's `CardDetail` / `RecordLayout` / `GateCard` / `CardDrawer` into the design's record: property panel on the right, Proof tab that absorbs Evidence (acceptance lines + runs + review + commits + mocks), gate banner with Approve / Send back on the same pane, and default tab = waiting reason (Proof at a gate, Questions when open, Tasks while an agent runs). — matches design §5 Story wireframe and §8 ("Card page, card drawer → Story record and peek"; "Evidence page → The story's Proof tab"), unlock-before-build, and build order ("Story record first"). The other options are not built; reopening one is a new decision.
