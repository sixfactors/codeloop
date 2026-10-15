# c-062 interview: The board follows git

Q1, Q3 and Q5 were answered by the owner in the first round and are kept as written. Q2 and Q4 were
answered with a question back ("script/hook, or ask the user?") and a direction ("acceptance
criteria matching") that research.md:35-36 could not build from, so they carry options here. The
answer line on each holds the owner's round-one words and the option they map to; the owner
overrides with `codeloop answer c-062 2 --option B` (or `4`) if the mapping is wrong. Each question
names the research line it builds on.

## Q1 Scope: PR merged ends review, and merge reachable from `prodRef` means live. Is real deploy detection (Fly, Vercel) in, or only git reachability?
builds on: research.md:16 (chosen option: git and GitHub only)
recommended: Git and GitHub PR only. Live = merge commit reachable from `prodRef` (a tag or branch in config). Fly/Vercel detection belongs to c-073.
answer: Git and GitHub PR only. Live = merge commit reachable from `prodRef` (a tag or branch in config). Fly/Vercel detection belongs to c-073.

## Q2 Risk: when neither `card.branch` nor a `Feature: c-062` trailer finds the PR, what does `run` do? (Owner, round one: a local branch script or hook, or ask the user when it cannot be found.)
builds on: research.md:28 and research.md:35; the hook in templates/hooks/commit-msg:5 adds the trailer only when the branch name carries a card id, and src/lib/worktree.ts:88 names worktree branches `feat/<scope>-<slug>` with no id, so a hand-named branch with no id is found by nothing today
options:
- A: Leave the card at the pr gate, as today, and have the inbox line for it say "no PR found; approve by hand or name the branch with `codeloop card set c-062 branch <name>`". Also put the card id in the branch name `card worktree` makes, so the existing hook adds the trailer on every story branch. No new GitHub search.
- B: As A, plus `run` searches GitHub once with `gh pr list --search c-062` over open PR titles, bodies and branch names before giving up, the way Linear matches an issue id.
- C: Add a required `pr:` field the agent must write at build start; `run` never guesses.
recommended: A
answer: A. Owner, round one: "a local git branch script/hook for this, or ask the user if it can't be found" — both halves of A: the commit-msg hook adds the trailer because `card worktree` puts the card id in the branch name, and when nothing finds a PR the card stays at the pr gate with an inbox line asking the owner to approve by hand or set the branch. No GitHub search (B) and no required `pr:` field (C).

## Q3 Acceptance: what proves it?
builds on: research.md:16 (poll in `run` and `watch`, merge becomes the pr-gate approval with `actor: github`)
recommended: Given a card at review with an open PR, when the PR merges and `codeloop run` or `watch` runs, then the card is at staging with an event `actor: github`; when the `prodRef` tag moves past that commit, the card is live with no human event in between.
answer: Given a card at review with an open PR, when the PR merges and `codeloop run` or `watch` runs, then the card is at staging with an event `actor: github`; when the `prodRef` tag moves past that commit, the card is live with no human event in between.

## Q4 Risk: a GitHub merge becomes the reviewer's pr-gate approval. What must the merged PR carry before the board counts it? (Owner, round one: acceptance criteria matching, since the criteria exist from the start of the card.)
builds on: research.md:26 (a self-merge passes the gate with no second person) and research.md:36 (what "acceptance criteria matching" requires is undecided)
options:
- A: Only that a merged PR exists for the card. The acceptance lines are proven by `codeloop verify` at the next stage, not at the gate.
- B: The PR body carries the card's acceptance lines from spec.md as checkboxes (`- [x] US1 ...`), written in by `card pr` when the PR opens. Merge counts as approval only when every line is ticked; otherwise the card stays at the gate and the inbox names the unticked lines. The event records `mergedBy`.
- C: As B, and the PR must also have a green `codeloop verify c-062` status check from CI before merge counts.
recommended: B
answer: B. Owner, round one: "we should have the acceptance criteria matching (criteria is created at the start of the card)" — the criteria are spec.md's acceptance lines, so `card pr` writes them into the PR body as checkboxes and merge counts as the pr-gate approval only when every box is ticked; the event records `mergedBy`. Not C: a CI status check is c-073 territory and the owner did not ask for it.

## Q5 Boundary: where does it run: `run`/`watch` polling via `gh`, a GitHub webhook into the hosted board, or both?
builds on: research.md:16-17 (polling chosen; webhook rejected as hosted-board work)
recommended: Polling via `gh pr view` in `run` and `watch`; a webhook is c-087/c-088 territory.
answer: Polling via `gh pr view` in `run` and `watch`; a webhook is c-087/c-088 territory.

## Settled from research

- research.md:37, the default for `git.prod_ref` when config has none: settled, not asked. Q1's accepted answer says `prodRef` is "a tag or branch in config", so there is no default. Absent, the live step does nothing and `run` prints one note naming the key (research.md:29). Lands in spec.md `## Not building`.

## Folded into spec.md

| Question | spec.md field | State |
|---|---|---|
| Q1 | `## Not building` (Fly/Vercel detection, c-073) and `done_when` | folded |
| Q3 | `acceptance:` US1 and US2 | folded |
| Q5 | `## Not building` (webhook, c-087/c-088) | folded |
| Q2 | `## Failure modes` first item (no PR found: card stays at the gate, inbox names the fix) and `## Not building` (no GitHub search, no `pr:` field) | folded |
| Q4 | `acceptance:` US3 (ticked acceptance checkboxes in the PR body) and `## Failure modes` second item (unticked box: card stays at the gate) | folded |

## Rubric

- I2 pass: `grep -c '^## Q[0-9] \(Scope\|Acceptance\|Risk\|Boundary\):' specs/062-the-board-follows-git/interview.md` prints 5; one tag per question, none from outside the four
- I4 pass: research.md:35 is Q2, research.md:36 is Q4, research.md:37 is settled under `## Settled from research` with the reason taken from Q1's accepted answer
- I6 pass: specs/062-the-board-follows-git/spec.md `acceptance:` carries Q3 as US1 and US2 and Q4 as US3, `## Not building` carries Q1, Q5 and Q2, and `## Failure modes` carries Q2 and Q4; `grep -c 'interview Q' specs/062-the-board-follows-git/spec.md` prints at least 8
