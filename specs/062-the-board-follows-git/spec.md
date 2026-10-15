# c-062 spec: The board follows git

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a <persona>, I can <what>, so that <pain relieved>.

feature: <capability this card is a slice of>
initiative: <wiki/initiatives/<slug>.md>
size: S | M | L          <!-- L cannot pass the spec gate unsplit; split with `codeloop card split` -->
metric: <the one stage metric this card moves; no-data means instrument first>
done_when: codeloop verify c-062   <!-- interview Q1: git and GitHub only; nothing here needs Fly or Vercel -->

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a card at review with an open PR, when the PR merges and `codeloop run` or `watch` runs, then the card is at staging with an approve event `actor: github` naming the merger. (interview Q3)
- US2 Given a card at staging whose prod gate is approved, when the `prodRef` tag or branch moves past the merge commit and `run` runs, then the card is live with no human event in between. (interview Q3)
- US3 Given a PR opened by `card pr` whose body lists the card's acceptance lines as checkboxes, when it merges with every box ticked, then the merge counts as the pr-gate approval and the event records `mergedBy`. (interview Q4)

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Real deploy detection on Fly or Vercel. Live means the merge commit is reachable from `git.prod_ref`; deploy checks are c-073. (interview Q1)
- A GitHub webhook. The board polls `gh pr view` from `run` and `watch`; a webhook into the hosted board is c-087/c-088. (interview Q5)
- A default for `git.prod_ref`. It is set in config or the live step does nothing and `run` prints one note naming the key. (interview, settled from research.md:37)
- A GitHub search for the PR and a required `pr:` field on the card. The PR is found by `card.branch` or a `Feature:` trailer, and `card worktree` puts the card id in the branch name so the commit-msg hook adds the trailer. (interview Q2)
- A CI status check before merge counts. The acceptance checkboxes in the PR body are the bar; a `codeloop verify` status check is c-073. (interview Q4)

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- No PR found for the card by `card.branch` or a `Feature:` trailer: the card stays at the pr gate and the inbox line says "no PR found; approve by hand or `codeloop card set c-062 branch <name>`". `run` never guesses. (interview Q2)
- The PR merged with an acceptance box unticked: the card stays at the pr gate and the inbox names the unticked lines; no approve event is written. (interview Q4)
- A self-merged PR: it passes the gate, and the event's `mergedBy` is the author, so the inbox shows there was no second person. (research.md:26)
- `gh` missing or logged out on the machine running `run`: the poll is reported as skipped, not as a failed check, so no fail event lands on the card. (research.md:27)
