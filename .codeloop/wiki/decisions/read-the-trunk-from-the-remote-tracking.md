---
title: Read the trunk from the remote-tracking branch too, so a PR merged on
scope:
  - .codeloop/config.yaml
  - src/lib/commit-graph.ts
  - src/lib/diff-budget.ts
  - src/lib/review-pass.ts
  - evidence/097/review.md
freq: 1
severity: warning
cards:
  - c-367
updated: 2026-10-17
---

## Options

- Read the trunk from the remote-tracking branch too (`refs/remotes/<remote>/<trunk>`), so a PR merged on GitHub reads as merged after a fetch; turn `doctor.review: on` for codeloop's own board; and link a commit to a story from the post-commit activity record as well as from a `Card:`/`Feature:` trailer, so commits made without a trailer still count. Chosen. Touches `src/lib/commit-graph.ts`, `src/lib/diff-budget.ts`, `src/lib/review-pass.ts`, `.codeloop/config.yaml`.
- Refuse a commit with no `Card:` trailer in the commit-msg hook. Rejected: this repo is public and its commit bodies carry no card ids, and a merge made on GitHub never runs a local hook.
- Fast-forward the local `main` from `origin/main` inside the doctor tick. Rejected: it writes a branch the person may have checked out or diverged, and a tick should not move refs.

## Why

the owner cannot trust the board: 12 stories whose work had merged (c-301, c-302, c-307 to c-315, c-317) sat short of done until they were closed by hand on 2026-10-17, and c-097 still shows review with `evidence/097/review.md` missing although its verify passed at e55ff3b. Source: c-367's own note and `codeloop card show c-097`; `codeloop orch run --review --dry-run` in this repo prints "trunk main is 199 commits behind HEAD; merged work may read as unmerged" and fixes nothing.

## Consequences

Read the trunk from the remote-tracking branch too (`refs/remotes/<remote>/<trunk>`), so a PR merged on GitHub reads as merged after a fetch; turn `doctor.review: on` for codeloop's own board; and link a commit to a story from the post-commit activity record as well as from a `Card:`/`Feature:` trailer, so commits made without a trailer still count. Touches `src/lib/commit-graph.ts`, `src/lib/diff-budget.ts`, `src/lib/review-pass.ts`, `.codeloop/config.yaml`. The other options are not built; reopening one is a new decision.
