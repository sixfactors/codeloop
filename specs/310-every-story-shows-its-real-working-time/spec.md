# c-310 spec: Every story shows its real working time and finds its own spec

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can see time working that matches the hand-backs and a spec page that is the one the builder wrote, so that the board's numbers can be trusted.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: S
metric: cycle_time_days
done_when: `npx vitest run src/lib/__tests__/working-time.test.ts src/lib/__tests__/spec-folder-repair.test.ts` exits 0

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given an agent run recorded once with its duration, or a single edit, when the card shows its phase time, then working counts the run's minutes and at least a minute per edit.
- US2 Given a card whose spec field names a missing folder and one numbered folder exists, when any command resolves its spec, then it uses that folder and the card's field is repaired.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Renaming spec folders already on disk; a missing field is repaired to the folder that exists.
- Repairing a spec field when more than one folder carries the story's number; the field is left as it is.
- Changing how idle gaps between a person's edits are counted, beyond a lone edit counting a minute.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- A headless agent run reads working 0m because its activity line has no duration (working-time.test.ts).
- A single edit with no neighbour within ten minutes counts zero (working-time.test.ts).
- An agent run and the edits it made inside its span are counted twice (working-time.test.ts).
- A card whose spec field names a missing folder shows an empty spec page while the builder's folder sits beside it (spec-folder-repair.test.ts).
