## Q1 Scope: this is L. Engine-written card pages plus the pane in `serve` as one M card, with search and "gate notes become decisions" split out?
recommended: Yes: card pages and pane here; search and decisions-from-notes as a child card.
answer: 

## Q2 Card page: Markdown under `.codeloop/wiki/cards/<id>.md`, regenerated on every event?
recommended: Yes; engine-owned and overwritten on each event, with a `## Notes` section that survives regeneration for human text.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given CL-001, when `serve`, then its board row opens a pane with the story, every event with its note, and links to spec, evidence and PR; the page file exists in the wiki and cloud sync pushes it to the Protobox page.
answer: 

## Q4 Riskiest assumption: two truths, the card page and cards.json.
recommended: cards.json is truth; the page is a render; `wiki check` fails when a page is older than its card's updatedAt.
answer: 

## Q5 UI: a pane in the existing `ui/` shadcn app, or a new route?
recommended: A resizable right pane in the same app; no new route.
answer: 
