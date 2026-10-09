# api checklist

Reviewer-facing. Pull this into a PR description or run it by eye before handing off to `sdk`.

- [ ] `codeloop task check {id} --all-done && npm test` passes
- [ ] Every `[api]` task in `specs/{id}/tasks.md` is ticked
- [ ] Every ticked task traces to an acceptance line in `specs/{id}/spec.md`
- [ ] Every new/changed route has a test driving the real HTTP seam (not a service-only unit test
  standing in for it)
- [ ] Every test asserts the response body shape, not only the status code
- [ ] Every query is scoped by the tenant/workspace key, tested with a second tenant's token
  returning 404 (or the service's chosen not-found-vs-forbidden convention), not 200
- [ ] Every thrown error is the project's typed exception class, producing the standard error
  envelope, not a bare `throw new Error()` or a framework built-in that skips it
- [ ] No `doc.save()` / unscoped `update()`, atomic scoped updates only
- [ ] Contract doc updated with the request shape, response shape, and every status code the
  route can return
- [ ] Any response-shape, status-code, or pagination-format change is flagged as breaking, with a
  note to the `sdk` and `ui` builders about what must update in the same card
- [ ] `research.md`'s `exists:` verdict was checked before writing new code, nothing was rebuilt
  that already existed
