# c-374 tasks: Orchestrator, workers and server as three parts, with templates and workflows set in the UI

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

Implementation step 1 (no product code): T001 and T002. The phase tasks follow the owner's review of the artifacts; one story per phase goes to his inbox.

- [ ] T001 [US4] [docs] This plan as Codeloop artifacts: docs/artifacts/codeloop/v2/c-374-system-design.html and docs/artifacts/codeloop/v2/c-374-workflow.html, passing `codeloop check artifact c-374` for both kinds
- [ ] T002 [US4] [docs] This spec folder from the plan: research.md, spec.md, plan.md, tasks.md, passing `codeloop spec check 374`
- [ ] T003 [US2] [api] Phase 0: release-pack and moved-board guard so our production project stays on the frozen current version while v2 runs separately
- [ ] T004 [US1] [api] Phase 1: `codeloop init` writes five configuration files and reports the detected stack, with detection for Java, .NET, Go, TypeScript and Python, in src/commands/init.ts and src/lib/scaffold.ts
- [ ] T005 [US1] [api] Phase 1: split templates/protocol.md into lead-agent and task-agent versions so the AI tool opens as the lead agent without being told
- [ ] T006 [US2] [api] Phase 1: new `map` skill in templates/skills/map/ that learns the system from `wiki init`, `wiki build` and repo facts, runs each build and test command under a time limit, records result and time, and writes the ten-line summary
- [ ] T007 [US3] [api] Phase 1: new `setup` skill in templates/skills/setup/ with six questions and recommended answers whose answers write the work process, the rules and one decision each, in src/lib/interview.ts and src/lib/lane.ts
- [ ] T008 [US4] [api] Phase 2: requests sorted into feature, task and bug with the steps each size needs, via lane `when:` in src/commands/card.ts and src/lib/lane.ts
- [ ] T009 [US5] [api] Phase 2: the bug short route, reproduce, fix, a test that fails without the fix, one approval, in src/commands/card.ts
- [ ] T010 [US4] [api] Phase 3: lead agent and task agents as roles, briefs from the plan, decisions in scope, rules and matching pages, hand-backs with commit range, proof exit code and cost, and a separate reviewer, in src/lib/orch.ts, src/lib/agent.ts and src/lib/engine.ts
- [ ] T011 [US4] [api] Phase 3: approve refuses an agent and records the refusal; an approval records the person's name, role and time, in src/lib/gate.ts
- [ ] T012 [US3] [api] Phase 4: knowledge base that stays current, corrections kept as decisions, pages flagged when their code changes, lessons dated and linked to the item, in src/lib/wiki.ts
- [ ] T013 [US5] [api] Phase 5: Home data, what waits, worked versus waiting, cost per item, and the warnings for code without an item, work ahead of the board, a quiet agent and a stopped scheduler
- [ ] T014 [US4] [api] Phase 6: MCP tools for other AI apps in src/lib/mcp.ts
- [ ] T015 [US1] [ui] Phase 6: Getting started screen in workspace/app from the approved three-parts frames, checked at 1280 px and 400 px
- [ ] T016 [US3] [ui] Phase 6: Setup questions, Knowledge and Work process screens in workspace/app, extending the existing Wiki, Settings and Setup pages
- [ ] T017 [US4] [ui] Phase 6: Work item and Agents screens in workspace/app
- [ ] T018 [US5] [ui] Phase 6: Home screen in workspace/app, extending the existing Home and Inbox pages
- [ ] T019 [US1] [test] Install on Netflix Dispatch (Python) and a Spring Boot service (Java) writes exactly five files and changes no code (uc-374-01)
- [ ] T020 [US2] [test] Learning completes on both trial services with every command under its time limit and the skipped ones named (uc-374-02)
- [ ] T021 [US4] [test] First-day run on both trial services recording setup time, questions accepted, time to first approval, time to done, interventions and AI cost under the evidence folder (uc-374-03, uc-374-04, uc-374-06, uc-374-07)
- [ ] T022 [US5] [test] After every v2 install, our production project is untouched (uc-374-08); a stale knowledge page is flagged after its code changes (uc-374-05)
- [ ] T023 [US1] [docs] Phase 7: publish the package so npm matches the trunk, fix the trial guide pinned to 0.3.0, one `init` command, and the public guide pages generated from the knowledge base

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: no interview stage ran for this card; the owner's answers are the approved plan's defaults, folded into `## Decisions` in specs/374-orchestrator-workers-and-server-as-three/spec.md:26
- S6 pass: `## Not building` in specs/374-orchestrator-workers-and-server-as-three/spec.md:39 names the team version, Protobox packs, the old tracker, extra monitor rules, the public guide and any product code in step 1
