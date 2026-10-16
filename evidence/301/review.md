# Review c-301

verdict: approve
sha: ebc8c2f
reviewer: chanl-platform orchestrator session (Dean's request via codelooper, 2026-10-16)

## What was read

The six commits carrying `Card: c-301` (3fb30b1, 1c5ed24, bdbf4f5, 3af0459, 32eb520, c7e7add): the
prompt guard's nudge and block modes and `guard.prompt` (guard-hooks.ts), `start --activate` via a
shared `activateCard` (card.ts), the gate-crossing `card move` permission check (guard-hooks.ts), a
trivial story holding no wip slot (engine.ts, story-control.ts), and the test-env fix that stops a
lane check's suite writing fixture evidence into the real tree (vitest setup, project-root.ts).

## Findings

| Finding | Verdict | Evidence |
|---|---|---|
| `gateCrossingMove` returns undefined when the board cannot be read, so the move is not asked about | unnecessary | the same `card move` then reads the same board and fails, so nothing moves unasked |
| The live walk saw "looks outside the active card" fire on a follow-up prompt with no shared title words | defer | outside this story's diff; proposed as c-305 |
| Scope grew past the first spec (evidence leak, wip slot, gate move) | unnecessary | each was found while working this story, carries the trailer, and the diff stays inside the M budget: 16 files, 239 lines |

## Rubric
- W2 pass: repeated three walk steps in a fresh sandbox (/tmp/cl-review301.k5g6, codeloop at c7e7add dist): prompt with no active story exits 0 and prints the nudge naming c-001 and the `--size trivial --activate` line; `codeloop start "Draw the architecture page" --size trivial --activate` created c-002 at stage build and printed "active card: c-002 ... (this session only)"; with `guard.prompt: block` a new session exits 2 listing c-001 and c-002.
- W3 pass: three findings in the table above, each with a verdict; the evidence names src/commands/guard-hooks.ts `gateCrossingMove`, evidence/301/verify.md line "seen but not this story's", and `git diff 93791ac..ebc8c2f --stat`.
- W4 pass: no finding is fix-now, so nothing to re-verify; verify passed at ebc8c2f (evidence/301/verify.md).
- W5 pass: the one defer is proposed as c-305 (`codeloop card show c-305`).
- W6 pass: verdict approve, and W4 holds.
