# c-374 plan: Orchestrator, workers and server as three parts, with templates and workflows set in the UI

Implementation step 1 runs first, with no product code: this plan published inside Codeloop as the system design and the first-day workflow (`docs/artifacts/codeloop/v2/c-374-system-design.html`, `docs/artifacts/codeloop/v2/c-374-workflow.html`), and this spec folder. The owner reviews it on the hub's Artifacts page. The rest of the build follows his review. The existing open fixes finish first, in about a week. The current version is then frozen for our own production project, and v2 is built beside it with at most two AI builders at a time.

## Layers touched

api (commands, scaffold, skills, lane, orchestration, wiki), ui (the seven screens in `workspace/app/`), test (the first-day run on two services, the production-project check), docs (the artifacts, the package and the public guide).

## Phases

| Phase | What it delivers | Days | Needed for the first trial | Builds on | Related stories |
|---|---|---|---|---|---|
| 0 | Our production project stays on the frozen current version; v2 runs separately | 4 | yes | 10-18 plan, epic E0 | c-330 to c-333 |
| 1 | Install, learn the system (any language), setup questions | 6 | yes | `wiki init`, `wiki build`, `architecture` skill, repo facts, starters, `render.ts` | new |
| 2 | Requests sorted into features, tasks and bugs, each with the right amount of process | 4 | yes | `start`, `bug`, lane `when:` | c-372, c-375 |
| 3 | Lead agent and task agents, roles, cost per item, reviewer | 5 | yes | `orch run`, briefs, hand-backs | c-378 |
| 4 | Knowledge base that stays current | 4 | partly | wiki capture and inject | new |
| 5 | Honest home page and warnings | 3 | partly | Home, inbox | c-376, c-377, c-379, c-380 |
| 6 | The seven screens as working pages, plus tools for other AI apps. Getting started, Setup questions, Work item and Home are built inside phases 1 to 3, so the first trial has them | 6 | yes, the four first-day screens | approved three-parts screens, `src/lib/mcp.ts` | c-374 |
| 7 | Publish the package and the public guide | 3 | yes | site | fix npm 0.4.3 vs 0.5.0; fix the trial guide pinned to 0.3.0; one `init` command |

Milestones: first trial on a real service about three weeks after approval; full v2 about two weeks after that; the team version with a shared board follows on the existing storage plan.

## Files

- Phase 0: release-pack, moved-board guard.
- Phase 1: `src/commands/init.ts`, `src/lib/scaffold.ts`; new `setup` and `map` skills under `templates/skills/`; `templates/protocol.md` split into lead-agent and task-agent versions; detection for Java, .NET, Go, TypeScript and Python.
- Phase 2: `src/commands/card.ts`, `src/lib/lane.ts`.
- Phase 3: `src/lib/orch.ts`, `src/lib/agent.ts`, `src/lib/engine.ts`.
- Phase 4: `src/lib/wiki.ts`, `src/lib/interview.ts`.
- Phase 5: workspace Home.
- Phase 6: workspace pages built in `workspace/app/` from `components/` and the shared blocks, reusing the approved three-parts screens (`workspace/app/mocks/374-…`); the existing Home, Inbox, Wiki, Settings and Setup pages are extended rather than replaced; each screen checked at 1280 px and 400 px beside its approved frame; MCP tools in `src/lib/mcp.ts`.
- Phase 7: `site/`.

## How it is proved

- First-day test on two real services in different languages, for example Netflix Dispatch (Python) and a large open-source Spring Boot service (Java): run the eight steps on each and record setup time, questions accepted as recommended, time to first approval, time to done, how often a person stepped in, and AI cost. Then the owner runs it himself.
- Head-to-head: the same feature on three copies of one service with Spec Kit, BMAD and Codeloop, comparing cost, human effort, documents produced, tests passing and time. Needs more AI calls than the usual limit of ten, so the owner approves the budget first.
- No harm to production use: after every v2 install, check that our production project is untouched.

## Risks

- "Nothing is sent to a vendor's cloud" is true of Codeloop and not of the AI tool's model calls; the public page says so, and it is confirmed before the page ships.
- Learning a very large repository takes longer than ten minutes, or a command hangs: each command runs with a time limit and the summary names what was skipped.
- The recommended answers are wrong for a team: every answer is editable on the Setup questions and Work process screens, and each change is a recorded decision.
- AI cost is high or unpredictable: a cap on running agents, a budget per item, cost on every item and on Home.
- Building v2 disrupts our own production project: phase 0 freezes the current version for it, and every v2 install is checked against it.
- Stack detection misses a language or build tool in a trial repository: the five stacks named first are the trial stacks; an undetected stack falls back to the generic path and says so.
- A screen cannot be assembled from the app's existing components: screens are built in the app from the approved frames and checked at 1280 px and 400 px.
- The head-to-head needs a budget above the per-experiment limit: the owner approves it first.
