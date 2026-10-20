# c-367 research: The board moves a story when its work ships, so shipped work never looks unfinished

## What exists

<!-- Unlock before build. One line: exists: have | unlock | port | build, with a path or URL when it is not build. have = shipped and exposed, close the card. unlock = built but not exposed, expose it. port = in a sibling repo. -->
exists: unlock, src/lib/review-pass.ts already places and closes a story from its merged commits, but it is off unless `doctor.review: on` (src/lib/run.ts:490), codeloop's own `.codeloop/config.yaml` has no `doctor` key, and it reads "merged" only from the local `main` branch (src/lib/commit-graph.ts:128 keeps `refs/heads/` tips only), which in this checkout is 199 commits behind HEAD while `origin/main` is current.

The other parts of the round are already built and only need running: `codeloop store move --layout dotfolder` (src/lib/layout-move.ts) for the legacy layout warning, `codeloop projects prune --write` (src/lib/hub-registry.ts) for the dead registry entries, and the review skill for the c-097, c-098 and c-102 verdicts.

## How others show it

<!-- One row per competitor that has a page in .codeloop/wiki/competitors/, its name in the first cell. The row is copied to that page when this stage passes. -->
| Competitor | How they show it | Source |
|---|---|---|
| BMAD | A story's status lives in its plan file; a build stops at `built` and the user or orchestrator marks it `done` by hand. Code review appends a block and never changes the status, and nothing reads git to move it | https://docs.bmad-method.org/plan/break-work-into-stories-and-track-it/ |
| Kiro | Tasks in a spec show in-progress and completed as the agent works them inside the editor; the docs name no link from a commit or a merge to a task's status | https://kiro.dev/docs/specs/ |
| Spec Kit | `/speckit.implement` tells the agent to tick each finished task `[X]` in tasks.md; progress is what the agent ticked, and nothing ties a task to a commit or a merge | https://github.com/github/spec-kit/blob/main/templates/commands/implement.md |

## Options

- Read the trunk from the remote-tracking branch too (`refs/remotes/<remote>/<trunk>`), so a PR merged on GitHub reads as merged after a fetch; turn `doctor.review: on` for codeloop's own board; and link a commit to a story from the post-commit activity record as well as from a `Card:`/`Feature:` trailer, so commits made without a trailer still count. Chosen. Touches `src/lib/commit-graph.ts`, `src/lib/diff-budget.ts`, `src/lib/review-pass.ts`, `.codeloop/config.yaml`.
- Refuse a commit with no `Card:` trailer in the commit-msg hook. Rejected: this repo is public and its commit bodies carry no card ids, and a merge made on GitHub never runs a local hook.
- Fast-forward the local `main` from `origin/main` inside the doctor tick. Rejected: it writes a branch the person may have checked out or diverged, and a tick should not move refs.

## The pain, grounded

pain: the owner cannot trust the board: 12 stories whose work had merged (c-301, c-302, c-307 to c-315, c-317) sat short of done until they were closed by hand on 2026-10-17, and c-097 still shows review with `evidence/097/review.md` missing although its verify passed at e55ff3b. Source: c-367's own note and `codeloop card show c-097`; `codeloop orch run --review --dry-run` in this repo prints "trunk main is 199 commits behind HEAD; merged work may read as unmerged" and fixes nothing.

## Risks

- A remote-tracking trunk that is itself stale (no fetch) reads the same as today; the pass should say when the remote ref is older than the local one, not guess.
- Linking by activity record trusts the active-story pointer at commit time; a commit made while the wrong story was active would move that story. The trailer, when present, should win.
- Turning the pass on for codeloop's own board lets it close stories in a tick; a wrong close is undone with `codeloop card reopen`, but it needs one dry run first.
- The dotfolder move renames specs/, evidence/ and shape/ while other sessions have untracked files under specs/; the move has to wait until those are committed or be run with them in place.

## Sources

<!-- At least three, one per line: a dash, the word source and a colon, a URL or a path in this repo (optionally path:line), a dash, a note. `codeloop check research` counts them; a path counts only when the file exists. -->
- source: src/lib/review-pass.ts - settles that place and close from merged work already exist; this is unlock, not build
- source: src/lib/run.ts:490 - settles that the pass runs only when `doctor.review` is on, and codeloop's config does not set it
- source: src/lib/commit-graph.ts:128 - settles that trunk tips come only from `refs/heads/`, so a merge on GitHub is invisible until local main is updated
- source: src/lib/layout-move.ts - settles that the dotfolder move is a command to run, not code to write
- source: https://docs.bmad-method.org/plan/break-work-into-stories-and-track-it/ - BMAD leaves `done` to a person, so moving on merge is ahead of it
- source: https://github.com/github/spec-kit/blob/main/templates/commands/implement.md - Spec Kit's progress is what the agent ticked, with no merge link

## Rubric

- R2 pass: `grep -rn "remotes" src/lib/*.ts` finds nothing, and `grep -n "refs/heads" src/lib/commit-graph.ts` shows line 128 as the only trunk source; `grep -n doctor .codeloop/config.yaml` finds nothing
- R5 pass: three options under `## Options`, the remote-tracking trunk chosen; the trailer-only hook loses because merges on GitHub run no hook, the fast-forward loses because a tick must not move refs
- R7 pass: open questions for the interview: (1) which remote counts as the trunk's, `origin` only or the branch's upstream; (2) should the activity-record link apply when a trailer names a different story; (3) run the dotfolder move now or after the untracked specs/ files are committed; (4) what "re-check c-120 c-126 c-140 c-152" should decide for each: close, place or leave

verdict: build
