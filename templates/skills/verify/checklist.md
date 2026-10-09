# verify checklist

- [ ] `codeloop verify {id}` exits 0
- [ ] Every acceptance line has at least one use case
- [ ] Every `failure_mode:` names a specific production breakage
- [ ] Every use case runs through `cli` and/or `api`, not `ui` alone
- [ ] Every use case has been watched failing once
- [ ] `--mutate` has run since the `Feature: {id}` commit and found no unresolved vacuous case
- [ ] `evidence/{nnn}/verify.md` shows `result: pass` with a row per acceptance line
- [ ] No use case asserts on something unrelated to its acceptance line (the "always green"
  smell, e.g. hitting `/health` to stand in for a feature-specific check)
