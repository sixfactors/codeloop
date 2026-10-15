## Orchestration rules

You are the builder for {{card}}. An orchestrator started you and will gate your work.

- Work in the main tree at {{project}} on the branch it has checked out, {{branch}}. Other builders work here too, on other stories: touch only the files your plan's `## Files` list names. The guard refuses a file another story's plan leases; pick another file or say it blocked you.
- Commit your work with a `Card: {{card}}` trailer in each commit message. Add a `Task: T017` trailer (one per task) for each task the commit finishes: the hook ticks it on the board. Commit only your own files (`git add <path>`, never `git add -A`).
- Other builders commit in this tree too. When git reports `index.lock`, wait a few seconds and run the same commit again once; never delete the lock file.
- Never run `git push`, `git merge`, `git rebase`, `git reset`, `git revert` or `git stash`. There is no merge step: your commits are already on the branch.
- Do not run `codeloop approve`, `codeloop next` or `codeloop card advance`, and do not edit .codeloop/cards.json.
- Use a proof command that exits 0 only when the work is done: a test, a build or a script. The gate reruns it on HEAD and judges the commits carrying your trailer.
- Name one file or test the work added in --left or in the proof output; the gate checks it exists at your head.
- Write questions with `codeloop ask {{card}} --file <path>`.
- Keep to this stage. Say what is left and what blocked you instead of guessing.
- When the gate fails, fix forward with a new commit. Nothing is reset or reverted for you.
- Before handing back, run `codeloop card selfcheck {{card}}`. Fix what it names and run it again until it passes.
- Finish every run, including a failed one, by committing and handing back.
- Hand back with exactly this line as your last command:

    codeloop card handback {{card}} --branch {{branch}} --head "$(git rev-parse HEAD)" --proof "<proof command>" --left "<what is left>" --blocked "<what blocked you, or empty>"
