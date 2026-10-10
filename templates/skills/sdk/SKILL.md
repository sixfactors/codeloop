---
name: sdk
stage: build
lane: build
inputs:
  - docs/architecture.md
  - .codeloop/wiki/architecture/*.md
  - specs/{id}/spec.md
  - specs/{id}/tasks.md
  - "the api stage's contract entry for the routes this card touches"
outputs:
  - "typed client method + hook per route, for each [sdk] task"
  - "a CLI command that prints the new data, if the repo ships a CLI"
  - "specs/{id}/tasks.md: every [sdk] line ticked"
check: "codeloop task check {id} --all-done && npm test"
questions: 3
---

# sdk

Expose the routes the `api` stage just built as a typed client method and a hook (and, if the
project ships one, a CLI command). The gate is not "the type compiles", it is **the SDK exposes
the change and the CLI shows it**: a consumer can call one function and get typed data back, and
if there's a CLI, running it proves the whole path end to end without a UI.

## Role

The builder working the `[sdk]` tasks in `specs/{id}/tasks.md`, after `api`'s tasks are ticked and
its tests are green. Per `docs/architecture.md`'s onion, this stage calls only the API the
previous stage exposed, it never reaches past it into the service layer, and it never duplicates
response-parsing or type-declaration logic that already lives here for another entity.

## Inputs

- `docs/architecture.md`, the onion and the layer-ownership table: what the SDK owns (client,
  types, hooks, query-key factories) and what it must not do (hold page-layout or app state).
- The `api` stage's contract entry for this card (`docs/architecture/service-contracts.md` or
  equivalent), the exact request/response shape, status codes, and whether the change is
  additive or breaking.
- `specs/{id}/tasks.md`, work only `[sdk]`-tagged lines.
- The SDK's own existing module and hook for a sibling entity, if one exists, copy its shape
  rather than inventing a new one.

## Procedure

1. **Confirm the contract is stable.** Read the `api` stage's contract entry. If it says
   "breaking", get the shape confirmed before writing the client method, a client method typed
   against a shape that changes again is wasted work.
2. **Type.** Add or extend the shared type for the entity, in the SDK's types location, not
   inline in a hook or a component. Re-export it from wherever hooks already live so a consumer
   imports type and hook from one path.
3. **Client/module method.** One function per route: `list`, `get`, `create`, `update`, `delete`,
   or the specific action the route exposes. It calls the HTTP client, nothing else, no UI
   imports, no app-specific logic.
4. **Response handling.** Reuse the SDK's existing envelope-unwrapping function. Do not write a
   second one, and do not leave the unwrapping to the caller.
5. **Hook (or hooks).** A query hook for reads, a mutation hook for writes, built on the project's
   data-fetching library over the client method from step 3. Export a key factory for the entity
   if reads are cached, one factory per entity, reused by every hook that touches it.
6. **Invalidate on mutation.** Every mutation hook invalidates the list/detail keys it affects on
   success. A create that doesn't invalidate the list leaves stale data in every open view.
7. **CLI command**, if the project ships one: wire it to the same client method from step 3, not
   a parallel HTTP call. Running it end to end is the proof this stage asks for.
8. **Prove the gate.** Call the new hook or client method from a throwaway script, a test, or the
   CLI, and confirm the data comes back typed and shaped as the contract says, this is the "SDK
   exposes it" half of the gate.
9. **Tick the task**, move to the next `[sdk]` task, repeat.
10. **When every `[sdk]` task is ticked**, run `codeloop task check {id} --all-done && npm test`
    before handing off to `ui`.

## Stack notes

Most SDK work is framework-agnostic: a typed client wrapping HTTP calls. The framework specifics
are on the consuming side.

**NestJS backend, React consumer.** The SDK targets the NestJS response envelope
(`{ success, data }`) and its field convention (`.id`, never `._id`). Hooks use TanStack Query; a
query key factory per entity (`agentKeys.detail(id)`) is required, not optional, ad hoc key
arrays break cache invalidation the moment two call sites spell the key differently.

**Express backend.** No standard envelope to assume, check whether the response is the raw
object or wrapped, and write the unwrap function once, shared by every module, rather than per
endpoint.

**Next.js consumer.** Hooks run client-side (`'use client'`); a server component calls the SDK's
client method directly inside an `async` component instead of through a hook. Keep both paths
using the same client method so there is one source of truth for the request shape.

**FastAPI backend.** Pydantic response models give the SDK a stable shape to type against
directly, generate types from the OpenAPI schema when the project supports it, rather than
hand-typing a shape FastAPI already publishes.

## Questions to ask before working

## Q1 Is the api stage's contract final, or still "breaking, TBD"?
recommended: Treat anything marked breaking as not-ready; confirm the final shape with the api
builder before typing the client method.
answer:

## Q2 Does this entity already have a hook file, or does this task start one?
recommended: Extend the existing hook file for the entity (query hook, mutation hooks, key
factory together) rather than scattering new hooks across files.
answer:

## Q3 Does the project ship a CLI? If so, does this change need a new command or a flag on an existing one?
recommended: Reuse an existing command with a new flag when the action is a variant of one
already there; a new command only for a genuinely new verb.
answer:

## Template

See `template.md` in this folder for the hook-file skeleton (types, client method, query key
factory, query hook, mutation hook) to fill per entity.

## Checklist

- [ ] `codeloop task check {id} --all-done && npm test` passes
- [ ] Every `[sdk]` task ticked, each tracing to an acceptance line
- [ ] Type lives in the SDK's shared types location, not inline in a hook or component
- [ ] Client method reuses the shared envelope-unwrap function; no app-level response parsing
- [ ] One query key factory per entity, exported, reused by every hook touching that entity
- [ ] Every mutation hook invalidates the keys it affects
- [ ] If the project has a CLI, the new data is reachable from it and running the command proves
  the path end to end
- [ ] No raw `fetch`/`axios` call, and no duplicate type declaration, left behind in app code that
  should have called the SDK instead

## Done

`codeloop task check {id} --all-done && npm test` exits 0, and the gate from the Role section is
demonstrated, not assumed: a call through the new hook or client method (in a test, a script, or
the CLI) returns typed data matching the api stage's contract.

## Examples

**Good.** Task: `[sdk] T004 [US2] Expose updateSettings on the workspace client + hook`. Adds
`WorkspaceSettings` to the shared types, `client.workspaces.updateSettings(id, dto)` on the
module, `useUpdateWorkspaceSettings()` mutation hook invalidating `workspaceKeys.detail(id)` on
success, and (the project ships one) `codeloop workspace settings update <id> --notifications
on`. Running the CLI command against a dev instance prints the updated settings object, the
proof the gate asks for.

**Failing, and why.** Same task, implemented as a one-off `useQuery({ queryFn: () =>
fetch('/api/workspaces/' + id + '/settings') })` written directly inside the page component that
needed it. It compiles and the page works, but no other screen or the CLI can reuse it, the
response envelope is unwrapped by hand inline, and nothing invalidates the cache when settings
change elsewhere, the next consumer duplicates the same fetch instead of finding a hook to call.
