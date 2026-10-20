# c-374 spec: Orchestrator, workers and server as three parts, with templates and workflows set in the UI

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a dev, I can install Codeloop on an existing service and, in one day, have it learn the system, ask me six questions, and take a first feature and a first bug to done through a lead agent, task agents and a separate reviewer, so that my team can trust an agent with real work without learning Codeloop's commands first.

feature: v2-first-day
initiative: wiki/initiatives/any-stack-same-loop.md
size: M
metric: cycle_time_days
done_when: the eight first-day steps complete on two real services in different languages (Netflix Dispatch in Python and a Spring Boot service in Java) with setup time, questions accepted as recommended, time to first approval, time to done, interventions and AI cost recorded under the card's evidence folder, and the owner has run the eight steps himself

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given an existing service in Java, Python, TypeScript, Go or C# with a test suite and a pipeline, when the team lead runs one install command, then Codeloop reports the languages, build and test tools, database, pipeline and main modules, adds five configuration files and nothing else, and his AI tool opens as the lead agent without being told.
- US2 Given the install, when learning runs for about ten minutes with no input and nothing leaving the machine, then the knowledge base has a draft page per module, the build and test commands that really worked with the time each took, the risky areas and the conventions, and he reads a ten-line summary on Getting started.
- US3 Given the learned system, when he answers the six setup questions (or accepts the recommendations at once), then the work process, the rules and one recorded decision per answer exist, and a correction he makes in the chat fixes the Knowledge page and is kept as a decision so no agent asks again.
- US4 Given the setup, when he asks for a feature in a sensitive area, then the lead agent sizes it, searches decisions before asking him, writes a short plan, stops once for his named approval, a task agent builds with proof and cost, a separate reviewer checks it, the item is done when his pipeline passes, and he reads one paragraph.
- US5 Given a pasted production error, when the bug takes the short route, then it is reproduced, fixed, covered by a test that fails without the fix and approved once, and the next morning Home shows what waits for him, worked versus waiting, cost per item and the warnings.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: Getting started, Setup questions, Knowledge, Work process, Work item, Agents, Home

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: keep

## Decisions

<!-- The owner's answers in the approved plan, folded in. -->
- Three presets for how much process a change gets: Light, Standard (recommended), Controlled; each step switchable (plan, step 4).
- One lead agent per repository; it writes no code. Task agents split by area so two never edit the same files. A separate reviewer checks every change (plan, defaults).
- "Done" means the team's existing automated checks pass (plan, step 4 question 4).
- Five default rules a team can extend: no pushing to the main branch, no editing database changes that already ran, no showing secrets, no touching production, no new dependency without asking (plan, step 4 question 5).
- Learning the system comes before the first work item (plan, defaults).
- Stack packs for Java, Python, TypeScript, Go and .NET first (plan, what you can change).
- Implementation step 1 publishes this plan inside Codeloop with no product code; the rest of the build follows the owner's review there (plan, delivery).
- The current version is frozen for our own production project and v2 is built beside it, with at most two AI builders at a time (plan, delivery).
- The head-to-head against Spec Kit and BMAD needs more AI calls than the limit of ten per experiment, so the owner approves its budget first (plan, how we will prove it).

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- The team version with a shared board for several people: follows on the existing storage plan, already proposed, no changes now.
- Protobox packs: after v2.0; v2.0 ships one built-in pack plus team forks.
- Migrating or syncing the team's old tracker; it stays as it is.
- Monitor rules beyond the four strong ones and the Home warnings; the v1 flag slice is its own card.
- The public guide pages; they ship with v2 from the same knowledge-base pages.
- Any product code in implementation step 1.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- Install writes more than five files or changes code in the repository (uc-374-01).
- Learning hangs on a build or test command and never produces the summary (uc-374-02).
- An agent approves its own work, or an approval is recorded with no name (uc-374-03).
- A work item's status drifts from the real commits and test results (uc-374-04).
- A knowledge page describes code that changed and is not flagged (uc-374-05).
- A question already answered reaches the team lead again (uc-374-06).
- The cost of a work item is not visible on the item or on Home (uc-374-07).
- A v2 install touches our own production project (uc-374-08).
