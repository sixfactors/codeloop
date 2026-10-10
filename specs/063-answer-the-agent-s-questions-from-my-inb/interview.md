## Q1 Scope: the interview stage through the local inbox and `serve` only? "From my phone" means the hosted board page (c-088) or a Slack ping (c-064)?
recommended: Local inbox and the `serve` page this card. Phone = the same inbox page on the hosted board once c-088 ships; Slack delivery is c-064. Only the interview stage asks here; whys, options and premortem reuse the mechanism in c-066.
answer: 

## Q2 What does accepting look like: a CLI command, a button on the serve inbox, or editing a file?
recommended: Both CLI (`codeloop answer <id> <n> [text]`, no text = accept recommended) and a button per question on the serve inbox; answers land in `specs/nnn/interview.md` and the agent resumes on the next `run`.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a card at the interview stage with five questions, when Dean accepts three and types two, then `brief` for the spec stage shows all five answers, `spec.md` carries each under the section it affects, and `run` does not advance while any question is unanswered.
answer: 

## Q4 Riskiest assumption: the questions will be generic or implementation-y. What is the bar and what fails it?
recommended: A done-check on the interview output: at most five, each with `recommended:`, one tagged scope, one acceptance, one risk. The 31 files written in this session are the fixtures for that check.
answer: 

## Q5 Do unanswered questions time out and auto-accept the recommendation, or block forever?
recommended: Block by default; `auto_accept_after: 24h` on the lane stage is opt-in and logged as `actor: engine` on the card.
answer: 
