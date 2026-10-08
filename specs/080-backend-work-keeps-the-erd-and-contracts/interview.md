## Q1 Scope: this is L. Spines check first (schema change must change the ERD in the same diff), and the four rule checks (DTO whitelist, envelope, swagger, workspace scoping) as a child?
recommended: Yes: spines this card, rule checks a child card; nestjs-coder patterns and templates copied as-is into `patterns/`.
answer: 

## Q2 File-to-doc mapping: globs in plugin.yaml, or parse ARCHITECTURE-DOCS.md?
recommended: `spines:` in plugin.yaml: `*.schema.ts -> docs/architecture/DATABASE.md`, `*.controller.ts|*.dto.ts -> service-contracts.md`; a repo overrides in config.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a diff adding a field to `agent.schema.ts` without touching DATABASE.md, when the build done-check runs, then it fails naming schema and spine; the same diff with the ERD row passes. Proven on a real chanl-api card.
answer: 

## Q4 Riskiest assumption: a whitespace edit to the ERD satisfies the check.
recommended: The spine diff must mention the changed symbol (field or route name); otherwise fail.
answer: 

## Q5 Which repo first: codeloop (no NestJS) or chanl-api?
recommended: chanl-api, on its next backend card; codeloop only hosts the plugin.
answer: 
