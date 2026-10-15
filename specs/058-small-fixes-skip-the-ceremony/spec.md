# c-058 spec: Small fixes skip the ceremony

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can start a one-line fix and watch it go straight to build and verify, so that the pipeline matches the size of the work.

feature: right-sized-cards
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle time, trivial cards
done_when: bash scripts/e2e-trivial-ceremony.sh exits 0

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a card sized trivial via investigate or `card new --size trivial`, when I run `codeloop run`, then events show create → build → verify and no research.md or spec.md is written.
- US2 Given a trivial card on the board, when I open the board or its drawer at the local gate, then I see a trivial size badge, the card sits in Build, and the gate note says "size: trivial, skipped research/spec".
- US3 Given a trivial card whose diff exceeds 3 files or 50 lines, when verify runs, then the card is re-sized to S and parked at the spec gate.
- US4 Given a finished trivial card, when I run `codeloop stats`, then trivial cycle time is reported and under one hour for the dogfood card.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:
- board-with-size
- card-drawer-size

## Not building

- Splitting oversized cards into siblings, and epics (c-060).
- A separate hotfix or fast lane; one build lane sizes its own ceremony.
- Letting size S skip research/spec; S still means hours of real work.
- Changing the review (pr) or prod gates; trivial cards still pass verify, review and live.
- The full plan-files / deps `check diff` from c-068; this card only ships the trivial 3-file / 50-line cap.

## Failure modes

- An agent sizes an M card trivial to dodge the spec gate, and the diff cap does not re-size and re-park.
- Lane `when:` is only on research and spec, so interview and mock still run and the dogfood path is not create → build → verify.
- `check diff` is missing or soft, so an oversized "trivial" card ships without ceremony.
- Stats or dogfood look for empty research.md / spec.md instead of asserting those files are absent.
- The board still shows only S|M|L, so a trivial card looks like an S and the founder cannot tell ceremony was skipped.
