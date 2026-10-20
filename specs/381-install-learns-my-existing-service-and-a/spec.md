# c-381 spec: Install learns my existing service and asks six setup questions

<!-- The owner accepted all five recommended answers on 2026-10-20 (interview.md Q1 to Q5) and pre-approved the spec in chat; each answer is folded into the field named in tasks.md's S3 line. -->
<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can install with one command, let Codeloop learn my codebase in any language, and answer six questions with recommended answers, so that agents know my system and my process before the first piece of work.

feature: v2-first-day
initiative: wiki/initiatives/any-stack-same-loop.md
size: M
metric: cycle_time_days
done_when: on a fresh clone of a Python service and a Java service, `codeloop init` leaves exactly five new paths in `git status --porcelain`, `codeloop map` ends with a ten-line summary in .codeloop/wiki/start-here.md naming every command it ran with exit code and seconds, and the Getting started and Setup questions pages under /setup show that summary and six questions with recommended answers

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given an existing service in Java, .NET, Go, TypeScript or Python with a test suite, when the founder runs `codeloop init` once, then the terminal reports the languages and frameworks, the build and test commands, the database, the pipeline and the main modules it found, and the repository diff shows five new files and nothing else.
- US2 Given the install, when he opens his AI tool in the repository, then its first message says it is the lead agent for this repository and that its first job is to learn the codebase and then ask him a few questions; a session the lead agent starts for a task reads the task-agent protocol instead.
- US3 Given the install and an agent configured, when learning runs with no input, then every build and test command found runs under its time limit with exit code and seconds recorded, the knowledge base has a draft page per module naming the data it owns, the risky areas and the conventions, and Getting started shows the progress and then the ten-line summary.
- US4 Given the summary, when he opens Setup questions, then six questions each carry a recommended answer drawn from what was learned, the three presets Light, Standard and Controlled list their steps with each step switchable, and Accept all writes the work process, the rules and one recorded decision per answer with his name and the time.
- US5 Given a stack the detection does not know or a command that does not finish, when install and learning run, then the stack falls back to generic and the terminal says so, the command stops at its time limit, and the summary names what did not complete with its output.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: Getting started, Setup questions

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: keep

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Sorting requests into features, tasks and bugs and the bug short route (phase 2).
- The lead agent and task agents as running roles with briefs, hand-backs, cost per item and the reviewer (phase 3); this card only tells the two protocols apart.
- Knowledge pages flagged when their code changes, corrections kept as decisions (phase 4); the Knowledge and Work process screens (phase 6).
- Stack packs beyond detection and the build and test commands: conventions and checks per stack come with the packs.
- Hooks for the never-rules that no local hook can see (touching production, adding a dependency); those stay rules the reviewer checks (Q5).
- The pre-commit guards for an applied migration and a secret pattern (Q5): this card writes them into rules.md as hook-enforced; the guard code itself is phase 1's second slice once the migrations folder and secret patterns are read from the map.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- Install writes more than five files into the repository, or changes an existing file outside its marked block (uc-381-01).
- A deploy, publish, release or migration command is picked up as a build or test command and run during learning (uc-381-02).
- A build or test command hangs and learning never produces the summary (uc-381-03).
- A session started by the lead agent for a task reads the lead-agent protocol and starts planning instead of building (uc-381-04).
- Accept all writes a decision with no name or time, or an agent's answer counts as the owner's (uc-381-05).
- A Java or .NET repository is detected as generic, so no build or test command runs and the recommendations are empty (uc-381-06).
