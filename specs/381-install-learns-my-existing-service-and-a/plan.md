# c-381 plan: Install learns my existing service and asks six setup questions

The owner accepted the five recommended answers (specs/381-install-learns-my-existing-service-and-a/interview.md). Phase 1 of the approved v2 plan; the parent story is c-374.

## Layers touched

api (init, scaffold, detect, render, the map and setup skills, the presets), ui (Getting started and Setup questions in workspace/app/setup), test (fixtures for five stacks, the five-file check, the time limit, the role split), docs (the two skills' SKILL.md, the protocol files).

## Files

- `src/lib/detect.ts`, `starters/java.yaml`, `starters/dotnet.yaml`: Java, .NET, Go, TypeScript and Python with their build and test commands, database, pipeline and main modules; `src/lib/wiki-outline.ts` re-exports the top-folder scan it now takes from detect.
- `src/commands/init.ts`, `src/lib/scaffold.ts`, `templates/codeloop/process.yaml`, `templates/codeloop/never-rules.md`: the five-file install and the detection report; `--full` keeps the old scaffold. `src/lib/host-hooks.ts`: the host hooks file written outside the repository diff.
- `src/lib/lane.ts`: lanes and the skills index fall back to the package's templates when the project has `process.yaml` and no copies of its own.
- `src/lib/render.ts`, `templates/protocol-lead.md`, `templates/protocol-task.md`: the two protocols, with the lead block the only host file install writes.
- `src/commands/guard-hooks.ts`: the session hook reads `CODELOOP_ROLE` and prints the task protocol for an agent process, the lead protocol otherwise; before the map and the setup it names the next command.
- `src/lib/map.ts`, `src/commands/map.ts`, `templates/skills/map/SKILL.md`: commands run with limits, hot spots, conventions, `.codeloop/state/map.json`, the ten-line summary.
- `src/lib/setup.ts`, `src/commands/setup.ts`, `templates/skills/setup/SKILL.md`, `templates/presets/{light,standard,controlled}.yaml`: the six questions, their recommendations from the map, and the answers written to `process.yaml`, `rules.md` and one decision page each.
- `src/lazy.ts`: the `map` and `setup` commands registered.
- `src/lib/services.ts`, `src/lib/server.ts`, `src/sdk/client.ts`, `src/sdk/http.ts`, `src/sdk/local.ts`, `src/sdk/types.ts`: setup status with the map and the questions, and the answer routes the page writes through.
- `workspace/lib/api.ts`, `workspace/lib/types.ts`, `workspace/hooks/use-api.ts`, `workspace/app/setup/page.tsx`: the two screens, from the approved mock in `workspace/app/mocks/381-install-learns-my-existing-service-and-a/`.
- Tests: `src/lib/__tests__/detect-stacks.test.ts`, `src/lib/__tests__/init-five-files.test.ts`, `src/lib/__tests__/map.test.ts`, `src/lib/__tests__/setup.test.ts`, `src/lib/__tests__/session-role.test.ts`; the three existing tests that spawn the full `init` (`gates-runs-setup`, `hub-cli`, `store-home`) pass `--full`.
- `specs/381-install-learns-my-existing-service-and-a/rubric-build.md`: the red test outputs and the gotchas read.

## Order

1. Detection and starters (T001), then the five-file install (T002): proven on fixtures before anything learns.
2. Protocol split and the session hook (T003) beside it.
3. The map skill (T004), then the setup skill (T005), each exercised on this repository and on a Python fixture.
4. The two pages (T006) from the mock, checked at 1280 px and 400 px.
5. Tests (T007, T008) grow with each step; the first-day run on Netflix Dispatch and a Spring Boot service is c-374's proof, not this card's.

## Risks

- The file count is checked against the repository diff; hooks under .git, the hub registry in the home folder and the host's .mcp.json are outside it, and the acceptance line says so.
- Running the repository's commands executes someone else's code: deny list, per-command and total time limits, and the summary names what was skipped.
- Six questions exceed the five-per-card cap; the setup kind is exempt or the sixth is a yes-or-no.
- Java and .NET cannot be exercised end to end in this workspace; fixtures here, the Spring Boot service in c-374's proof.
- A hand-started session is always the lead agent; only a process with `CODELOOP_ROLE=agent` gets the task protocol, so a person can never be handed the wrong one.
