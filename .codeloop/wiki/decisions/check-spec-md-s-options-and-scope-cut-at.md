---
title: Check spec.md's options and scope-cut at the spec stage
scope:
  - src/lib/wiki-rules.ts
  - templates/spec/spec.md
  - specs/058-small-fixes-skip-the-ceremony/tasks.md
  - templates/lanes/build.yaml
  - src/lib/interview.ts
  - src/lib/run.ts
  - src/lib/research.ts
  - .codeloop/wiki/initiatives/founder-ships-without-ceremony.md
freq: 1
severity: warning
cards:
  - c-066
updated: 2026-10-14
---

## Options

- Check spec.md's options and scope-cut at the spec stage. `codeloop check thinking <card>` reads spec.md and fails unless `## Options` has three list items, each naming in backticks a file under `src/`, `templates/` or a wiki page that exists, exactly one marked Rejected with a failure mode after it, and `## Not building` has at least two non-empty lines; the spec stage's done cmd in `templates/lanes/build.yaml` gains `&& codeloop check thinking {id}`; the spec skill posts one inbox question through `addQuestions` in `src/lib/interview.ts` ("A, B or C? recommended B") whose accepted answer marks the chosen option. Size gating uses `when: size >= M` on the stage once c-058 T002 lands; until then the check passes with a note for S and trivial cards by reading `card.size`. Chosen. It puts the four things the founder reads in the one file already open at the spec gate, reuses the inbox question mechanism and the option parser instead of adding a second one, and the check can fail: an option with no file path, a rejected option with no failure mode, or a one-line `## Not building` each produce a named error.
- Separate lane stages `options` and `scope-cut` between interview and spec, each with its own output file `{spec}/options.md` and `{spec}/scope-cut.md` and its own done check. Rejected — it doubles the agent runs on every M card (`src/lib/run.ts` starts one agent per stage), and the founder would open three files at the spec gate instead of one; the epic page says the answer is written "back into the spec section it affects". Failure mode: a stage passes with its file written while spec.md still says nothing, so the gate approves a spec that never mentions the rejected option.
- Extend the research stage instead: `checkResearch` in `src/lib/research.ts` already finds `## Options`, so raise it to three options and add `## Not building` to research.md. Rejected — research runs before the interview, so the options would predate the founder's answers and the scope-cut would be written by an agent that has not yet heard what is out of scope; and research runs on S cards too, so Q2's size table (S gets scope-cut only) cannot be met there. Failure mode: the founder answers Q3 "none of these" at the interview and the three options stay on the page, so the decision page carries a choice nobody made.

## Why

the founder approves a spec that shows one approach and no reasoning, so the approval is a guess and the mistake surfaces at verify. Source: the c-066 story ("so that I approve a decision and not a guess"), `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (metric: human turns per shipped card, goal median under 4; a spec reopened after build costs two more turns), and the interview's Q4 on this card, which names the riskiest assumption as "the agent writes plausible but hollow options". The card's own metric is first-pass verify, and today's spec gate gives the founder nothing to catch a wrong approach before build.

## Consequences

Check spec.md's options and scope-cut at the spec stage. `codeloop check thinking <card>` reads spec.md and fails unless `## Options` has three list items, each naming in backticks a file under `src/`, `templates/` or a wiki page that exists, exactly one marked Rejected with a failure mode after it, and `## Not building` has at least two non-empty lines; the spec stage's done cmd in `templates/lanes/build.yaml` gains `&& codeloop check thinking {id}`; the spec skill posts one inbox question through `addQuestions` in `src/lib/interview.ts` ("A, B or C? recommended B") whose accepted answer marks the option. Size gating uses `when: size >= M` on the stage once c-058 T002 lands; until then the check passes with a note for S and trivial cards by reading `card.size`. Chosen. It puts the four things the founder reads in the one file already open at the spec gate, reuses the inbox question mechanism and the option parser instead of adding a second one, and the check can fail: an option with no file path, a rejected option with no failure mode, or a one-line `## Not building` each produce a named error. The other options are not built; reopening one is a new decision.
