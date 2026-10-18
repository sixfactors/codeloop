# c-362 spec: I approve and answer from chat, and the page loads fast and lists every artifact

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can answer the orchestrator's questions in chat, approve with conditions in one step, and open any story or artifact without waiting, so that clearing my work takes seconds.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npx vitest run src/lib/__tests__/approve-conditions.test.ts` and `npx vitest run src/lib/__tests__/story-page-reads.test.ts` exit 0, and http://localhost:4040/p/codeloop/artifacts lists the c-321 system design

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a story at a gate with open questions and open review findings that each carry a recommendation, when I approve it with conditions from the board, the command line or a chat session, then each recommended answer is recorded as mine, each finding is marked waived, and the story moves on in one step.
- US2 Given one open question or finding with no recommendation, when I approve with conditions, then nothing is recorded and I am told which one needs my answer.
- US3 Given a story whose findings I waived, when I open its page, then the waived findings are listed with who waived them and when.
- US4 Given the board has sat idle until its index closed, when I open a story, then the page frame shows at once and the story text within 1 second.
- US5 Given pages in folders under docs/artifacts and mocks on stories, when I open Artifacts, then every one is listed with its kind and story, system designs, plans and workflows above mocks, newest first in each.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: story-page, artifacts

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Decisions

<!-- The interview answers, folded in. -->
- decided by: a decision the orchestrator relays from chat is recorded as the owner's approval or answer, with no relayer name and no quoted words. A chat session already acts as owner (src/lib/engine.ts:60), so this needs no new field (interview Q1).
- which stories: one owner yes in chat is enough, and the orchestrator applies it only to the stories the owner named (interview Q2).
- conditions: approve with conditions records every recommended interview answer and waives every open review or gap finding (a question of kind review or gap, src/lib/interview.ts:17) in one action, and the story page lists the waived findings (interview Q3).
- speed: the story page frame shows at once and the story text within 1 s, cold or warm, proven by a test that opens a story after the index has closed (interview Q4).
- artifacts: every page under docs/artifacts at any depth plus every story's mock, each with its kind and story; private plans folders such as docs/plans stay out; the most useful first, which is system designs, plans and workflows above mocks, newest first in each (interview Q5).

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- A relayed-by field, the owner's quoted words or a `--relayed` option on owner actions (interview Q1 chose the simpler record).
- The board-sync commands from the production project's report: starting a queued story in one step, `codeloop bug`, blank fields on `card show`, and `card edit --description`. They are proposed as a sibling story so this one stays within eight tasks.
- Listing docs/plans or any folder outside docs/artifacts.
- Keeping the index open forever.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- Approve with conditions records some answers, then refuses on one with no recommendation, and leaves the story half-answered (uc-362-01).
- A waived finding disappears from the story, so nobody can see a known defect was accepted (uc-362-02).
- The first story opened after an idle spell stays blank until the server fetch times out at 2 s (uc-362-03).
- A system design in a nested folder under docs/artifacts is missing from Artifacts (uc-362-04).
