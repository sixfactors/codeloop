## Q1 Scope: PR review and service review both land in c-070's triage table. Any other review kind (design, copy) in?
recommended: PR and service only; the table format is c-070's; design review belongs to c-078.
answer: 

## Q2 What is a finding: file:line, rule id, severity, verdict, evidence? And how many severity levels?
recommended: Columns file:line, rule (from rules.md or `none`), severity (block or advise), verdict (empty until triage), evidence. One summary line at the top; no other prose.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a PR, when the review stage runs, then review.md is that table and nothing else, and the done-check becomes `check review`, failing on any `block` finding without a verdict.
answer: 

## Q4 Riskiest assumption: lifting `pr-reviewer` verbatim drags chanl rules into a generic plugin.
recommended: The review plugin carries format and severity only; stack rules come from the specialist plugin's rules.md (c-078, c-080).
answer: 

## Q5 Which agent runs it?
recommended: Whatever `adopt` mapped to the review stage; falls back to the plugin's own skill.md.
answer: 
