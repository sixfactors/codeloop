# c-307 spec: The orchestrator reviews every story and fixes what is wrong before it picks the next one

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can trust the orchestrator to re-read the board and fix what is wrong before it picks the next story, so that I stop clearing stuck stories by hand.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npm test -- src/lib/__tests__/review-pass.test.ts` exits 0, and `codeloop orch run --review` on this repo's own board prints a report with fixed, asked and could-not-tell sections, each line naming its evidence

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a story whose merged work shows a later stage with no gate between, when the review pass runs, then the story moves to that stage with an event naming the commits, and a story that is merged and verified is closed.
- US2 Given a story sitting at a stage its merged work no longer needs, when the review pass runs, then the stage file is written with reasonable content from the merged work and the code, a review step checks it for anything the stage needed, each real gap becomes an inbox question, and no stage is marked skipped.
- US3 Given a fix that would cross a gate, split a story or drop one, when the review pass plans it, then it becomes an inbox question with the recommended answer and the story does not move.
- US4 Given an orchestrator pass, when it starts and before each pick, then the review reads only stories changed since the last pass, and when `codeloop orch run --review` runs overnight, then it reads every open story and stops at the run budget.
- US5 Given a review pass has run, when it ends, then its report lists what it fixed, what it asked and what it could not tell, each with the evidence named.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
no_screen_reason: the pass works on the board through events and inbox questions, which the story page and the inbox already show; its report is command-line output. A reviewer should confirm the inbox shows a review-pass question with its recommended answer and evidence without a new screen, and that no story page change was missed.

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Answers folded in

- Q1 (the edit guard stays its own story): `## Not building`, first line.
- Q2 (what the pass may do alone): US1 (move forward with no gate between, close merged and verified), US2 (write reasonable content, then review for gaps, never mark a stage skipped), US3 (gate, split and drop become inbox questions).
- Q3 (how often): US4.
- Q4 (what proves it): `done_when:`, US5, and `## Failure modes`, one test each.

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- The edit guard that stops source edits before build; it stays its own story, c-306 (Q1).
- Crossing a gate, splitting or dropping a story without the owner; those are asked, never applied (Q2).
- Marking any stage skipped; a stage with no real need gets written content and a gap review instead (Q2).
- A new screen for the pass report; it is command-line output and inbox questions.
- Changing how failures are counted or how a stuck story explains itself; those belong to c-308 and the retry model in `src/lib/engine.ts`.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- The pass moves a story past a gate it never crossed (uc-307-01).
- Docs-only or mock-only commits under the story's id are read as merged work and place the story too far forward (uc-307-02).
- A stage with no real need is marked skipped instead of written and reviewed (uc-307-03).
- A gap the review step finds is dropped instead of becoming an inbox question (uc-307-04).
- The pass before each pick re-reads every open story each time, so one pick costs minutes (uc-307-05).
- An overnight `orch run --review` runs past the run budget (uc-307-06).
- Two passes ask the same question twice on one story (uc-307-07).
