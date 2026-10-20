# c-381 tasks: Install learns my existing service and asks six setup questions

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [P] [US1] [api] Detection for five stacks in src/lib/detect.ts: Java from pom.xml or build.gradle(.kts) with `mvn -q test` or `./gradlew test`; .NET from *.sln, *.csproj or global.json with `dotnet build` and `dotnet test`; Go from go.mod with `go build ./...` and `go test ./...`; TypeScript from tsconfig.json and the package scripts; Python from pyproject.toml, setup.py or requirements.txt with `pytest`; plus the database (docker-compose services, ORM dependencies, a migrations folder) and the pipeline (.github/workflows, .gitlab-ci.yml, Jenkinsfile); starters/java.yaml and starters/dotnet.yaml beside the existing three
- [ ] T002 [US1] [api] Five-file install in src/commands/init.ts and src/lib/scaffold.ts: write .codeloop/config.yaml, .codeloop/process.yaml, .codeloop/rules.md, the lead-agent block in CLAUDE.md or AGENTS.md and .mcp.json; skills, lanes, commands and role files stay in the package and are served by `codeloop brief` and the MCP server; the terminal reports languages, frameworks, build and test commands, database, pipeline and main modules, and names a stack it could not detect
- [ ] T003 [P] [US2] [api] Split templates/protocol.md into templates/protocol-lead.md and templates/protocol-task.md; src/lib/render.ts writes the lead block into the host file; the session hook in src/commands/guard-hooks.ts prints the task protocol when `CODELOOP_ROLE=agent` (set by src/lib/agent.ts:332) is in its environment and the lead protocol otherwise
- [ ] T004 [US3] [api] New `map` skill in templates/skills/map/ driven by `codeloop map`, joining `wiki init --from-repo`, `wiki build` and the architecture skill with three new scans in src/lib/wiki-outline.ts: run each detected build and test command under a per-command and total time limit with a deny list (deploy, publish, release, migrate, db), recording exit code and seconds; hot spots from `git log --numstat` churn over twelve months and `Revert` commits; conventions from the layering and configuration locations already scanned; the ten-line summary in .codeloop/wiki/start-here.md
- [ ] T005 [US4] [api] New `setup` skill in templates/skills/setup/ with the six questions and recommended answers filled from the map (sensitive areas from hot spots, done from the pipeline's checks, conventions from the map), the three presets as templates/presets/{light,standard,controlled}.yaml with step toggles, and answers that write .codeloop/process.yaml, .codeloop/rules.md and one decision page each with the owner's name and time; the per-card question cap in src/lib/interview.ts does not apply to the setup kind
- [ ] T006 [US4] [ui] Getting started and Setup questions as real pages extending workspace/app/setup/page.tsx from the approved frames in workspace/app/mocks/381-install-learns-my-existing-service-and-a: what was found, learning progress with each command's exit and seconds, the ten-line summary, six questions with Accept all, the preset with each step switchable; checked at 1280 px and 400 px
- [ ] T007 [US5] [test] Fixture repositories for Java, .NET, Go, TypeScript and Python under src/lib/__tests__/fixtures: detection names the stack and commands (uc-381-06); an unknown stack falls back to generic and says so; a command that sleeps past its limit is killed and named in the summary (uc-381-03); a deny-listed script is skipped (uc-381-02); `init` on a fixture leaves exactly five paths in `git status --porcelain` (uc-381-01)
- [ ] T008 [US2] [test] The rendered lead block says "lead agent" and names learn-then-ask as the first job; with `CODELOOP_ROLE=agent` the session output is the task protocol (uc-381-04); Accept all records six decisions each with a name and time and refuses an agent process (uc-381-05)

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 (interview.md:15, the five files) → spec.md US1 and tasks.md T002; Q2 (interview.md:19, the role marker) → spec.md US2 and T003, T008; Q3 (interview.md:23, run without asking, five-minute limit, deny list) → spec.md US3, US5 and T004, T007; Q4 (interview.md:27, hot spots and the plan approval) → spec.md US4 and T005; Q5 (interview.md:31, three hook-enforced, two at review) → spec.md `## Not building` and T005; all under specs/381-install-learns-my-existing-service-and-a/
- S6 pass: `## Not building` in specs/381-install-learns-my-existing-service-and-a/spec.md:33 lists phases 2 to 6, stack packs beyond detection, the two never-rules no hook can see (Q5) and the two pre-commit guards that wait on the map's own data
