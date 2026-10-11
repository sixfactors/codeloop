# Architecture pages: skeletons

Five files under `.codeloop/wiki/architecture/`. Replace every placeholder; nothing between
`<!-- -->` survives into the written page. Node ids in the examples (`UI`, `API`, `DB`, `A`, `B`)
are illustrations, not a required naming scheme, but every mermaid `click` target and every table
cell that names a file must be a path that exists in this repo.

## overview.md

```markdown
# Overview

<!-- One paragraph: what the system does and who calls it. -->

\`\`\`mermaid
flowchart TB
  subgraph UI["ui -- what this layer does, one line"]
    App["app entry point"]
  end
  subgraph API["api -- what this layer does, one line"]
    Routes["route handlers"]
  end
  subgraph DB["db -- what this layer does, one line"]
    Schema["the schema"]
  end
  App --> Routes
  Routes --> Schema
  click App "ui/src/app.ts"
  click Routes "api/src/routes/index.ts"
  click Schema "api/src/db/schema.ts"
\`\`\`

| Folder | Purpose | Depends on |
|---|---|---|
| `ui/` | Renders the app a user opens. | `api/` |
| `api/` | Handles requests and owns the data model. | `db` |

<!-- A folder from repo-facts.json with nothing to say for itself: -->
Left out: `coverage/` (generated test output, not source).
```

## flows.md

```markdown
# Flows

## A user signs in

\`\`\`mermaid
sequenceDiagram
  participant UI
  participant API
  participant DB
  UI->>API: POST /login
  API->>DB: find user by email
  DB-->>API: user record
  API-->>UI: session token
\`\`\`

<!-- 2 to 4 of these. Participant names must match the names in overview.md's table (UI, API, DB
above, not "ui/" or "the frontend"). -->
```

## data-model.md

```markdown
# Data model

\`\`\`mermaid
erDiagram
  USER ||--o{ SESSION : "has many"
  USER {
    string id
    string email
  }
\`\`\`

| Entity | Field that matters | Why |
|---|---|---|
| User | email | the sign-in identity |

<!-- Only the entities and fields a reader needs for the flows above, not every column the scanner found. -->
```

## change-map.md

```markdown
| To change | Edit | Then run |
|---|---|---|
| The sign-in page's copy | `ui/src/pages/login.tsx` | `npm run dev` |
| What happens after login | `api/src/routes/login.ts` | `npm test -- login` |

<!-- 5 to 15 rows. "Edit" is a real path in this repo; "Then run" is a real command. -->
```

## invariants.md

```markdown
## Invariant: a session always has a user

A session row with no matching user is a bug in the login flow, not a valid state.

- enforced by: `api/src/db/schema.ts`
- tested by: `api/src/__tests__/login.test.ts`

<!-- 3 to 10 of these. Both paths must exist; a rule with no test is a hope, not a rule. -->
```
