# Architecture pages: skeletons

Seven files: five under `.codeloop/wiki/architecture/`, plus `.codeloop/wiki/start-here.md` and
`.codeloop/wiki/runbooks/commands.md`. Replace every placeholder; nothing between `<!-- -->`
survives into the written page. Node ids in the examples (`UI`, `API`, `DB`, `A`, `B`) are
illustrations, not a required naming scheme, but every mermaid `click` target and every table cell
that names a file must be a path that exists in this repo. Function names, conditions and numbers in
the examples (`createSession`, `409`, `advanceCard`) are illustrations too - replace them with the
real ones from the code you read, never leave the illustration in place.

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

## Sharp edges

<!-- 2 to 5 things that surprise people, each citing its source. Omit the whole section when
nothing here is actually surprising -- do not invent one. -->

- `api/src/db/schema.ts` opens one connection per process, not a pool: a second concurrent write
  waits on the first (source: `gotchas/connection-serializes-writes.md`).
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
  UI->>API: POST /login { email, password }
  API->>DB: findUserByEmail(email)
  alt no matching user, or password hash mismatch
    DB-->>API: null
    API-->>UI: 401 "invalid credentials"
  else credentials match
    DB-->>API: user record
    API->>DB: createSession(userId)
    DB-->>API: session row written
    API-->>UI: 200 { sessionToken }
  end
\`\`\`

<!-- 2 to 4 of these. Participant names must match the names in overview.md's table (UI, API, DB
above, not "ui/" or "the frontend"). Name the real function on each arrow and show the failure
branch as an alt/else, not only the happy path. -->

## Sharp edges

- `createSession` does not invalidate a user's other sessions: signing in on a second device does
  not sign the first one out (source: `decisions/multi-session-login.md`).
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

A session row with no matching user is a bug in the login flow: it means `createSession` ran after
the user row it referenced was deleted, and every read through it 404s instead of failing at write
time, in `api/src/sessions/service.ts`.

- enforced by: `api/src/db/schema.ts`
- tested by: `api/src/__tests__/login.test.ts`

<!-- 3 to 10 of these. Both paths must exist; a rule with no test is a hope, not a rule. State what
breaks if the rule is violated, in one line, not just that it "must stay true". -->
```

## start-here.md

```markdown
# Start here

<!-- One paragraph: what this is, in the terms the overview already established. -->

See the diagram and folder table in [architecture/overview](architecture/overview.md).

## Set up

\`\`\`
npm install
npm run dev
\`\`\`

## The three things you'll actually do here

1. **Run the tests for one area.** \`npm test -- login\`
2. **Start the app against a local database.** \`npm run dev\`
3. **Check a change before committing.** \`npm run lint && npm test\`

<!-- Real commands this repo's own package.json/Makefile define, not generic guesses. -->

## Where to go next

- [How it works](architecture/overview.md) -- the five architecture pages
- [What bites](gotchas/) -- mistakes already hit, scoped to files
- [Why](decisions/) -- why it is built this way
- [Commands](runbooks/commands.md) -- every script and make target
```

## runbooks/commands.md

```markdown
# Commands

Every npm script and make target this repo defines, grouped by what you're trying to do.

## Run it

| Command | What it does |
|---|---|
| \`npm run dev\` | Starts the dev server with hot reload |

## Test it

| Command | What it does |
|---|---|
| \`npm test\` | Runs the full suite |

<!-- Group however the repo's own scripts naturally split (build, test, deploy, ...). Every script
in repo-facts.json's `scripts` and every Makefile target in `makeTargets` must appear in some table
here, or in a line below naming it and why it was left out. -->

Left out: \`scripts/one-off-migration.sh\` (already run once against production; not a repeatable task).
```
