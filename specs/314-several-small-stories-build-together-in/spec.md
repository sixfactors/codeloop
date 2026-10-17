# c-314 spec: Several small stories build together in one turn

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can have several trivial and S stories built in one agent turn, each still judged on its own scope, commits and verify, so that N small fixes cost one build run, not N.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npm test -- src/lib/__tests__/orch-batch.test.ts` exits 0, and three small fixes on this repo build in one agent start, each passing or failing on its own story page

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given up to five trivial or S stories at build that change different files, when the orchestrator starts a build turn, then one agent builds them all and each story's work is committed under its own id.
- US2 Given a batched turn has handed back, when it is gated, then each story is judged on its own commits, scope, checks and verify, and moves on or waits on its own.
- US3 Given one story in a batch fails, when the batch is gated, then that story leaves the batch with the failure named on its page and gets its own next turn, and the other stories still move on.
- US4 Given more than five small stories ready, or two that change the same file, when a batch is formed, then at most five with no shared file join it and the rest wait for the next batch; stories from different features may share one.
- US5 Given a story that was built in a batch, when the founder opens its page, then its activity names the batch and the stories built with it, and its approvals are asked exactly as if it was built alone.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
no_screen_reason: the only visible change is one activity line on the story page naming the batch, which the existing activity feed already renders as a sentence. A reviewer should confirm that line reads well in the feed and that no batch view on the board was expected.

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Answers folded in

- Q1 (up to five, different files only): US1 and US4.
- Q2 (a failing story leaves the batch, the rest carry on): US3.
- Q3 (different features may share a batch; the page names the batch): US4 and US5.
- Q4 (own checks, verify and approvals; three fixes in one start as proof): US2, US5 and `done_when:`.

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Merging small stories into one combined story.
- Batching stories that change the same file, or more than five at once (Q1).
- One approval or one verify for a whole batch (Q4).
- Batching M or L stories.
- Changing how many builders run in parallel.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- Two batched stories change the same file and their commits mix (uc-314-01).
- One commit carries two stories' work under one id and passes the scope check (uc-314-02).
- One failing story holds back every other story in the batch (uc-314-03).
- A failed story keeps its lease after leaving the batch and blocks its files (uc-314-04).
- A batch takes more than five stories, or an M story (uc-314-05).
- One verify or one approval is counted for the whole batch (uc-314-06).
- A batched story's page does not name the batch, so a reviewer cannot find the shared turn (uc-314-07).
