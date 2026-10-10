# sdk checklist

- [ ] `codeloop task check {id} --all-done && npm test` passes
- [ ] Every `[sdk]` task in `specs/{id}/tasks.md` is ticked
- [ ] Type declared once in the SDK's shared types, re-exported from the hooks file
- [ ] Client method calls the HTTP client only, no UI import, no app-specific branching
- [ ] Envelope unwrapping reuses the shared function; nothing hand-parses a response
- [ ] One query key factory per entity, exported and reused everywhere that entity is queried
- [ ] Every mutation invalidates the keys it affects
- [ ] If a CLI exists, the change is reachable from it, and the command was actually run against a
  real backend (not asserted from reading the code)
- [ ] No raw `fetch`/`axios` or duplicate type left in app code where a hook should sit
- [ ] The gate is demonstrated: a real call through the new hook/client method returned typed
  data matching the api stage's contract, with the command or test output recorded
