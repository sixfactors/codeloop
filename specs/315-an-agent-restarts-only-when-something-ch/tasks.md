# c-315 tasks: An agent restarts only when something changed, and tool faults are not blamed on the story

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

## Failure modes

1. The doctor or a run restarts an agent on the same head commit and the same stage work as its last start, so the run repeats (c-143: 13 hand-backs at one commit).
2. Over-correction: an agent is not restarted after the head commit or the work changed.
3. A check that fails only with the legacy-layout notice is counted against the story.
4. A check that fails because the card is not on the board where the check ran (a worktree) is counted against the story.
5. Over-correction: a real failure that also prints the notice is reported as a check-error, or keeps the notice in its output.
6. An agent past its timeout keeps running while this process is busy in a synchronous check, so a run labelled 10 minutes lasts 16 to 103.

## Tasks

- [x] T001 [US1] [api] agentStep records the head commit and stage work on agent-start and refuses a restart when both are unchanged since then, in src/lib/run.ts (the rule orch.ts breaker() applies to orch runs)
- [x] T002 [US1] [api] runCheck strips the legacy-layout notice from check output and reports a failure that is only the notice, or `card "<id>" not found` for its own card, as check-error, in src/lib/engine.ts
- [x] T003 [US1] [api] runAgent kills the agent's process group from a watchdog process at the timeout, so a blocked event loop cannot delay the kill, in src/lib/agent.ts
- [x] T004 [US1] [test] One test per failure mode above through doctorTick, runDueWithAgent, advanceCard and runAgent in src/lib/__tests__/agent-restart.test.ts, each seen red on the old code

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: <each interview answer and the spec.md field that holds it, path:line>
- S6 pass: <the not_building: line in spec.md, path:line>
