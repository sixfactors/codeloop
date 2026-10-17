# c-310 spec: Every story shows its real working time and finds its own spec

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a <persona>, I can <what>, so that <pain relieved>.

feature: <capability this card is a slice of>
initiative: <wiki/initiatives/<slug>.md>
size: S | M | L          <!-- L cannot pass the spec gate unsplit; split with `codeloop card split` -->
metric: <the one stage metric this card moves; no-data means instrument first>
done_when: <a command that exits 0, or a screen a person opens. Never "all stories complete">

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given an agent run recorded once with its duration, or a single edit, when the card shows its phase time, then working counts the run's minutes and at least a minute per edit.
- US2 Given a card whose spec field names a missing folder and one numbered folder exists, when any command resolves its spec, then it uses that folder and the card's field is repaired.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
-

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
-
