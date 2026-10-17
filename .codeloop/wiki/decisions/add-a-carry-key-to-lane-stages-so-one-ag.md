---
title: Add a carry key to lane stages so one agent turn runs consecutive
scope:
  - src/lib/lane.ts
  - src/lib/orch.ts
  - src/lib/run.ts
  - .codeloop/lanes/build.yaml
freq: 1
severity: warning
cards:
  - c-313
updated: 2026-10-17
---

## Options

- **Add a carry key to lane stages so one agent turn runs consecutive stages up to the next gate or open question.** Chosen: the brief lists every stage in the carry, the agent writes each stage's file and runs `codeloop next` after each, so the engine still runs every stage check, writes every event and keeps every rubric; the turn ends at a gate, at questions waiting on the owner, or at a failed check. Review gets `when: size >= M` and its triage runs inside verify for an S story. It touches `src/lib/lane.ts`, `src/lib/orch.ts`, `src/lib/run.ts` and `.codeloop/lanes/build.yaml`.
- **Merge the thin stages into one lane stage with one combined check.** Lost: one check loses the per-stage rubrics and events, and the interview's pause for answers has nowhere to sit.
- **Keep one stage per turn but resume the same agent session.** Lost: it still starts a process and writes a brief per stage, and session resume differs by host.

## Why

the founder pays for an agent start per thin stage. On this repo's board, 88 agent runs went to research, interview, mock, spec and data-model across 26 stories, with median runs of 1.9 to 3.3 minutes against 25 minutes for build, and an S story needs five agent turns (build, verify, review, staging, live). Source: agent-run events in .codeloop/cards.json counted on 2026-10-17, and the card note on c-313.

## Consequences

**Add a carry key to lane stages so one agent turn runs consecutive stages up to the next gate or open question.**: the brief lists every stage in the carry, the agent writes each stage's file and runs `codeloop next` after each, so the engine still runs every stage check, writes every event and keeps every rubric; the turn ends at a gate, at questions waiting on the owner, or at a failed check. Review gets `when: size >= M` and its triage runs inside verify for an S story. It touches `src/lib/lane.ts`, `src/lib/orch.ts`, `src/lib/run.ts` and `.codeloop/lanes/build.yaml`. The other options are not built; reopening one is a new decision.
