# c-308 spec: A stuck story says why in plain words and which action will move it

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can open a stuck story and read whether any work was tried, what already shipped under its id, and which action changes the outcome, so that I never approve a retry that will fail the same way.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npm test -- src/lib/__tests__/stuck-explanation.test.ts` exits 0, and a stuck story at http://localhost:4040/p/codeloop/cards/c-136/ says whether work was tried, what shipped and which action moves it

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a stuck story, when the founder opens it, then the summary's "what you must do" line says in plain words whether any work was tried at this step, what already shipped under the story, and which action will change the outcome.
- US2 Given a stuck story, when its page opens, then it offers a button to move it to the step its shipped work shows (stopping before anything the founder approves) when there is shipped work, a button to let an agent try once more only when something changed since the last try, and any other action in words.
- US3 Given the check itself broke, when the founder opens the story, then it says the check broke rather than the work, names the step and when, offers to try again once it is fixed, and keeps the raw error folded under "Show the error".
- US4 Given a later try at the same step has passed, when the founder opens the inbox, then the earlier failure is gone from the failing list and stays in the story's history.
- US5 Given one stuck story, when it is read on its page, in the inbox and from `codeloop card show`, then all three give the same explanation.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:
- stuck-story
- inbox-failing

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Answers folded in

- Q1 (two buttons, the rest in words): US2.
- Q2 (a failure leaves the inbox once a later try passes, kept in history): US4.
- Q3 (a broken check says so, names step and time, raw error folded): US3.
- Q4 (the explanation is the summary's "what you must do" line): US1.

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Moving or closing stories without the founder; the orchestrator's review pass does that.
- The summary card itself; it is built by its own story, and this story fills its "what you must do" line for a stuck story (Q4).
- Buttons for any action beyond the two in US2 (Q1).
- Changing how failures are counted toward the retry limit.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- "Try once more" is offered when nothing changed, and the retry fails the same way (uc-308-01).
- The move button carries a story past an approval it never had (uc-308-02).
- A broken check's last error line is shown as the reason, as with "Node.js v26.4.0" (uc-308-03).
- The inbox keeps a failure after a later try at the same step passed (uc-308-04).
- The page, the inbox and the command line give different explanations (uc-308-05).
- Docs-only or mock-only commits count as shipped work and point the move button at the wrong step (uc-308-06).
- The explanation names no action, leaving the founder with nothing to do (uc-308-07).
