# c-322 spec: A team shares one hosted board through Protobox

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a team, I can share one board across machines with sign-in, so that a team works one board from anywhere.

feature: hosted-board
initiative: <wiki/initiatives/<slug>.md>
size: M
metric: <the one stage metric this card moves; no-data means instrument first>
done_when: <a command that exits 0, or a screen a person opens. Never "all stories complete">

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given <state>, when <action>, then <result>.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:
- team-home
- agents
- story-page
- people-and-roles
- plans
- connect-project
- public-view

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
-

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
-
