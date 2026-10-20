## Q1 Boundary: which branch counts as the trunk when the local main and the remote's main differ?
options:
- A: Both: a commit is merged when either the local trunk or its remote-tracking branch (the trunk's upstream, else origin) reaches it
- B: Only the remote-tracking branch, ignoring the local trunk
- C: Only the local trunk, as today, and tell people to pull
recommended: A
answer: Both: a commit is merged when either the local trunk or its remote-tracking branch (the trunk's upstream, else origin) reaches it

## Q2 Risk: a commit with no trailer is linked to the story that was active when it was made; what happens when a commit's trailer names one story and the activity record another?
options:
- A: The trailer wins; the activity record links only commits with no trailer
- B: Both stories get the commit
- C: Link by trailer only, as today
recommended: A
answer: The trailer wins; the activity record links only commits with no trailer

## Q3 Scope: does this story also run the dotfolder move for codeloop's own repo, while other sessions have untracked files under specs/?
options:
- A: Run it last, in its own commit, only once `git status` shows nothing untracked under specs/; otherwise leave it and say so in the hand-back
- B: Run it now with the untracked files moved along
- C: Leave it to its own story
recommended: A
answer: Run it last, in its own commit, only once `git status` shows nothing untracked under specs/; otherwise leave it and say so in the hand-back

## Q4 Scope: what does "re-check c-120, c-126, c-140 and c-152" decide for each?
recommended: Run `codeloop orch run --review --dry-run` after the trunk fix and apply what it says for each (close, place or ask); a story it cannot tell about stays where it is, with the reason on the story.
answer: Run `codeloop orch run --review --dry-run` after the trunk fix and apply what it says for each (close, place or ask); a story it cannot tell about stays where it is, with the reason on the story.

## Q5 Acceptance: what proves the board moves a story when its work ships?
recommended: A test through the real review pass: a repo whose local main is behind, with a merged commit on origin/main for a story at build, gets the story placed or closed; on the old code it stays put. Then on codeloop's own board `codeloop orch run --review --dry-run` no longer prints the "behind HEAD" warning.
answer: A test through the real review pass: a repo whose local main is behind, with a merged commit on origin/main for a story at build, gets the story placed or closed; on the old code it stays put. Then on codeloop's own board `codeloop orch run --review --dry-run` no longer prints the "behind HEAD" warning.

## Rubric

- I2 pass: Q1 boundary, Q2 risk, Q3 scope, Q4 scope, Q5 acceptance, each named in its own `## Qn` heading in this file
- I4 pass: research.md R7 (1) is Q1, (2) is Q2, (3) is Q3, (4) is Q4 (specs/367-the-board-moves-a-story-when-its-work-sh/research.md, `## Rubric` R7 line)
- I6 pass: each answer is a line under `## Decisions` in specs/367-the-board-moves-a-story-when-its-work-sh/spec.md:24 (trunk:, linking:, dotfolder move:, re-check:, proof:), and Q5 is also acceptance US1 and done_when
