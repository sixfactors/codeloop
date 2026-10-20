# c-367 plan: The board moves a story when its work ships, so shipped work never looks unfinished

## Layers touched

api (commit graph, merged reads, config), test (review pass), docs (evidence, changelog, board housekeeping).

## Files

- `src/lib/commit-graph.ts`: keep `refs/remotes/` tips beside `refs/heads/`; link trailer-less commits from activity commit records.
- `src/lib/diff-budget.ts`: `storyCommits` and `trunkState` read merged as reachable from the local trunk or its remote-tracking branch.
- `.codeloop/config.yaml`: `doctor.review: on`.
- `src/lib/__tests__/review-pass.test.ts`: the two failure modes through `reviewPass`.

## Risks

- A remote-tracking ref that was never fetched reads the same as today; nothing new is guessed.
- The activity link trusts the active story at commit time, so the trailer wins whenever present.
