## Q1 Scope: A14 bundles replay, `run --due` ignoring pre-existing tags, and `adopt` merging. Just replay here?
recommended: Replay is the story; the `--due` tag fix and `adopt` merge are plumbing tasks under it, not acceptance lines.
answer: 

## Q2 Replay mechanics: a temp worktree per finished card at its SHA, running only the changed stages' done-checks? All cards or the last N?
recommended: Last five live cards, one worktree per SHA, only the changed stages' `done:` commands; gated stages are skipped.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given build.yaml with a new done-check, when `lane check build`, then it reports pass/fail per replayed card at its SHA, and `lane promote` refuses when two of five fail.
answer: 

## Q4 Riskiest assumption: old SHAs do not build any more (deps moved). Pass, fail or unknown?
recommended: `unknown`, never pass; promotion needs at least three known passes.
answer: 

## Q5 Where do replay results live?
recommended: `evidence/lanes/build-v2-replay.md`, linked from the lane's wiki page.
answer: 
