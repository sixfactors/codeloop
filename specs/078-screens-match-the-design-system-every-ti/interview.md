## Q1 Scope: which frontend-apps rules become blocking checks first: raw colour/px tokens, three font weights, no edits under `components/ui/`, registry-first?
recommended: Four checks: no raw colour, at most three weights, nothing under `components/ui/` edited, new components import from `components/shared` or the registry. "Search the registry first" stays advice.
answer: 

## Q2 Which repo proves it?
recommended: chanl-admin on a real card; the check also runs once over the whole tree to print today's violation count as a baseline.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a diff adding `color: #333`, when the build done-check runs, then it fails naming file:line and rule; the existing chanl-admin tree reports N violations as a number in the wiki, not a failure.
answer: 

## Q4 Riskiest assumption: the existing tree has hundreds of violations and the check is unusable.
recommended: Check only files in the card's diff; the baseline count goes to `wiki/numbers/` and becomes the card's own metric.
answer: 

## Q5 Lift frontend-apps.md verbatim or rewrite for the plugin?
recommended: Copy the rules; move chanl paths into plugin config (`shared_dir`, `ui_dir`).
answer: 
