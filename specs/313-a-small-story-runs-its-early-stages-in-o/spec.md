# c-313 spec: A small story runs its early stages in one agent turn

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can watch one agent carry a story through research, interview, mock and spec in one turn, with every stage check still run by the engine, and have a small story's review run inside verify, so that a story costs one or two agent runs, not five.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npm test -- src/lib/__tests__/stage-carry.test.ts` exits 0, and `codeloop stats` on this repo shows a new M story reaching the spec gate after one agent start

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given an M story at research, when the orchestrator starts its turn, then one agent carries research, interview, mock and spec, the engine runs each stage's check and writes each event, and the turn ends at the spec gate.
- US2 Given a carried turn, when the agent writes interview questions for the owner, then the turn stops right there and the next turn starts from the answers.
- US3 Given a carried turn, when one stage's check fails, then the turn stops at that stage with the failure named on the story and no later stage is written.
- US4 Given an S story, when it reaches verify, then the review triage runs in the same verify turn and the story still waits for the reviewer's approval before it merges.
- US5 Given this repo's board, when `codeloop stats` runs, then it shows agent starts per story up to the spec gate and from build to merged, so one start for a new M story and four for an S story can be read off.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
no_screen_reason: the carry changes how many agent turns a story takes, not what any page shows; each stage's events still land on the story page and in the activity feed as they do now. A reviewer should confirm the story page still shows one entry per carried stage and that the reviewer's approval for an S story is still visible where it is today.

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Answers folded in

- Q1 (carry every early stage, stop at the first approval or question): US1, and the carry stops at the spec gate.
- Q2 (an S story still waits for the reviewer): US4.
- Q3 (stop as soon as questions are asked): US2.
- Q4 (what proves it): `done_when:` and US5.

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Merging the early stages into one stage with one check; every stage keeps its own check, rubric and events (Q1).
- Carrying past the spec gate, into data-model or build; data-model runs in its own turn after the owner approves.
- Resuming one agent session across turns.
- Dropping the reviewer's approval for an S story; review folds into verify, the approval does not go away (Q2).
- Changing review for M and L stories.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- A carried turn runs past the spec gate and writes work the owner has not approved (uc-313-01).
- A carried turn keeps going after asking questions, so later stages are written on guessed answers (uc-313-02).
- A failed stage check does not stop the carry, and later stages are built on a failing one (uc-313-03).
- The agent skips a stage file and the engine advances anyway (uc-313-04).
- The turn's time limit is one stage's, so a long carry is killed with work unrecorded (uc-313-05).
- An S story merges without the reviewer's approval once review is folded into verify (uc-313-06).
- One hand-back for a carried turn is credited only to the last stage, so earlier stages show no agent run and their failures are counted wrongly (uc-313-07).
