# {{id}} spec: {{title}}

Story: as a <who> I can <what>, so that <why>.

<!-- One line per acceptance criterion, numbered US1..US5. More than five means the card is too big: split it. -->
acceptance:
- US1 Given <state>, when <action>, then <result>.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
