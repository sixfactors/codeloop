# c-381 research: Install learns my existing service and asks six setup questions

## What exists

<!-- Unlock before build. One line: exists: have | unlock | port | build, with a path or URL when it is not build. have = shipped and exposed, close the card. unlock = built but not exposed, expose it. port = in a sibling repo. -->
exists: build

Most of the parts the first day is made of are shipped and get reused, not rebuilt:

| Piece | Where | What it does today | Used by this card as |
|---|---|---|---|
| `codeloop init` | `src/commands/init.ts:62` | Asks one question (which AI tools), detects the stack from one marker file, then scaffolds: 10 command files, 17 skill folders of two to three files each, 10 lanes, the design system, the wiki tree, `config.yaml`, `.mcp.json`, `CLAUDE.md` and `AGENTS.md` blocks, and one role file per lane stage through `render` | The install command, cut down to five files |
| Stack detection | `src/lib/detect.ts:13` and `:120` | `tsconfig.json`, `pyproject.toml`/`setup.py`/`requirements.txt`/`Pipfile`, `go.mod`; frameworks, scripts and the test command from `package.json` only | The TypeScript, Python and Go half of detection; Java and .NET are absent |
| `wiki init --from-repo` | `src/commands/wiki.ts`, `src/lib/wiki-outline.ts:518` (`scanRepo`) | Scans README, docs, manifests, Makefile, npm scripts, CI, deploy config, routes, schemas, the last 300 commit subjects, TODOs and CODEOWNERS into `reference/` pages and `.codeloop/state/repo-facts.json`; lines it cannot ground are tagged `assumption:` | The fact-gathering half of the map step |
| `wiki build` and the `architecture` skill | `src/commands/wiki.ts`, `templates/skills/architecture/SKILL.md` | Refreshes the facts, starts an "Explain the architecture" card in the wiki lane and runs an agent that writes overview, flows, data model, change map, invariants, start-here and the commands runbook, checked by `codeloop check architecture` | The judgment half of the map step: what each module does and owns |
| Starters and seeds | `starters/{generic,node-typescript,python,go}.yaml`, `templates/seeds/*` | Per-stack `config.yaml` and seed gotchas and patterns pages | The shape of a stack pack; Java and .NET have none |
| Interview and answers | `src/lib/interview.ts`, `codeloop ask`, `codeloop answer --accept-all` | Up to five questions per card with a recommended answer each; accept-all in one write; an answer written by an agent does not count | The six setup questions, with the five-per-card cap raised for the setup skill |
| Lane `when:` | `templates/lanes/build.yaml` | `when: "size >= M"` per stage, so small stories skip research, interview, mock and spec | The step toggles behind the three presets |
| The hub and the workspace Setup page | `workspace/app/setup/page.tsx` | Three cards: Detect, Index skills, Agent, reading `/api/setup/status` | The page Getting started extends |
| `codeloop learn` | `src/commands/wiki.ts` (`learnCommand`) | Applies frequency thresholds to wiki pages (critical, promoted to rules.md). Despite the name it does not learn a codebase | Not reused; named here so the word is not mistaken for the map step |

What does not exist anywhere in the repo: a five-file install; detection for Java (`pom.xml`, `build.gradle`) or .NET (`*.csproj`, `*.sln`); running the build and test commands found and recording exit code and time; git hot spots (files changed most often, changes later reverted; `scanCommitScopes` at `src/lib/wiki-outline.ts:422` only counts conventional-commit scopes); inferred conventions as rules; a `setup` skill with the three process presets Light, Standard and Controlled; a lead-agent and task-agent split of `templates/protocol.md`; and the Getting started and Setup questions screens.

## How others show it

<!-- One row per competitor that has a page in .codeloop/wiki/competitors/, its name in the first cell. The row is copied to that page when this stage passes. -->
| Competitor | How they show it | Source |
|---|---|---|
| Kiro | One click, "Generate Steering Docs", writes `product.md`, `tech.md` and `structure.md` under `.kiro/steering/`, loaded on every interaction; the person then clicks "Spec" and approves requirements, design and tasks in turn. No questions are asked at setup, nothing is run to check that the commands work, and the files carry no verified-at mark | https://kiro.dev/docs/getting-started/first-project/ |
| Spec Kit | `specify init` writes `.specify/` with memory, scripts and templates plus the agent's command folder, then the person writes the constitution by hand with `/speckit.constitution`; `specify check` validates the setup. Nothing is learned from the codebase, and the setup decisions (agent, script type) are the only questions | https://github.github.io/spec-kit/ |
| BMAD | `npx bmad-method install` asks which coding tools and which skills to install, writes `_bmad/` and `_bmad-output/`, then the person runs "bmad setup" and "bmad status" in chat; `bmad-project-context` is a separate skill recommended for existing codebases, which users call weak on legacy monoliths | https://docs.bmad-method.org/start/install-bmad/ |

Two tools without a competitor page set the table stakes and are cited under Sources: Claude Code's `/init` writes one `CLAUDE.md` from the codebase and, under `CLAUDE_CODE_NEW_INIT=1`, proposes before writing; Serena's onboarding runs itself on first activation and seeds a conventions memory. None of the five runs the build or test commands, none shows churn or reverts, and none asks the person questions whose recommended answers come from what it read.

## Options

- Install writes five files and a map step learns the system before setup asks six questions. Install is `codeloop init` reduced to `.codeloop/config.yaml`, `.codeloop/process.yaml`, `.codeloop/rules.md`, the lead-agent block in `CLAUDE.md` or `AGENTS.md`, and `.mcp.json`; skills, lanes and role files stay in the package and reach the agent through `codeloop brief` and the MCP server. A new `map` skill joins `wiki init --from-repo`, `wiki build` and the `architecture` skill with three new scans: the build and test commands run under a time limit with exit code and duration recorded, git hot spots from file churn and reverts, and conventions inferred from the layering the scanner already finds. A new `setup` skill asks six questions with recommended answers drawn from the map, and the answers write the process preset, the rules and one decision each. Detection grows to Java and .NET beside TypeScript, Python and Go. Chosen. It touches `src/commands/init.ts`, `src/lib/scaffold.ts`, `src/lib/detect.ts`, `src/lib/wiki-outline.ts`, `src/lib/render.ts`, `templates/protocol.md`, `templates/skills/map/`, `templates/skills/setup/`, `starters/` and `workspace/app/setup/`. It is the only option that answers the user-feedback pains 1, 6 and 9 (process sized to the change, short always-on context, existing codebases first) in the first fifteen minutes.
- Keep `codeloop init` as it is and add the six questions after it as a second command. Rejected: the sixty-odd files land before the person has seen anything useful, which is the exact complaint the research records against Spec Kit and BMAD ("a sea of markdown"), and the questions would have no learned recommendations to offer because nothing has read the repo yet.
- Learn the system with a scanner only, no agent run, and skip the questions by applying the Standard preset. Rejected: the scanner cannot say what a module does or which conventions matter (`templates/skills/architecture/SKILL.md` exists because `wiki init` output read as tables with no judgment), and a preset applied without a question leaves the sensitive areas and the never-rules unset, so approvals have nothing to attach to. Kept as the fallback when no agent is configured: install and the scanner still run, and Getting started says the summary is waiting for an agent.

## The pain, grounded

<!-- The user pain this card answers, with a source. No source: write assumption: instead and say what would confirm it. -->
pain: a founder or team lead (persona founder) trying an AI coding workflow on an existing service finds that the tool does not understand the system, writes a document trail before anything useful happens, and makes him learn its commands first. Source: `.codeloop/wiki/competitors/2026-10-20-user-feedback-research.md`, "The 10 pains Codeloop v2 must solve" items 1, 6 and 9, each tied to a per-tool complaint with a URL (BMAD "weak on legacy monoliths", Spec Kit "a sea of markdown", Kiro "sledgehammer to crack a nut"); and `.codeloop/wiki/competitors/2026-10-20-new-repo-workflow-research.md`, "Proposed first-run workflow", which counts the files `codeloop init` writes today and notes that `--ci` and the scaffold need two runs.

## Risks

- "Five files and nothing else" is checked against the repo diff, but `init` also writes outside it: the git hooks under `.git/hooks`, the hub registry in the user's home (`registerProject`, which is why `codeloop projects list` carries stale `exportly` entries from test runs), and `.mcp.json` for the host. The acceptance line has to say which writes count.
- Running the repo's build and test commands is the one step that executes somebody else's code. A command that deploys, publishes or migrates must never be picked up as a "test command"; the map step needs a deny list and a time limit per command, and the summary names what it skipped.
- Six questions on one card exceed `MAX_QUESTIONS = 5` in `src/lib/interview.ts`; the setup skill either raises the cap for its own kind of question or splits the sixth (keep the conventions as rules) into a yes-or-no the Setup questions screen shows beside the other five.
- Java and .NET detection without a Java or .NET project in this workspace cannot be exercised end to end here; the first-day test on a Spring Boot service (c-374, "How it is proved") is where it is proven, and until then the detection ships with fixture-based tests only.
- The lead-agent and task-agent roles are told apart by the session hook; a session started by hand inside an `orch run` worktree would read the lead-agent protocol. The hook has to read a marker the orchestrator sets, not guess from the folder.

## Open questions for the interview

Listed, not answered. Each has a recommended answer in the approved plan the interview will offer.

1. Which five files does install write, and where do the skills, lanes and role files that `init` copies today live instead?
2. How does a session know it is the lead agent or a task agent, so the right protocol is printed without being told?
3. Does the map step run the build and test commands it finds without asking, and under what time limit and deny list?
4. How are sensitive areas suggested from churn and reverts, and what does "needs his approval" add to an item that touches one?
5. Which of the five never-rules are enforced by a hook and which are advisory text the reviewer checks?

## Sources

<!-- At least three, one per line: a dash, the word source and a colon, a URL or a path in this repo (optionally path:line), a dash, a note. `codeloop check research` counts them; a path counts only when the file exists. -->
- source: docs/artifacts/codeloop/v2/c-374-workflow.html - the approved first-day workflow: steps 1 to 5, the six questions with their recommended answers, and the screens table; settles what this card delivers
- source: docs/artifacts/codeloop/v2/c-374-system-design.html - the three parts and the defaults a team starts with; settles that the lead agent writes no code and that "done" means the pipeline passes
- source: .codeloop/wiki/competitors/2026-10-20-new-repo-workflow-research.md - how twelve tools onboard a repo; settles the table stakes (one-step summary from Kiro, Claude Code and Serena) and counts the files `init` writes today
- source: .codeloop/wiki/competitors/2026-10-20-user-feedback-research.md - the 10 pains; settles the pain line (items 1, 6 and 9) and the trap of two install tracks
- source: src/lib/detect.ts:13 - the detection rules today: TypeScript, Python, Go, and package.json only; settles that Java and .NET are `build`
- source: src/lib/wiki-outline.ts:518 - `scanRepo`, every fact the scanner gathers today; settles that commands are never run and churn is never measured
- source: src/lib/scaffold.ts:38 - the command, skill, lane and knowledge files `init` copies; settles the count the five-file install cuts
- source: templates/lanes/build.yaml - `when: "size >= M"` per stage; settles that step toggles already have a mechanism
- source: https://kiro.dev/docs/getting-started/first-project/ - Generate Steering Docs writes three files in one click; settles the one-step bar
- source: https://code.claude.com/docs/en/memory - `/init` writes CLAUDE.md from the codebase and proposes before writing under the new init flag; settles "propose before writing" as table stakes
- source: https://github.com/oraios/serena - onboarding runs itself on first activation and seeds a conventions memory; settles that learning before the first task is expected

## Rubric

- R2 pass: `grep -rln -i "pom.xml\|build.gradle\|\.csproj\|dotnet" src/ templates/ starters/` finds nothing; `grep -rn "Light\b\|Controlled\b" src/ templates/ starters/` finds nothing; `ls templates/skills/` lists api architecture breakdown brief build interview mock release research review sdk spec system-design test-design ui verify workflow and no `setup` or `map`; `node dist/index.js --help` lists `init`, `wiki`, `learn` (wiki frequency thresholds, `src/commands/wiki.ts`) and no setup or map command; `grep -n "execSync\|spawnSync" src/lib/wiki-outline.ts` finds one call, `git log --format=%s -n 300` at line 425, so no build or test command is ever run by the scanner
- R5 pass: three options under `## Options`; the five-file install plus map plus setup is chosen; keeping `init` and adding questions after it loses because sixty files land before anything useful and the questions have no learned recommendations; scanner-only with a silent preset loses because the scanner has no judgment (`templates/skills/architecture/SKILL.md`, Role) and unset sensitive areas leave approvals nothing to attach to
- R7 pass: five open questions under `## Open questions for the interview`, none answered here; each maps to a line of the approved plan (docs/artifacts/codeloop/v2/c-374-workflow.html, steps 1 to 4) the interview will offer as the recommended answer

verdict: build
