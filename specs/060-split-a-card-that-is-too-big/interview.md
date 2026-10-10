## Q1 Scope: `card split` command only, or also the nested rows on the board? Is an auto-split by the agent at the spec gate in?
recommended: Command and nested board rows both in. Auto-split out: an unsplit L still fails `spec check` and prints "run card split".
answer: 

## Q2 What happens to the parent: stays as an epic header with no stage, closes when all children are live, or becomes child one?
recommended: Parent becomes `kind: epic`, no lane stage, a group header on the board; it moves to live by itself when the last child goes live.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given an L card at the spec gate, when `card split c-xxx --into 3`, then three S/M cards exist with `epic: c-xxx`, each passes `check story`, the board nests them under the parent, and `spec check` on the parent passes once children exist.
answer: 

## Q4 Riskiest assumption: who writes the three child stories, the agent or Dean typing titles?
recommended: Agent drafts them with SPIDR from the parent's acceptance lines and posts them as one inbox question; Dean accepts or edits lines.
answer: 

## Q5 More than three children: hard fail (story standard says that is a lane) or warn?
recommended: Hard fail at four: "more than three children is a lane; make one".
answer: 
