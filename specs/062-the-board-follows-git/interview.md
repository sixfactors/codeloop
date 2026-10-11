## Q1 Scope: PR merged ends review, and merge reachable from `prodRef` means live. Is real deploy detection (Fly, Vercel) in, or only git reachability?
recommended: Git and GitHub PR only. Live = merge commit reachable from `prodRef` (a tag or branch in config). Fly/Vercel detection belongs to c-073.
answer: Git and GitHub PR only. Live = merge commit reachable from `prodRef` (a tag or branch in config). Fly/Vercel detection belongs to c-073.

## Q2 What fills `branch` and `pr` on the card: the agent at build start, a git hook, or reconcile matching `Feature: <id>` trailers?
recommended: Reconcile reads `Feature: <id>` commit trailers and the PR body; no hand-set field. `card start` names the branch `<type>/<id>-<slug>` so the match is there by construction.
answer: we need some local git branch script/hook for this? or should ask user if cant be found?

## Q3 Acceptance: what proves it?
recommended: Given a card at review with an open PR, when the PR merges and `codeloop run` or `watch` runs, then the card is at staging with an event `actor: github`; when the `prodRef` tag moves past that commit, the card is live with no human event in between.
answer: Given a card at review with an open PR, when the PR merges and `codeloop run` or `watch` runs, then the card is at staging with an event `actor: github`; when the `prodRef` tag moves past that commit, the card is live with no human event in between.

## Q4 Riskiest assumption: a GitHub merge counts as the reviewer's pr-gate approval. Accept that, or still require `codeloop approve`?
recommended: Merge is the approval; the merger's GitHub login is written as the gate actor. The prod gate stays human (`outward: true`).
answer: interesting question - we should have the acceptance criteria matching (criteria is created at the start of the card)

## Q5 Where does it run: `run`/`watch` polling via `gh`, a GitHub webhook into the hosted board, or both?
recommended: Polling via `gh pr view` in `run` and `watch`; a webhook is c-087/c-088 territory.
answer: Polling via `gh pr view` in `run` and `watch`; a webhook is c-087/c-088 territory.
