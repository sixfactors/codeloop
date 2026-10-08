## Q1 Scope: sign-in and roles (owner, reviewer, builder) so an approval names a person. Which identity provider?
recommended: Reuse Protobox workspace auth (Firebase); roles come from the workspace member list; `--as` is removed on the hosted board.
answer: 

## Q2 Does the local CLI approve as the signed-in person too, or only the hosted board?
recommended: Both: `codeloop login` stores a token and events carry `user:`; local without login stays `owner`.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given two users in a workspace, when the reviewer approves the pr gate on the hosted board, then the event carries their email, and an owner-only gate refuses them with the reason shown.
answer: 

## Q4 Riskiest assumption: the hosted board is a Protobox page and cannot run gate logic. Where do gates execute?
recommended: Through a Protobox MCP action; the page only calls it. Decide this before the plan, since it changes the whole build.
answer: 

## Q5 One board per repo or per workspace?
recommended: Per repo under a workspace; the workspace lists its boards.
answer: 
