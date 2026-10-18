# c-368 tasks: I start, file, read and annotate a story in one command each

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [US1] [api] `start <id>` starts a queued or proposed story at its start stage and sets it active, refusing a proposed story in an agent run, in src/commands/card.ts, src/lib/flow.ts and src/lib/engine.ts
- [ ] T002 [US2] [api] `codeloop bug "<title>"` files a trivial build story flagged as a bug, sets it active and prints the id and `Card: c-NNN` line, in src/commands/card.ts
- [ ] T003 [US3] [api] `card show` prints "story: not written" and "description: none" with the fixing command; `card edit --description` appends "<date> owner: <text>", in src/commands/card.ts and src/lib/services.ts
- [ ] T004 [US4] [api] `card release <id>` frees a hold, owner and orchestrator for any hold and an agent run for its own, with an event naming who released whose hold, in src/commands/card.ts, src/lib/active-card.ts and src/sdk/client.ts
- [ ] T005 [US4] [api] A hold with no prompt, tool call or file write for `monitor.stall_minutes` is ignored by the board holder and the lease check, records "hold expired", and is retaken on the session's next prompt, in src/lib/active-card.ts, src/lib/services.ts, src/lib/orch-isolation.ts and src/commands/guard-hooks.ts
- [ ] T006 [US5] [api] `park` clears the "waiting for you: proposal" flag, and `card move` passes a gate the card is stuck at when its code has landed, recording who and why, in src/lib/engine.ts and src/lib/services.ts
- [ ] T007 [US1] [test] One test per failure mode in src/commands/__tests__/card-one-command.test.ts: start leaves the story active, agent run refused on a proposed story, bug binds the session, description append keeps earlier lines, blank fields name their command, expiry and release, park flag, move past a gate; each seen red before the fix
- [ ] T008 [US2] [docs] CHANGELOG.md line under 0.5.0 (unreleased) and `codeloop start`, `bug`, `card release` in the command reference

## Rubric

- S3 pass: Q1 in `start scope:`, Q2 in `release boundary:`, Q3 in `hold expiry:`, Q4 in `bug shape:`, Q5 in `annotate and read:`, all under `## Decisions` in specs/368-i-start-file-read-and-annotate-a-story-i/spec.md
- S6 pass: the `## Not building` list in specs/368-i-start-file-read-and-annotate-a-story-i/spec.md excludes a heartbeat lease, replacing descriptions, backfilling and agent-run releases
