# {{id}} spec: {{title}}

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

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
-

## Failure modes

<!-- The ways this can break in production. One use case per item in the test-design stage. -->
-

---

# {{id}} tasks: {{title}}

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->
