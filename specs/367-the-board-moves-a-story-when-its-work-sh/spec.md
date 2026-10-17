# c-367 spec: The board moves a story when its work ships, so shipped work never looks unfinished

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can trust every story's step on the board because the review pass moves a story when its work merges, so that shipped work never sits on the board looking unfinished.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npx vitest run src/lib/__tests__/review-pass.test.ts` exits 0 and `codeloop orch run --review --dry-run` in this repo prints no "behind HEAD" warning

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a story at build whose commit is merged on origin/main while the local main is behind, when the review pass runs, then the story is placed or closed with that commit as its evidence.
- US2 Given a commit with no Card or Feature trailer that the post-commit hook recorded on a story's activity, when the review pass runs, then the commit counts as that story's work, and a commit whose trailer names another story counts only for the story its trailer names.
- US3 Given codeloop's own board, when the doctor tick runs, then the review pass runs with it, and `codeloop orch run --review --dry-run` no longer warns that main is behind HEAD.
- US4 Given the fix round's leftovers, when the round is done, then c-097, c-098 and c-102 carry review verdicts, c-120, c-126, c-140 and c-152 are where the review pass puts them, the dead hub registry entries are gone, and the dotfolder move has run or the hand-back says why not.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Decisions

<!-- The interview answers, folded in. -->
- trunk: a commit is merged when the local trunk or its remote-tracking branch reaches it; the remote is the trunk's configured upstream, else origin (interview Q1).
- linking: a Card or Feature trailer wins; the activity record links only a commit with no trailer (interview Q2).
- dotfolder move: run last, in its own commit, only once `git status` shows nothing untracked under specs/; otherwise left and named in the hand-back (interview Q3).
- re-check: `codeloop orch run --review --dry-run` after the trunk fix decides c-120, c-126, c-140 and c-152; a story it cannot tell about stays, with the reason on the story (interview Q4).
- proof: a review-pass test with the local main behind and the merge only on origin/main, seen to leave the story in place on the old code (interview Q5).

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Fetching from the remote or moving any local branch; the pass reads refs as they are.
- A commit-msg rule that refuses commits without a trailer.
- Moving the dotfolder layout while other sessions have untracked files under specs/.

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- A PR merged on GitHub leaves its story short of done because only the local main is read (uc-367-01).
- A commit made without a trailer never moves its story (uc-367-02).
- An activity record names the wrong story and a commit with a trailer moves both (uc-367-02).
- The review pass stays off for codeloop's own board, so nothing moves between manual runs (uc-367-03).
