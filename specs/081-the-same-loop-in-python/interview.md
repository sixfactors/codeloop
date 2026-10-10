## Q1 Scope: same spines (ERD, contracts) with Python rules and checks, proven on sherpa-backend. Which checks?
recommended: Two: SQLAlchemy/pydantic model change must change the ERD spine, route change must change the contracts spine; pytest as the test command; ruff rules are advice.
answer: 

## Q2 How much is shared with c-080: same spine templates, separate rules?
recommended: Spine templates live in core (`spines/ERD.md`, `contracts.md`); only rules, patterns and checks differ per plugin.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given sherpa-backend with the plugin, when `init` and a card runs build, then brief shows the fastapi rules, the done-check runs pytest and the spine check, and the same build.yaml that chanl-api uses works unchanged.
answer: 

## Q4 Riskiest assumption: core leaks NestJS assumptions (npm test, package.json). What is the test?
recommended: That is the card's test: anything in core naming npm or package.json moves to the plugin or init detection; list each one in tasks.md.
answer: 

## Q5 Same week as c-080 or later?
recommended: Separate card, same week, blocked by c-080.
answer: 
