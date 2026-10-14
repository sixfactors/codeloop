---
title: Add trivial below S in the story standard
scope:
  - src/lib/cards.ts
  - src/lib/lane.ts
  - .codeloop/lanes/build.yaml
  - .codeloop/wiki/initiatives/founder-ships-without-ceremony.md
freq: 1
severity: warning
cards:
  - c-058
updated: 2026-10-14
---

## Options

- Add `trivial` below S in the story standard; put `when: size >= S` on research, interview, mock and spec in `build.yaml` so trivial cards enter at build; enforce a 3-file / 50-line cap at verify via `check diff`, and on breach re-size to S and park at the spec gate. Chosen — matches the answered interview (Q1–Q5) and the Q3 dogfood path `create → build → verify`.
- Keep S/M/L and let S skip ceremony (`when: size >= M`). Rejected — interview Q5; S still means "hours" of real work and would hide research/spec from cards that need them.
- Ship a separate hotfix/fast lane. Rejected — duplicates gates and WIP; the initiative wants one lane that sizes its own ceremony.

## Why

a one-line fix still burns a full research → interview → mock → spec-gate day of markdown, so the founder avoids the board for trivial work. Source: `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (spec-kit#75, martinelli.ch, BMAD#1188) and the card story ("pipeline matches the size of the work"). Confirmed by `build.yaml` having no size predicates today.

## Consequences

Add `trivial` below S in the story standard; put `when: size >= S` on research, interview, mock and spec in `build.yaml` so trivial cards enter at build; enforce a 3-file / 50-line cap at verify via `check diff`, and on breach re-size to S and park at the spec gate. — matches the answered interview (Q1–Q5) and the Q3 dogfood path `create → build → verify`. The other options are not built; reopening one is a new decision.
