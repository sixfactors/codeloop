# c-365 spec: The lane limit, small-story carry and batches behave the same on every path

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a <persona>, I can <what>, so that <pain relieved>.

feature: <capability this card is a slice of>
initiative: <wiki/initiatives/<slug>.md>
size: S | M | L          <!-- L cannot pass the spec gate unsplit; split with `codeloop card split` -->
metric: <the one stage metric this card moves; no-data means instrument first>
done_when: <a command that exits 0, or a screen a person opens. Never "all stories complete">

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given <state>, when <action>, then <result>.

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
