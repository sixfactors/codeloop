# c-365 research: The lane limit, small-story carry and batches behave the same on every path

## What exists

exists: build. The lane-limit count is shared, but one call still skips it, and every project command has a 10 or 15 minute limit written into the code.

- `assertRoomInLane` counts only stories an agent is working on when it is given `projectDir`, and counts every eligible story when it is not (src/lib/engine.ts:570). `splitCard` calls it without `projectDir` (src/lib/services.ts:419), so a split on a lane with idle stories decides the first child cannot start when it can.
- A project's stage check is killed at `CHECK_TIMEOUT_MS`, 600000 ms (src/lib/engine.ts:212). No setting changes it. The doctor's inline check (src/lib/run.ts:193) and the doctor tick (src/lib/run.ts:519) use the same constant.
- Other project commands carry their own copies: the hand-back proof (src/lib/handback.ts:17) and the gate rerun (src/lib/gate.ts:19), `codeloop verify` use cases (src/lib/verify.ts:74) and setup (src/lib/verify.ts:130, 183), health lint and type commands (src/lib/health.ts:112), lane proposal evals (src/lib/proposals.ts:126) and `orch.after_merge` (src/lib/orch.ts:435).
- A timed-out check already returns `crashed: "timed out after N min"` (src/lib/engine.ts:227). The proof and gate paths record only exit 1, so a killed proof reads as a plain failure.
- `memory.ts:75` waits for memory to drop under a ceiling and runs no project command; it is out of scope.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| GitHub Actions | `timeout-minutes` per job, default 360, set in the workflow file; a cancelled job says it exceeded the maximum execution time | https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes |
| GitLab CI | `timeout` per job, default one hour, set in the project; a killed job reports "execution took longer than 1h0m0s seconds" | https://docs.gitlab.com/ci/yaml/#timeout |

## The pain, grounded

pain: the founder's production orchestrator (brief of 19 October) runs a build check of about 25 minutes that is killed at 10, which stalls many cards; it will set 40. Source: that brief and src/lib/engine.ts:212.

## Options

- **One project setting, `checks.timeout_minutes`, default 10, read by every path that runs a project command.** Chosen. It matches how GitHub and GitLab set a job limit in the project's own file, and the default keeps every existing project's behaviour. It touches `src/lib/engine.ts`, `src/lib/run.ts`, `src/lib/gate.ts`, `src/lib/handback.ts`, `src/lib/verify.ts`, `src/lib/health.ts`, `src/lib/proposals.ts`, `src/lib/orch.ts` and `src/lib/services.ts` (the split call).
- **A per-stage `timeout` in the lane file.** Lost: the production project has one slow check, but the owner asked for one project setting, and the lane file is a shipped template that `lane refresh` replaces.
- **Raise the constant to 40 minutes for everyone.** Lost: a hung check on a small project would then hold a slot for 40 minutes.

## Risks

- A killed proof or gate rerun reads as a plain failure. Bounded by: the finding says "timed out after N min" and names `checks.timeout_minutes`.
- A bad value (zero, negative, text) must fall back to 10, not disable the limit.

## Open questions

- Which commands read the setting: only stage checks, or every project command?
- Is the setting in minutes and is 10 the default?
- Does a split count idle stories against the lane limit?

## Sources

- source: src/lib/engine.ts:212 - the 10 minute constant every stage check shares
- source: src/lib/services.ts:419 - splitCard asks about room without projectDir
- source: src/lib/engine.ts:570 - assertRoomInLane counts differently with and without projectDir
- source: https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions#jobsjob_idtimeout-minutes - a job timeout in minutes, set per project
- source: https://docs.gitlab.com/ci/yaml/#timeout - a job timeout set per project, with a message when it is hit

## Rubric

- R2 pass: `grep -rn "timeout: 600_000\|PROOF_TIMEOUT_MS\|CHECK_TIMEOUT_MS" src` lists engine.ts:212, gate.ts:19, handback.ts:17, health.ts:112, proposals.ts:126 and verify.ts:74; `grep -rn "checks" src/lib/engine.ts` finds no `checks.timeout_minutes`
- R5 pass: specs/365-the-lane-limit-small-story-carry-and-bat/research.md:Options
- R7 pass: specs/365-the-lane-limit-small-story-carry-and-bat/research.md:Open questions

verdict: build
