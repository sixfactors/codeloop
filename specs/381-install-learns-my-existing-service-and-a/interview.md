# c-381 interview: Install learns my existing service and asks six setup questions

Five questions for the owner, filed through `codeloop ask c-381 --file` on 2026-10-20. Every recommended answer comes from the approved v2 plan (docs/artifacts/codeloop/v2/c-374-workflow.html, steps 1 to 4); the owner answers in chat or with `codeloop answer c-381 --accept-all`. No answer below was written by an agent.

| Q | Tag | Builds on research line |
|---|---|---|
| Q1 | scope | `## What exists`: `init` copies 10 commands, 17 skill folders, 10 lanes and one role file per stage (src/lib/scaffold.ts:38); the plan says five files |
| Q2 | boundary | `## Risks`, last bullet: a hand-started session in an `orch run` worktree would read the lead-agent protocol; `CODELOOP_ROLE=agent` already exists at src/lib/agent.ts:332 |
| Q3 | risk | `## Risks`, second bullet: running the repo's commands executes someone else's code; `scanRepo` never runs one today (src/lib/wiki-outline.ts:425) |
| Q4 | acceptance | `## What exists`, last paragraph: `scanCommitScopes` counts commit scopes only, no churn or reverts; the plan suggests sensitive areas from both |
| Q5 | boundary | `## Options`, chosen option: answers write `rules.md`; the plan's five never-rules are listed without saying which a hook can enforce |

## Q1 Scope: which five files does install write, and where do the skills, lanes and role files that init copies today live instead?
recommended: Install writes .codeloop/config.yaml, .codeloop/process.yaml, .codeloop/rules.md, the lead-agent block in CLAUDE.md or AGENTS.md, and .mcp.json. Skills, lanes, commands and role files stay in the package and reach the agent through codeloop brief and the MCP server. The git hooks land in .git/hooks, outside the repo diff, and nothing else is written.
answer: Install writes .codeloop/config.yaml, .codeloop/process.yaml, .codeloop/rules.md, the lead-agent block in CLAUDE.md or AGENTS.md, and .mcp.json. Skills, lanes, commands and role files stay in the package and reach the agent through codeloop brief and the MCP server. The git hooks land in .git/hooks, outside the repo diff, and nothing else is written.

## Q2 Boundary: how does a session know it is the lead agent or a task agent, so the right protocol is printed without being told?
recommended: The session hook prints the lead-agent protocol by default. A task agent is started by the lead agent through codeloop orch run, which sets a marker the hook reads (an environment variable on the agent process), and the hook then prints the task-agent protocol instead. A session started by hand is always the lead agent.
answer: The session hook prints the lead-agent protocol by default. A task agent is started by the lead agent through codeloop orch run, which sets a marker the hook reads (an environment variable on the agent process), and the hook then prints the task-agent protocol instead. A session started by hand is always the lead agent.

## Q3 Risk: does the map step run the build and test commands it finds without asking, and under what limits?
recommended: Yes, with no input, as the plan says nothing leaves the machine and no input is needed. Each command runs under a five-minute limit with a ten-minute total, only from the test, lint, build and typecheck scripts it recognises, never a command matching deploy, publish, release, migrate or db. A command that hangs stops at its limit and the summary lists it as "did not complete" with the output.
answer: Yes, with no input, as the plan says nothing leaves the machine and no input is needed. Each command runs under a five-minute limit with a ten-minute total, only from the test, lint, build and typecheck scripts it recognises, never a command matching deploy, publish, release, migrate or db. A command that hangs stops at its limit and the summary lists it as "did not complete" with the output.

## Q4 Acceptance: how are sensitive areas suggested from churn and reverts, and what does "needs his approval" add to a work item that touches one?
recommended: The map step ranks top-level modules by files changed in the last twelve months and lists any module with a reverted change; the three highest plus every reverted one are suggested. Accepting adds an owner approval of the plan before build for any work item whose files fall in a sensitive area, the same gate the Controlled preset adds for every item.
answer: The map step ranks top-level modules by files changed in the last twelve months and lists any module with a reverted change; the three highest plus every reverted one are suggested. Accepting adds an owner approval of the plan before build for any work item whose files fall in a sensitive area, the same gate the Controlled preset adds for every item.

## Q5 Boundary: which of the five never-rules are enforced by a hook and which are advisory text the reviewer checks?
recommended: Three are enforced where a hook can see them: pushing to the main branch (pre-push), editing a database migration that already ran (pre-commit on the migrations folder), and a secret in a diff (pre-commit pattern check). Touching production and adding a dependency without asking are rules in rules.md the reviewer checks, because no local hook can tell a production target or a deliberate dependency from a test one.
answer: Three are enforced where a hook can see them: pushing to the main branch (pre-push), editing a database migration that already ran (pre-commit on the migrations folder), and a secret in a diff (pre-commit pattern check). Touching production and adding a dependency without asking are rules in rules.md the reviewer checks, because no local hook can tell a production target or a deliberate dependency from a test one.

## Research's open questions

Research listed five open questions under `## Open questions for the interview` (specs/381-install-learns-my-existing-service-and-a/research.md). Each is asked above, in the same order: research 1 is Q1, 2 is Q2, 3 is Q3, 4 is Q4, 5 is Q5. None is settled here.

## Rubric

- I2 pass: Q1 scope, Q2 boundary, Q3 risk, Q4 acceptance, Q5 boundary; the table at the top of specs/381-install-learns-my-existing-service-and-a/interview.md names each tag and the research.md line it builds on
- I4 pass: the five R7 questions in specs/381-install-learns-my-existing-service-and-a/research.md `## Open questions for the interview` are Q1 to Q5 here, in order, none marked settled; `grep -c '^## Q' specs/381-install-learns-my-existing-service-and-a/interview.md` prints 5
- I6 pass: all five accepted by the owner on 2026-10-20; Q1 → spec.md US1 (five files, nothing else) and tasks.md T002; Q2 → US2 and T003, T008; Q3 → US3, US5 and T004, T007; Q4 → US4 and T005; Q5 → `## Not building` and T005; in specs/381-install-learns-my-existing-service-and-a/
