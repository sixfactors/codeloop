# c-302 spec: A trivial story that grows still parks at the first gate

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can start a small fix as trivial and trust that if it grows it stops at the first gate it skipped, so that a big change never reaches me already built and unreviewed.

feature: right-sized-cards
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npm test -- src/lib/__tests__/trivial-ceremony.test.ts` exits 0

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a trivial story on the shipped build lane, when its diff outgrows the trivial cap, then it is re-sized to M and parks at the spec gate for the owner.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Splitting the grown story automatically; the owner splits it at the spec gate.
- Changing the trivial or S diff budgets.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- A grown trivial story is re-sized to S, which on the shipped lane runs no gate, and goes straight on unreviewed (uc-302-01).
