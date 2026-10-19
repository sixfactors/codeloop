# c-365 spec: The lane limit, small-story carry and batches behave the same on every path

Story: As a founder, I can set one project time limit for every command codeloop runs against my project, and split a story without idle stories blocking its first child, so that a 25 minute build check no longer stalls cards and the lane limit means the same thing on every path.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npx vitest run src/lib/__tests__/check-timeout.test.ts` exits 0

acceptance:
- US1 Given `checks.timeout_minutes` in `.codeloop/config.yaml` (default 10), when a stage check, the doctor's rerun, a hand-back proof, a gate rerun, a `verify` use case, a health lint or type command or a lane-proposal eval runs, then it is killed at that many minutes, and a value that is not a positive number means 10; setup and `orch.after_merge` steps keep at least 15.
- US2 Given a check, proof or use case killed at the limit, when its result is read, then it says "timed out after N min" and names `checks.timeout_minutes`; a stage check is a crash, a proof is recorded as timed out rather than exit 1, and a lint killed at the limit reads as unmeasured, not zero errors.
- US3 Given a lane with idle stories, when I run `card split`, then only stories an agent is working on count against the lane limit, so the first child takes the parent's slot.

screens: none
mock: drop

## Decisions

- scope: every command that runs a project's own check, proof, use case, lint or post-merge step reads the setting; setup and post-merge steps keep their 15 minute floor (interview Q1).
- unit and default: minutes, default 10, any value that is not a positive number falls back to 10, never to no limit; a killed check says "timed out after N min (checks.timeout_minutes)" and is a crash, not a failed verdict (interview Q2).
- split count: idle stories do not count against the lane limit; `splitCard` passes the project directory as the other paths do (interview Q3).

## Not building

- A per-stage `timeout` in the lane file; the lane file is a shipped template that `lane refresh` replaces.
- A larger fixed constant for everyone; a hung check on a small project would hold a slot longer.
- A time limit on `memory.ts` waiting, which runs no project command.
- Carry through the scheduler and doctor, batch through the scheduler, same-second commit counting, `promoteQueued` page reads and priority aging from the card description: this slice covers the lane limit on split and the time limit only.

## Failure modes

- The setting is ignored by one path, so a 25 minute check is still killed at 10 there (check-timeout.test.ts: stage check, doctor rerun, proof, gate, lint).
- A bad value (zero, negative, text) disables the limit instead of using 10 (check-timeout.test.ts: defaults to 10).
- A killed proof or gate rerun reads as a plain exit 1, so the cause is hidden (check-timeout.test.ts: proof and gate).
- A lint killed at the limit counts as zero errors and health looks clean (check-timeout.test.ts: lint).
- Split counts idle stories, so the first child is refused a slot it should get (check-timeout.test.ts: split).
