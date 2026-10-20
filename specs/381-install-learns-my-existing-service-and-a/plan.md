# c-381 plan: Install learns my existing service and asks six setup questions

Provisional until the owner answers the interview (specs/381-install-learns-my-existing-service-and-a/interview.md). Phase 1 of the approved v2 plan; the parent story is c-374.

## Layers touched

api (init, scaffold, detect, render, the map and setup skills, the presets), ui (Getting started and Setup questions in workspace/app/setup), test (fixtures for five stacks, the five-file check, the time limit, the role split), docs (the two skills' SKILL.md, the protocol files).

## Files

- `src/commands/init.ts`, `src/lib/scaffold.ts`: the five-file install and the detection report.
- `src/lib/detect.ts`, `starters/java.yaml`, `starters/dotnet.yaml`: Java, .NET, Go, TypeScript and Python with their build and test commands, database and pipeline.
- `src/lib/wiki-outline.ts`: commands run with limits, hot spots, conventions.
- `src/lib/render.ts`, `templates/protocol-lead.md`, `templates/protocol-task.md`: the two protocols.
- `templates/skills/map/`, `templates/skills/setup/`, `templates/presets/`: the two new skills and the three presets.
- `workspace/app/setup/page.tsx`: the two screens, from the approved mock in `workspace/app/mocks/381-install-learns-my-existing-service-and-a/`.
- Not this card's: the session hook in guard-hooks (another builder's file) reads `CODELOOP_ROLE` and prints the task protocol; named as a dependency.

## Order

1. Detection and starters (T001), then the five-file install (T002): proven on fixtures before anything learns.
2. Protocol split (T003) beside it; the hook dependency is raised with the other builder.
3. The map skill (T004), then the setup skill (T005), each exercised on this repository and on a Python fixture.
4. The two pages (T006) from the mock, checked at 1280 px and 400 px.
5. Tests (T007, T008) grow with each step; the first-day run on Netflix Dispatch and a Spring Boot service is c-374's proof, not this card's.

## Risks

- The file count is checked against the repository diff; hooks under .git, the hub registry in the home folder and the host's .mcp.json are outside it, and the acceptance line says so.
- Running the repository's commands executes someone else's code: deny list, per-command and total time limits, and the summary names what was skipped.
- Six questions exceed the five-per-card cap; the setup kind is exempt or the sixth is a yes-or-no.
- Java and .NET cannot be exercised end to end in this workspace; fixtures here, the Spring Boot service in c-374's proof.
- The role split depends on a hook another builder owns; until it lands, a hand-started session is always the lead agent, which is the safe default.
