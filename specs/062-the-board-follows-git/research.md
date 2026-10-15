# c-062 research: The board follows git

## What exists

exists: build — no code reads a pull request or compares a card's commits against a prod ref to move the card. `grep -rn "gh pr\|gh api\|prodRef\|prod_ref\|mergedAt" src/` returns nothing; the only `github` hits are `src/commands/install.ts` (raw.githubusercontent download) and `src/lib/scaffold.ts` (writing `.github/workflows`). The engine moves a card only through `advanceCard` / `approveCard` in `src/lib/engine.ts`, where the pr gate (`build.yaml` review stage, `approver: reviewer`) and the prod gate (`approver: owner, outward: true`) wait for a person. Three pieces are already built and reusable: `storyCommits` in `src/lib/diff-budget.ts` finds a card's commits by `Feature:`/`Card:` trailer and marks each `merged` with `git merge-base --is-ancestor <sha> <trunk>`; `card.branch` and `mergeStory` in `src/lib/worktree.ts` know the story branch and fast-forward it into `git.trunk`; `src/lib/run.ts` already shells to git for `git.commit` / `git.tag` lane triggers. None of them changes a card's stage.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. Outside the wiki: Linear links an issue to a branch by the issue id in the branch name or a magic word ("Fixes ENG-123") in the PR, then moves it to In Progress on push and to Done (or a configured status) on merge, per team workflow settings. GitHub Projects has two built-in automations, "Merged pull requests" and "Closed pull requests", both of which set the item's status to Done. Neither tool knows "deployed"; both stop at merge.

## Options

- Poll in `codeloop run` and `watch`: for every card at the pr gate with a branch, call `gh pr view <branch> --json state,mergedAt,mergeCommit,mergedBy` and, on `MERGED`, write an approve event with `actor: github` naming the merger's login and advance to staging; for every card at staging or live-pending, run `git merge-base --is-ancestor <mergeCommit> <git.prod_ref>` and advance to live when it holds. Branch and PR are found by `card.branch` first, then by `Feature: <id>` trailers via `storyCommits`; no hand-set field. Chosen — matches interview Q1, Q3 and Q5 (polling, git and GitHub only, webhook is c-087/c-088), reuses `storyCommits` and the existing `gh` login on the founder's machine, and needs no server or secret.
- GitHub webhook into `codeloop serve` or the hosted board. Rejected — the board binds 127.0.0.1 with no login (`src/lib/server.ts`); a public endpoint and signature check are hosted-board work the interview assigned to c-087/c-088.
- Git-only, no `gh`: treat "branch merged into trunk" (`merge-base --is-ancestor`) as the pr-gate approval and skip the PR entirely. Rejected — it loses who merged (`mergedBy`) so the gate event would have no person behind it, and a local fast-forward by `card merge` would count as a reviewer approval. Kept as the fallback for the live step, where the prod ref is a git ref and `gh` is not needed.

## The pain, grounded

pain: after a PR merges and a tag ships, the founder still runs `codeloop approve` twice to tell the board what git already knows, so the board lags or gets skipped. Source: the card story on c-062 ("see the card move on its own, so that I never update status by hand"), `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (metric: human turns per shipped card, goal median under 4), and `build.yaml` lines 59-72 where both the pr and prod gates are person-approved with no git input.

## Risks

- A merge becomes a reviewer approval (interview Q4 accepted this). A self-merged PR by the author then passes the pr gate with no second person; the event must record `mergedBy` so the inbox can show it.
- `gh` may be missing or logged out on the machine running `run`; the stage must report "cannot ask GitHub" as skipped, not as a failed check, or the card gets a spurious fail event.
- The interview's Q2 answer is open: how a card learns its branch when it was not started with `card worktree`. Trailer matching via `storyCommits` covers commits; a PR with no `Feature:` trailer and a hand-named branch is found by nothing.
- `git.prod_ref` does not exist in `src/lib/config.ts` yet; only `git.trunk` does. A missing value must make the live step a no-op with a note, not an error on every run.
- The prod gate is `outward: true`. Interview Q4 keeps it human; the live step may only move a card whose prod gate was already approved, else it ships status for an unapproved outward step.
- Polling `gh pr view` per card per run costs an API call each; `run` on a busy board with many cards at review should batch with one `gh pr list --state merged --json headRefName,...` per run.

## Open questions for the interview

- Q2 remains unanswered as a decision: when neither `card.branch` nor a `Feature:` trailer finds the PR, should `run` ask the owner through the inbox or leave the card for `codeloop approve`?
- Q4's "acceptance criteria matching" is unclear: should merge-as-approval require the PR body to list the card's acceptance lines, or only that a PR exists for the card?
- What is the default `git.prod_ref` when config has none: the latest tag, a `prod` branch, or off?

## Sources

- source: src/lib/diff-budget.ts:77 — `storyCommits` already marks a card's commits merged via `merge-base --is-ancestor`; the live step reuses it
- source: src/lib/worktree.ts:112 — `mergeStory` knows `card.branch` and the trunk but is a local fast-forward, not a PR
- source: src/lib/engine.ts:725 — `approveCard` is the only path through a gate and refuses any role but the gate's approver; a `github` actor needs an engine entry point
- source: src/lib/health.ts:178 — `git.trunk` is the only git config key today; no prod ref
- source: .codeloop/lanes/build.yaml — pr gate (reviewer) at review and prod gate (owner, outward) at live, both person-approved
- source: specs/062-the-board-follows-git/interview.md — locked answers: git and GitHub only, poll via `gh pr view`, merge reachable from `prodRef` means live, webhook belongs to c-087/c-088
- source: .codeloop/wiki/initiatives/founder-ships-without-ceremony.md — metric: human turns per shipped card, goal median under 4
- source: https://cli.github.com/manual/gh_pr_view — `--json` exposes `state`, `mergedAt`, `mergeCommit`, `mergedBy`, `headRefName`: everything the poll needs
- source: https://linear.app/docs/github — Linear links by issue id in the branch name or a magic word in the PR, moves to Done on merge; no deploy state
- source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations — GitHub Projects' "Merged pull requests" automation sets status to Done; the bar is merge, not live

verdict: build

## Rubric

- R2 pass: `grep -rn "gh pr\|gh api\|prodRef\|prod_ref\|mergedAt" src/` returns no lines; `grep -rn "github" src/` hits only src/commands/install.ts and src/lib/scaffold.ts; the gate path is src/lib/engine.ts:725 `approveCard` with no git or GitHub input
- R5 pass: three options under `## Options`; polling in `run`/`watch` chosen per specs/062-the-board-follows-git/interview.md Q5, webhook rejected as c-087/c-088 work, git-only rejected for losing `mergedBy`
- R7 pass: `## Open questions for the interview` lists Q2's branch discovery, Q4's acceptance matching, and the `git.prod_ref` default, none answered here
