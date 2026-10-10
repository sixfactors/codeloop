## Q1 Scope: this is L. `verify --mutate` already exists in the CLI. Is this card the per-layer use cases plus mutate as the default done-check, with the UI runner split out?
recommended: Yes: use case stubs per acceptance line for api and cli, mutate on by default in the verify done-check; the Playwright UI runner is a child card.
answer: 

## Q2 What is the mutation: revert the whole card diff in a temp worktree and rerun, or per-test mutants?
recommended: Revert the card branch's diff in a temp worktree and rerun; any use case that still passes is "cannot fail" (exit 4).
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a card with two acceptance lines and use cases, when `verify --mutate`, then a use case that passes without the fix fails verify with exit 4 naming the line, and evidence/verify.md shows pass plus mutate-fail per line.
answer: 

## Q4 Riskiest assumption: mutate takes too long (install, build) and gets skipped. Budget?
recommended: Five-minute cap; over the cap writes `mutate: skipped (time)` and the local gate note shows it so Dean can refuse.
answer: 

## Q5 Who owns the use case folder layout: core or the qa plugin?
recommended: Core owns `usecases/<nnn>/` and the ids; the plugin owns the runner per layer.
answer: 
