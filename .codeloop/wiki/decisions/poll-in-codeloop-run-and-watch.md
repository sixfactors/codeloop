---
title: Poll in codeloop run and watch
scope:
  - src/commands/install.ts
  - src/lib/scaffold.ts
  - src/lib/engine.ts
  - src/lib/diff-budget.ts
  - src/lib/worktree.ts
  - src/lib/run.ts
  - src/lib/server.ts
  - .codeloop/wiki/initiatives/founder-ships-without-ceremony.md
  - src/lib/config.ts
freq: 1
severity: warning
cards:
  - c-062
updated: 2026-10-14
---

## Options

- Poll in `codeloop run` and `watch`: for every card at the pr gate with a branch, call `gh pr view <branch> --json state,mergedAt,mergeCommit,mergedBy` and, on `MERGED`, write an approve event with `actor: github` naming the merger's login and advance to staging; for every card at staging or live-pending, run `git merge-base --is-ancestor <mergeCommit> <git.prod_ref>` and advance to live when it holds. Branch and PR are found by `card.branch` first, then by `Feature: <id>` trailers via `storyCommits`; no hand-set field. Chosen — matches interview Q1, Q3 and Q5 (polling, git and GitHub only, webhook is c-087/c-088), reuses `storyCommits` and the existing `gh` login on the founder's machine, and needs no server or secret.
- GitHub webhook into `codeloop serve` or the hosted board. Rejected — the board binds 127.0.0.1 with no login (`src/lib/server.ts`); a public endpoint and signature check are hosted-board work the interview assigned to c-087/c-088.
- Git-only, no `gh`: treat "branch merged into trunk" (`merge-base --is-ancestor`) as the pr-gate approval and skip the PR entirely. Rejected — it loses who merged (`mergedBy`) so the gate event would have no person behind it, and a local fast-forward by `card merge` would count as a reviewer approval. Kept as the fallback for the live step, where the prod ref is a git ref and `gh` is not needed.

## Why

after a PR merges and a tag ships, the founder still runs `codeloop approve` twice to tell the board what git already knows, so the board lags or gets skipped. Source: the card story on c-062 ("see the card move on its own, so that I never update status by hand"), `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (metric: human turns per shipped card, goal median under 4), and `build.yaml` lines 59-72 where both the pr and prod gates are person-approved with no git input.

## Consequences

Poll in `codeloop run` and `watch`: for every card at the pr gate with a branch, call `gh pr view <branch> --json state,mergedAt,mergeCommit,mergedBy` and, on `MERGED`, write an approve event with `actor: github` naming the merger's login and advance to staging; for every card at staging or live-pending, run `git merge-base --is-ancestor <mergeCommit> <git.prod_ref>` and advance to live when it holds. Branch and PR are found by `card.branch` first, then by `Feature: <id>` trailers via `storyCommits`; no hand-set field. — matches interview Q1, Q3 and Q5 (polling, git and GitHub only, webhook is c-087/c-088), reuses `storyCommits` and the existing `gh` login on the founder's machine, and needs no server or secret. The other options are not built; reopening one is a new decision.
