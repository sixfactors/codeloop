## Q1 Scope: verdict per finding in review.md; `defer` writes a backlog card; does `unnecessary` mean the agent deletes the code in the same card?
recommended: Yes: `unnecessary` removes the code before the pr gate; `defer` creates a backlog card tagged `from: <id> review`; `fix now` appends a task to tasks.md.
answer: 

## Q2 Who sets the verdict: the review agent proposes and the human reviewer confirms at the pr gate?
recommended: Agent proposes; `approve` at the pr gate accepts them all; `reject` with a note flips one.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given review.md with three findings (fix now, defer, unnecessary), when the reviewer approves, then one task is done, one backlog card carries the finding text, and the removed code is gone from the diff; `check review` fails if any finding lacks a verdict.
answer: 

## Q4 Riskiest assumption: everything gets deferred and the backlog fills with noise.
recommended: A deferred card must carry a reach line or be tagged `assumption`; the inbox shows "N deferred from reviews this week" so the drift is a number.
answer: 

## Q5 Evidence per finding: file:line, a command, or either?
recommended: file:line required; a command optional.
answer: 
