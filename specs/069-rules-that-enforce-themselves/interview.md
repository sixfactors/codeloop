## Q1 Scope: a `check:` on a rules.md entry, run at build and review. Core rules only, or plugin rules too?
recommended: Core mechanism with codeloop's own rules.md as the first user; plugin rules arrive with c-075.
answer: 

## Q2 Format: one shell command per rule with exit code only, or a DSL?
recommended: A fenced `check:` line under the rule; exit 0 passes; the first output line is the finding. No DSL.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a rule "no console.log in src" with a grep check, when the build done-check runs on a tree with one offender, then `next` fails naming the rule and file; removing the line passes.
answer: 

## Q4 Riskiest assumption: checks get slow or flaky and get deleted. Budget and demotion?
recommended: 10 seconds per check, run in parallel; a check failing twice on a clean tree is auto-demoted to advice and a gotcha entry is written.
answer: 

## Q5 When `learn` promotes a gotcha into rules.md, does it get a check?
recommended: No; the promoted rule shows `check: none` so the gap is visible, and the next card touching that area adds one.
answer: 
