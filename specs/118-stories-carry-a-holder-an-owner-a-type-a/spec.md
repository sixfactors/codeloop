# c-118 spec: Stories carry a holder, an owner, a type and links

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can read who holds a story, who owns it, what type it is and what it blocks, so that nobody has to ask in chat who has it.

feature: story record carries its own people and links
initiative: wiki/initiatives/ui-rebuild.md
size: M
metric: no-data
done_when: npm test -- cards

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a story with a holder, when a founder opens its record, then the holder, the owner and the reviewer each show as a person or an agent.
- US2 Given a story with no holder, when it is shown, then the holder row reads Unassigned and the owner is still named.
- US3 Given a story of type bug or chore, when it is shown, then the type reads on the record and the board tile.
- US4 Given a story that blocks another, when either is shown, then each carries a typed link chip to the other.
- US5 Given a write with an unknown type, an unknown link type or a link to a missing story, then it is refused and the screen says which field.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: story-properties, story-links

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Editing holder or owner from the board; this card is the data and the read.
- The query bar and saved views over these fields.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- An old cards.json with none of the new fields fails to load.
- A link to a story that does not exist is stored and later renders as a dead chip.
- Two writers set holder at once and one is lost.
