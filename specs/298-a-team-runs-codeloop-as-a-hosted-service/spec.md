# c-298 spec: A team runs codeloop as a hosted service and every developer's repo plugs in

Story: As a team, I can run one hosted codeloop that every developer's repo plugs into, so that the board, wiki and agent runs are shared instead of living on one laptop.

feature: codeloop
initiative: wiki/initiatives/hosted-board-the-team-shares.md
size: L
metric: returning teams
done_when: for Dean to read and choose an architecture; no build starts from this card, the first slice below becomes its own S or M card
screens: none
mock: drop

acceptance:
- US1 Given Dean has read this page, when he answers the five questions, then one architecture and one first slice are chosen and recorded as a decision page.

## What stays local and what moves

| Stays on the developer's machine | Moves to the service |
|---|---|
| Editor hooks (`guard edit`, `bash`, `prompt`, `session`; `src/lib/hookd.ts`) | The board and cards (`cards.json`) |
| The repo and its `.codeloop/` files | The wiki, the activity stream, the inbox |
| Builder processes, under architectures A and C | The orchestrator, the doctor and the scheduler (`src/lib/orch.ts`, `clock.ts`, `schedule.ts`) |
| Git hooks, `codeloop render` host files | Model runs and their keys, under B; budgets and the ledger, under all three |

Hooks stay local in every option: they must answer in about 0.3 s (`hookd.ts`) and read the repo's own files, so a network round trip per tool call is not acceptable.

## Three architectures

| | A: hub only | B: cloud runners | C: hybrid |
|---|---|---|---|
| Shape | The service is the workspace app plus API over a shared store. Repos push state. | The service also runs the orchestrator and builders in a sandbox per repo, like a CI runner. | Builders run on developer machines. The cloud holds the board and a queue. |
| Developer installs | The CLI, plus `codeloop login <url>` | The CLI for hooks, plus a GitHub app; nothing runs locally | The CLI and a small agent that pulls work from the queue |
| Model keys and secrets | On each developer's machine, as today | In the service's secret store, per team | On each developer's machine; the service never sees them |
| `.codeloop/` sync | Git carries the files; the API carries board state (cards, activity) | The runner clones the repo and pushes a branch; git is the sync | Board by API with the version check the store already has; files by git |
| Latency | Board reads fast; no change to build speed | Cold start of a sandbox per turn, tens of seconds; no laptop needed | Same as today for builds; claims go through the queue |
| Cost | Hosting only | Hosting plus compute plus model spend billed to the team | Hosting plus a queue |
| Offline | Local work continues, state pushes later; conflicts on rejoin | Nothing runs; the board is read-only | Builder finishes its turn and hands back when it reconnects |
| Weak point | Two writers on one card | Most to build; secrets and isolation | Two places that know a card's state |

## Features needed whatever the choice

| Feature | Notes |
|---|---|
| Accounts and teams, per-project auth | The hub has one owner and one password today (`src/lib/hub-auth.ts`); needs users, roles and a project per repo |
| Sync protocol for `.codeloop/` state | Version per item and refusal on mismatch exist (`src/lib/store/README.md`); needs conflict rules per file kind |
| Hosted hub with SSE | `/api/events` and `/api/p/:id/*` exist (`src/lib/hub.ts`, `src/lib/server.ts:549`); needs TLS, `anyHost` and a database store |
| Secret store for model keys | Nothing exists; under B it holds the keys, under A and C it holds none |
| Usage metering and budgets per team | Per-run budget (`src/lib/budget.ts`) and per-agent daily ledger (`src/lib/agent-ledger.ts`); needs a team total |
| Audit of every agent action | The activity stream records them locally; needs an append-only copy on the service |
| Runner image for builders | Needed for B only |
| Webhooks for GitHub PRs and checks | Moves a card at the review gate when a PR is merged or a check fails |
| SDK transport pointing at the service | Already there: `createHttpClient({ baseUrl, token, project })` (`src/sdk/http.ts:10`); the CLI and the app change nothing |

## What already carries over

- The SDK with its two transports, so the CLI and the app are unchanged (`docs/architecture.md`).
- The hub: one process serving many projects, each in its own context (`src/lib/hub.ts`).
- Lanes, gates and the engine's checks, which do not care where they run.
- The orchestrator with turn budgets, leases and per-turn records (`src/lib/orch.ts`).
- The agent ledger and the card-level conflict error.
- A cloud sync path is half-built: `src/lib/cloud.ts` syncs the board, config, lanes and wiki to a remote workspace over an authenticated URL (`.codeloop/cloud.json`), writing a `.cloud.md` copy on conflict. `src/lib/store/index.ts` has a `registerDriver` plugin point for a `protobox` or `sql` store. The first slice should start from these, not from nothing.

## Questions for Dean

1. Which first: A, B or C? Recommend A: it reuses the hub and SDK, risks no secrets, and answers whether teams want a shared board before codeloop pays to run their builds.
2. Who owns model keys? Recommend the developer, until a customer asks for central billing.
3. Is git the sync for files and the API the sync for board state? Recommend yes; one source of truth per kind of data.
4. Hosted by us only, or self-hostable too? Recommend self-hostable from day one: the hub is already a single process.
5. Who is the first team? Recommend codeloop's own two builders plus one outside repo.

## First slice, two weeks

Architecture A, one project, two developers. Week 1: `codeloop login <url>`, hub on a server with per-user tokens in place of the shared password, a remote store driver for cards and activity behind the existing version check. Week 2: both developers' CLIs and apps read and write that board; two writers to one card produce a refusal, not a lost edit; board changes arrive over `/api/events`. Not in the slice: runners, billing, webhooks.

## Not building

- Cloud runners (B) or a queue (C) in the first slice.
- Multi-tenant billing, SSO, an app marketplace.
