---
name: api
stage: build
lane: build
inputs:
  - docs/architecture.md
  - specs/{id}/spec.md
  - specs/{id}/tasks.md
  - specs/{id}/research.md
outputs:
  - "service function + route + DTO for each [api] task"
  - "contract doc entry (request, response, status codes, errors)"
  - "tests through the real HTTP seam"
  - "specs/{id}/tasks.md: every [api] line ticked"
check: "codeloop task check {id} --all-done && npm test"
questions: 4
---

# api

Build the service → route → DTO slice for one card's `[api]` tasks, through the real HTTP seam,
with the contract doc kept current. Stack-neutral: the shape is service, then the route that
exposes it, then the DTO that validates its edges. A framework's names for these three things
change; the order and the boundary between them do not.

## Role

The builder working the `build` stage of `specs/{id}/tasks.md`. Owns every task tagged `[api]` for
this card. Does not touch `[sdk]` or `[ui]` tasks, those run after this stage's tests pass, per
`docs/architecture.md`'s onion (service → API → SDK → CLI + UI, in that order, one direction only).

## Inputs

- `docs/architecture.md`, which layer owns what, and the rule that a capability is added service
  first, never SDK or UI first.
- `specs/{id}/spec.md`, the acceptance lines (`US1 Given... when... then...`). Each `[api]` task
  must trace to one of these.
- `specs/{id}/tasks.md`, the task list. Work only the lines tagged `[api]`; a task with no layer
  tag fails `codeloop spec check {id}`.
- `specs/{id}/research.md`, the `exists:` verdict. `have` or `unlock` means something already
  does this; read it before writing a new route.
- The service's existing spine: its ERD or schema file, its service-contracts doc, its data-flow
  doc, if the repo keeps one. Read it before adding a field or an endpoint, a contract already
  covering the shape means extend it, not duplicate it.

## Procedure

1. **Read the acceptance line this task serves.** Find it in `spec.md` by its `[USn]` tag. If the
   task has no acceptance line, stop, fix `tasks.md` or the spec before writing code.
2. **Check what exists.** Grep the service for the entity and the route. `research.md`'s
   `exists: have | unlock | port | build` already answered this for the feature; confirm it still
   holds for this specific task before building new.
3. **Write the failing test first**, through the real seam the use case will drive, an HTTP
   request against the running app, not a mocked service call. Run it. Watch it fail for the
   reason the task exists, not for an unrelated setup error.
4. **Schema or model.** Add or extend the field. Every entity carries its tenant/workspace scope
   key, indexed. Extending an existing entity beats a new one if the data belongs together.
5. **Service function.** Plain inputs in, plain object out. Scope every query by the tenant key.
   Throw the framework's domain exception (not a generic one) for "not found", "conflict", and
   "validation failed", see Stack notes for the concrete class names.
6. **Route.** One route per service function. Validate the body against a DTO/schema before the
   service sees it. Map the thrown exception to its HTTP status in the route layer, not inside the
   service.
7. **Contract doc.** Update the service-contracts doc (or the OpenAPI/Swagger annotations that
   generate it) with the request shape, the response shape, every status code the route can
   return, and the error code for each failure. If the project has no contract doc yet, start one
   at the path `docs/architecture.md` points to.
8. **Run the test.** Green for the right reason: assert on the response body, not just the status
   code. A 200 with the wrong shape is not done.
9. **Tick the task.** `codeloop task done {nnn} <task-id>`, or check the line by hand in
   `tasks.md`. Move to the next `[api]` task.
10. **When every `[api]` task is ticked**, run the full check before handing off to `sdk`:
    `codeloop task check {id} --all-done && npm test`.

## Stack notes

**NestJS.** Service is an `@Injectable()` with `@InjectModel`. Route is a `@Controller()` method
guarded by the auth guard, extracting tenant scope via a decorator (`@Workspace('workspaceId')`),
never `@Request()`. DTOs use `class-validator` decorators; update via `findOneAndUpdate` with
`$set`, never `doc.save()`. Exceptions extend the project's `ApiException` hierarchy
(`NotFoundException`, `ValidationException`, `ConflictException` from the shared package), the
framework's own `@nestjs/common` exceptions skip the project's error envelope. Responses are
wrapped by a global interceptor; the controller returns the raw object. Pagination is `page`
(1-indexed), never `offset`.

**Express.** Service is a plain function or class method exported from a `services/` module.
Route is a handler on a `Router()`, with validation middleware (`zod`/`joi`/`express-validator`)
running before the handler, and tenant scope read from the authenticated request, never from the
body. Errors are thrown as typed error objects and caught by one central error-handling
middleware that maps type to status code, don't `res.status().json()` an error inline in the
handler.

**Next.js (route handlers / server actions).** Service is a plain function in `lib/` or
`server/`, imported by the route handler under `app/api/.../route.ts` or by a server action.
Validation happens at the top of the handler before any database call. Tenant scope comes from the
session, read once, passed down, never trusted from a query param or body field a client could
set.

**FastAPI.** Service is a function or class in a `services/` module, type-hinted with Pydantic
models for input and output. Route is a path operation function with a `response_model`; FastAPI
validates the request body against the Pydantic model before the function runs. Exceptions are
`HTTPException` subclasses or a custom exception handler registered on the app, mapping domain
errors to status codes in one place, not scattered across route functions. Tenant scope comes from
a dependency (`Depends(get_current_workspace)`), never a path parameter trusted at face value.

## Questions to ask before working

## Q1 Does an existing entity already carry this field, or does it need a new one?
recommended: Extend the existing entity if the data belongs to something already modeled; a new
entity only when the data has its own lifecycle and its own id.
answer:

## Q2 Does this task change a response shape, status code, or pagination format a consumer already depends on?
recommended: No, additive only (new optional field, new route). If yes, flag it: this needs a
backwards-compatible change or a version, and the sdk/ui stages must update in the same change.
answer:

## Q3 Does the test for this task drive the real route, or does it call the service function directly?
recommended: The real route, through HTTP (or the framework's test client), a service-only test
can pass while the route is wired wrong.
answer:

## Q4 Is there a contract doc for this service already, or does this task start one?
recommended: Check `docs/architecture/` or the Swagger/OpenAPI output first; extend what exists
rather than starting a second doc that will drift from the first.
answer:

## Template

See `template.md` in this folder for the contract-doc entry format to fill per endpoint.

## Checklist

- [ ] `codeloop task check {id} --all-done && npm test` passes
- [ ] Every `[api]` task in `tasks.md` is ticked and traces to an acceptance line
- [ ] Every new/changed route has a test that drives the real HTTP seam, asserting the response
  body, not just the status code
- [ ] Every query is scoped by the tenant/workspace key
- [ ] Every thrown error is the project's typed exception, not a bare string or a framework
  built-in that skips the standard error envelope
- [ ] The contract doc (or Swagger annotations) names every status code the route can return
- [ ] No response shape, status code, or pagination format changed without a note to the sdk
  builder about what broke

## Done

`codeloop task check {id} --all-done && npm test` exits 0. `task check` fails while any task under
the card's `specs/{id}/tasks.md` is unticked; `npm test` (or the repo's configured test command)
must be green, including the new tests written in step 3.

## Examples

**Good.** Task: `[api] T003 [US2] Add PATCH /workspaces/:id/settings for notification prefs`.
Service function `updateSettings(workspaceId, dto)` scoped by `workspaceId`, called from a
`@Patch(':id/settings')` route behind the auth guard. Test sends a real `PATCH` request with a
bearer token, asserts `200` and the returned `notificationPrefs` object matches the DTO, then
sends the same request with a different workspace's token and asserts `404` (not `403`, the
record is invisible outside its tenant, not merely forbidden). Contract doc gains a row for the
new route with both status codes.

**Failing, and why.** Same task, implemented as `service.model.findByIdAndUpdate(id, dto)` with no
`workspaceId` in the filter, tested by calling `service.updateSettings()` directly in a unit test
with a mocked model. The test is green. The route leaks cross-tenant writes: any authenticated
caller can patch any workspace's settings by id, and nothing in the test suite would catch it,
because the test never went through the route or the tenant scope.
