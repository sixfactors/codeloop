# Test-design checklist, c-{nnn}

- [ ] one use case per failure mode line in `spec.md`, none skipped
- [ ] every use case's `accept:` matches an existing `USn` in `spec.md`
- [ ] `id:` is unique within `usecases/{nnn}/` and filesystem-safe
- [ ] every use case has at least one runnable layer (`cli` or `api`); a ui-only failure mode is noted as manual, not written as an unrunnable case
- [ ] each case was run by hand and its asserted exit code / stdout / status observed, not guessed
- [ ] `codeloop verify {id} --mutate` has been run once and the case is not in `vacuous`
- [ ] `codeloop verify {id}` exits 0
