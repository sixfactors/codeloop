# c-132 spec: The building blocks show every state on one page

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a builder, I can open one page showing each building block in every state, so that screens are assembled from known pieces instead of hand-rolled.

feature: ui-design-system
initiative: people-and-agents-workplace
size: S
metric: no-data
done_when: codeloop check mock c-132 exits 0 and the blocks-gallery page shows all twelve blocks

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given the gallery page, when I open it, then each of the twelve blocks (key, status, holder, priority, proof meter, gate, question, link, property row, activity, query bar, doc block) has its own labelled section.
- US2 Given a block with several states, when I look at its section, then every state named in the design (section 4) is drawn side by side.
- US3 Given a block no shared component covers yet, when I read its section, then it is composed from ui primitives and the gap is named.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:
- blocks-gallery

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- The five composition patterns (row, tile, peek, record, doc) as gallery subjects.
- App shell or product screens (c-133 onward).
- New tokens or colours.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- A block is missing from the page, so a later screen hand-rolls it.
- A state is drawn that the design does not name, so screens copy an invented state.
