# Build rubric: c-369

## Rubric
- B2 pass: src/lib/__tests__/review-pass.test.ts with src/lib/commit-graph.ts and src/lib/diff-budget.ts at 84571ae^^ (b0fe8ff): "Tests 2 failed | 18 passed (20)", uc-369-01 and uc-369-02 each "expected 'review' to be 'done'"; with the fix "Tests 20 passed (20)"; tsc --noEmit clean.
- B5 pass: `codeloop wiki inject --files src/lib/commit-graph.ts src/lib/diff-budget.ts` returned the decisions "Read the trunk from the remote-tracking branch too" (this story's own, followed) and "Poll in codeloop run and watch" (reuses storyCommits; this change widens what storyCommits reads and leaves its shape alone); no gotcha matched.

read: .codeloop/wiki/decisions/read-the-trunk-from-the-remote-tracking.md
read: .codeloop/wiki/decisions/poll-in-codeloop-run-and-watch.md
