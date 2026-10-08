## Q1 Scope: `codeloop research <card>` writes research.md and a draft spec.md. Are screenshots required or best-effort, and does it read the competitor wiki first?
recommended: At least three sources required; screenshots best-effort through Chrome MCP when present, otherwise a `screenshots: none` line; `wiki/competitors/` is read before any web search.
answer: 

## Q2 Who runs it: every scan proposal automatically, the plan lane on Monday, or Dean on demand?
recommended: On demand, and in the Monday plan run for the top five backlog cards only; not on every scan proposal (cost).
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a backlog card, when `codeloop research c-xxx`, then research.md has an `exists:` verdict and three sources with URLs, spec.md has story, acceptance and `## Not building`, and the card reaches the spec gate under 30 minutes on a dogfood card.
answer: 

## Q4 Riskiest assumption: web research produces generic filler. Where is the bar?
recommended: One source must be a competitor page already in the wiki; research.md must answer unlock-vs-build with a path or URL; `check file` fails without both.
answer: 

## Q5 When the verdict is `have` or `unlock`, auto-close the card or ask?
recommended: Park it with one inbox question "close? recommended yes"; never auto-close.
answer: 
