# c-370 spec: Codeloop's own board carries its review verdicts, re-checks and dotfolder layout

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can open codeloop's own board and see every story where its work really is, so that the board never lies about what is done.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `codeloop card show c-097`, `c-098` and `c-102` each show a review verdict, and `codeloop projects prune` lists no dead entry

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given the fix round's leftovers, when the round is done, then c-097, c-098 and c-102 carry review verdicts, c-120, c-126, c-140 and c-152 are where the review pass puts them, the dead hub registry entries are gone, and the dotfolder move has run or the hand-back says why not.
- US2 Given a story split into others, when the board shows it, then it reads "split into <ids>" instead of done, and it counts in no shipped number.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Decisions

<!-- The interview answers, folded in. -->
- (c-369) trunk: a commit is merged when the local trunk or its remote-tracking branch reaches it; the remote is the trunk's configured upstream, else origin (interview Q1).
- (c-369) linking: a Card or Feature trailer wins; the activity record links only a commit with no trailer (interview Q2).
- dotfolder move: run last, in its own commit, only once `git status` shows nothing untracked under specs/; otherwise left and named in the hand-back (interview Q3).
- re-check: `codeloop orch run --review --dry-run` after the trunk fix decides c-120, c-126, c-140 and c-152; a story it cannot tell about stays, with the reason on the story (interview Q4).
- (c-369) proof: a review-pass test with the local main behind and the merge only on origin/main, seen to leave the story in place on the old code (interview Q5).

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- The trunk and linking fix: c-369.
- Moving the dotfolder layout while other sessions have untracked files under specs/.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- A story whose work shipped stays short of done on codeloop's own board (uc-370-01).
- A split parent shows as done and counts as shipped while nothing shipped (uc-370-02).
