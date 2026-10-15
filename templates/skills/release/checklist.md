# release checklist

- [ ] `{evidence}/verify.md` said `result: pass` before staging deploy started
- [ ] Staging deploy ran; `codeloop verify {id} --env staging --no-record` ran; broader staging
  smoke test ran
- [ ] `{evidence}/staging.md` has `result: pass`
- [ ] Rollback command named and confirmed available before any prod deploy
- [ ] Outward gate approval was explicit before the prod deploy command ran
- [ ] Prod deploy ran; `codeloop verify {id} --env production --no-record` ran (read-only or
  self-cleaning use cases only); broader prod smoke test ran
- [ ] `{evidence}/prod.md` has `result: pass`
- [ ] Any failure at either hop is recorded as `result: fail` with cause, and rollback was run
