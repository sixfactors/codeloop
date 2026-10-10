# Architecture

Status: current. Describes the code as it is on `main`; update it when a layer gains or loses a file.

## The onion

```
services  (src/lib/*.ts)          the engine: cards, lanes, gates, questions, wiki, index, store
   │
API       (src/lib/server.ts)     one Hono route per service function; auth, ETags, status codes
   │
SDK       (src/sdk/)              CodeloopClient over a Transport: http (fetch to the API) or local (the service functions in process)
   │
CLI + UI  (src/commands/, workspace/)   thin peers on the SDK; neither calls a service directly
```

Every layer calls only the one directly beneath it. The two transports exist so the CLI needs no server and the UI needs no file system; both end in the same function in `src/lib/services.ts`, so a card made from the terminal and a card made from the board go through the same story check, the same engine write and the same Next line.

## Which layer owns what

| Layer | Owns | Must not |
|---|---|---|
| Services (`src/lib/`) | Reading and writing the project's files, the engine's rules, the project index, the store drivers, the shapes every caller sees (`src/lib/services.ts` return types) | Know about HTTP, the terminal, exit codes or React |
| API (`src/lib/server.ts`) | Routes, the write token, loopback-only hosting, ETag revalidation, mapping a `RefusalError` to 400 or 404 and a `ConflictError` to 409, the live event stream | Hold logic of its own: a route parses, calls one service function, shapes the status |
| SDK (`src/sdk/`) | `CodeloopClient`, the `Transport` interface, `httpTransport`, `localTransport`, `ApiError`, every type the CLI and UI use (`src/sdk/types.ts` re-exports the store and engine types) | Import node modules on the http path; `src/sdk/index.ts` is bundled into the browser |
| CLI (`src/commands/`) | Commander wiring, printing, colours, exit codes (`guard.ts`) | Import `src/lib/` (enforced by `src/__tests__/layering.test.ts`) |
| UI (`workspace/`) | Screens, hooks, the query cache. `workspace/lib/api.ts` is the one caller of the SDK; `workspace/lib/types.ts` derives every screen type from the SDK's | Fetch on its own, define an API type twice, join or aggregate what the API can serve pre-joined |

## Adding a capability

In this order, so each step has something below it to call:

1. Service: a function in `src/lib/services.ts` (or the engine module it belongs to, re-exported there). It takes `projectDir` and plain inputs, or the `ProjectIndex` for an index-backed read, and returns a plain object. Refuse with `RefusalError`, conflict with `ConflictError`.
2. API: a route in `src/lib/server.ts` wrapped in `handled` (a read) or `writing` (a write) that calls it. Writes need the token; owner-only writes check `owner` and answer 403 with `readOnly`.
3. SDK: the operation on `Transport` in `src/sdk/client.ts`, a method on `CodeloopClient`, and both implementations: `src/sdk/http.ts` sends the request, `src/sdk/local.ts` calls the service. Its types go in or through `src/sdk/types.ts`.
4. CLI and UI: the command calls `createLocalClient(process.cwd())`; the hook calls `api.*` in `workspace/lib/api.ts`, which calls the client. Neither reaches past the SDK.

A test for the service belongs with the services; `src/lib/__tests__/sdk.test.ts` runs each operation through both transports against the same temp project, so a route and its local twin cannot drift.

## What still bypasses the onion, and why

| Where | What it imports | Why it is exempt |
|---|---|---|
| `src/commands/serve.ts`, `watch.ts` | `src/lib/server.ts`, `next-server.ts`, `index/` | They are the API host: they build the Hono app the http transport talks to |
| `src/commands/guard.ts` | the error classes in `cards.ts`, `cloud.ts`, `engine.ts` | The shell helper that turns an engine error into an exit code (2 refused, 3 conflict) |
| `src/commands/run.ts` | `run.ts`, `agent.ts`, `clock.ts` | The scheduled run over every due lane starts agent processes; one card's run has an SDK operation (`cards.run`), the whole-board run does not |
| `src/commands/adopt.ts` | `lane.ts`, `skills.ts` | The index merge goes through `setup.adopt`; `--gaps` still reads the lanes directly |
| `src/commands/wiki.ts` (`capture`, `learn`, `competitor`) | `wiki.ts`, `competitors.ts` | Wiki writes have no SDK operation yet; the read paths (`list`, `inject`, `lint`) go through the client |
| `src/commands/lane.ts`, `check.ts`, `verify.ts`, `spec.ts`, `mock.ts`, `render.ts`, `pack.ts`, `scan.ts`, `schedule.ts`, `import.ts`, `store.ts`, `status.ts`, `init.ts`, `update.ts` | the engine module each drives | Engine-internal or setup commands that run before a store exists, or that CI runs in process; each is named in the layering test with its reason |
| `src/commands/install.ts`, `search.ts`, `list.ts`, `remove.ts`, `publish.ts`, `login.ts` | `registry/` | The skill registry is a separate system with its own client |
| `src/lib/mcp.ts` | the engine directly | The MCP server is another peer of the SDK and has not been moved onto it |
| `workspace/hooks/use-events.ts` | `EventSource` on `/api/events` | The browser's `EventSource` reconnects on its own; the SDK's `events()` is the same stream for node callers |

Moving any of these means adding the operation to the SDK first (step 3 above), then removing the row from `EXEMPT_FILES` or `ALLOWED_IMPORTS` in `src/__tests__/layering.test.ts`.

## Transports

| | http | local |
|---|---|---|
| Entry | `@protoboxai/codeloop/sdk` (`createHttpClient`) | `@protoboxai/codeloop/sdk/local` (`createLocalClient`) |
| Runs in | browser or node | node |
| Reads | `GET` with the last ETag seen per path; a 304 returns the cached body | the service function; index-backed reads open the project index on first use |
| Writes | `x-codeloop-token` header, JSON body; the server's `--owner` decides the role, `as` is ignored | the role from `as`, `CODELOOP_ROLE`, then the terminal (`resolveRole`) |
| Errors | `ApiError` with the HTTP status | the engine's `RefusalError` and `ConflictError`, so `guard.ts` maps them as before |
| Events | `events()` parses the SSE stream with fetch | `events()` subscribes to the index |
| Not served | `cards.migrateStories` (501) | nothing |

## File map

| Path | Role |
|---|---|
| `src/lib/services.ts` | The service layer: every function a route or the local transport calls, and the shapes they return |
| `src/lib/server.ts` | The Hono API; `createApp(projectDir, uiDir, { owner, token, anyHost, store })` |
| `src/lib/index/index.ts` | The project index the board reads: cards, pages, lanes, initiatives, artifacts, with versions and a change stream |
| `src/lib/store/` | Store drivers (file, memory) and the entity schemas the SDK's types come from |
| `src/lib/engine.ts`, `flow.ts`, `interview.ts`, `inbox.ts`, `wiki.ts`, `stats.ts` | The engine the services wrap |
| `src/lib/run.ts`, `runs.ts` | `run.ts`: the scheduled run (due triggers, one agent start and one advance per card, `--lane`/`--card` filters) and `workCard`, one card's turn. `runs.ts`: a single card's run started from the API or SDK, its record and log under `.codeloop/state/agent-runs/<runId>.{json,log}` |
| `src/lib/detect.ts`, `skills.ts` | What `init` reads from package.json (`detectProject`), and the skills index merge `adopt` and `setup.adopt` share |
| `src/program.ts` | `buildProgram()`: the commander tree; `src/index.ts` parses it, and `src/__tests__/help.test.ts` walks it so every nested `--help` is tried |
| `src/sdk/types.ts` | Every SDK type, re-exported from the store, the engine and the services |
| `src/sdk/client.ts` | `Transport`, `CodeloopClient`, `ApiError` |
| `src/sdk/http.ts` | `httpTransport`, `createHttpClient`, `cardsSearch` |
| `src/sdk/local.ts` | `localTransport`, `createLocalClient`; also re-exports `parseQuestions` and `MAX_QUESTIONS` for a CLI reading a questions file |
| `src/sdk/index.ts` | The browser-safe entry: client, http transport, types |
| `src/commands/card.ts`, `inbox.ts`, `ask.ts`, `brief.ts`, `wiki.ts` | Commands on the SDK's local transport |
| `src/__tests__/layering.test.ts` | Fails when a command imports `src/lib/` outside the allow-lists |
| `src/lib/__tests__/sdk.test.ts` | Each operation through both transports |
| `workspace/lib/api.ts` | The UI's one caller of the SDK (http transport, same-origin, token from the URL) |
| `workspace/lib/types.ts` | Screen types derived from the SDK's; nothing defined twice |
| `workspace/hooks/use-api.ts` | React Query hooks over `api.*`; their signatures are the contract the screens hold |
| `package.json` `exports` | `.` the CLI, `./sdk` the browser-safe SDK, `./sdk/local` the node transport |

## Public surface of the SDK

`CodeloopClient` (both transports):

- `cards`: `list`, `get`, `full`, `show`, `records`, `new`, `propose`, `advance`, `approve`, `reject`, `brief`, `run`, `output`, `writeOutput`, `split`, `migrateStories`
- `runs`: `get`, `wait`, `stream` (a run started by `cards.run`)
- `setup`: `detect`, `adopt`, `status`
- `questions`: `list`, `ask`, `answer`
- `inbox`: `get` (paged), `report` (as the CLI prints it), `markSeen`
- `lanes`, `initiatives`, `artifacts`, `evidence`, `stats`, `config`
- `pages`: `list`, `search`, `get`, `put`, `delete`
- `wiki`: `entries`, `inject`, `lint`
- `events`, `close`

Routes added for the http transport to cover it: `POST /api/cards/:id/advance`, `POST /api/cards/:id/questions`, `GET /api/cards/:id/brief`, `GET /api/cards/:id/show`, `GET /api/inbox/report`, `POST /api/inbox/seen`, `GET /api/wiki/entries`, `GET /api/wiki/inject`, `GET /api/wiki/lint`.

## Runs, outputs, splits and setup over the API

| Route | Body | Answer |
|---|---|---|
| `POST /api/cards/:id/run` | `{ agent?: string }` | `202 { runId }`. The stage's check runs first; when it fails and an agent is configured (the named one, else `agents.default` or the only one), the agent is started on the stage, then one advance. The run goes on after the response. 400 when the card is parked at a gate, done, or the agent is unknown. |
| `GET /api/runs/:runId` | — | `{ runId, cardId, stage, agent?, status: 'running' \| 'done' \| 'failed', exit?, startedAt, endedAt?, outcome?, note?, log }`. `log` is the last 64 kB of `.codeloop/state/agent-runs/<runId>.log`; `exit` is the agent's exit code when one ran (null when killed), else 0 for a passed check and 1 for a failed one; `outcome` is the advance's (`moved`, `done`, `parked`, `failed`, `stuck`, `unchanged`, `refused`). `status` is `done` for moved/done/parked. 404 for an unknown run. |
| `GET /api/runs/:runId/stream` | — | SSE: one `data:` frame per log line as it is written, then `event: end` with the final record as JSON. |
| `GET /api/cards/:id/output` | — | `{ path, text }`: the current stage's output file by the lane's template with the card's values filled in; `text` is null until it exists. 400 when the stage names no output or the path leaves the project. |
| `PUT /api/cards/:id/output` | `{ text: string }` | `{ path, text }`; folders are made; an `output` event is recorded; the check does not run. |
| `POST /api/cards/:id/split` | `{ titles: string[] }` | `201 { from, cards, hints }`: one sibling per title in the same lane with the parent's `feature`, `initiative`, `epic`, `metric` and `ticket`, each with `split_from`; a `split` event on the parent. Every title passes the story check before any card is made. |
| `POST /api/setup/detect` | `{}` | `{ stack, tools, packageManager, frameworks, scripts: { test?, lint?, build? }, qualityChecks: [{ name, command }], testCommand? }`, what `init` would read from package.json. |
| `POST /api/setup/adopt` | `{ from?: string[], replace?: boolean }` | `{ indexed, added, updated, removed, duplicates }` after merging the scan into `.codeloop/skills.index.yaml`. |
| `GET /api/setup/status` | — | `{ initialised, lanes, skillsIndexed, agentsConfigured, agents }`. |

A run's record is `.codeloop/state/agent-runs/<cardId>-<stage>-<n>.json`, its log the `.log` beside it; the agent-start event on the card names the same log, so the board and `codeloop run --agent` read one folder.
