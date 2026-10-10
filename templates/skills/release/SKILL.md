---
name: release
stage: staging
lane: build
inputs:
  - .codeloop/config.yaml
  - "evidence/{nnn}/verify.md (the verify stage's pass result)"
  - "the card's Feature: {id} commit(s)"
outputs:
  - evidence/{nnn}/staging.md
  - evidence/{nnn}/prod.md
check: "codeloop check file evidence/{nnn}/staging.md --has 'result: pass' (staging); codeloop check file evidence/{nnn}/prod.md --has 'result: pass' (live, behind the prod outward gate)"
questions: 4
---

# release

Take a verified card to staging, then to production, through the outward gate, with a smoke test
at each hop and evidence that says `result: pass` in writing. The `live` stage's gate is
`outward: true`, it is asked *before* the stage runs, not after, so the card sits parked at
`staging` until the owner approves going further. Know the rollback line before pushing the
button, not after something breaks.

## Role

The builder working the `staging` and `live` stages of `build.yaml`, after `verify` passed. The
`prod` gate's approver is the owner (per `build.yaml`'s `gate: { name: prod, approver: owner,
outward: true }`), this skill prepares everything the owner needs to approve quickly, it does not
grant itself the approval.

## Inputs

- `.codeloop/config.yaml`, `deploy.staging` / `deploy.production` (or `deploy.prod`): the deploy
  command and the base URL verify uses for `--env staging` / `--env production`.
- `evidence/{nnn}/verify.md`, confirm it says `result: pass` before deploying anything. Deploying
  a card that hasn't passed `verify` is deploying unverified code.
- The commit(s) carrying `Feature: {id}`, what's actually shipping, and what the rollback target
  is (the commit immediately before the first one).

## Procedure

1. **Confirm verify passed.** Read `evidence/{nnn}/verify.md`; if it doesn't say `result: pass`,
   stop and go back to the `verify` stage.
2. **Deploy to staging** with the project's configured staging deploy command.
3. **Run the use cases against staging**: `codeloop verify {id} --env staging --no-record` (or
  with `--record` if the project wants staging evidence folded into the card). This re-runs every
  `cli`/`api` use case against `deploy.staging.base_url` instead of local.
4. **Run the smoke test** beyond the card's own use cases, the project's broader staging health
  check (auth flow, core routes, whatever the repo's smoke-test command covers). A card can pass
  its own use cases while something it touched breaks a different path.
5. **Write `evidence/{nnn}/staging.md`**:
   ```markdown
   result: pass | fail
   sha: <commit>
   env: staging
   deployed: <timestamp>
   smoke: <what ran, and its result>
   ```
   `result: pass` is the literal string the gate's `codeloop check file ... --has 'result: pass'`
   looks for.
6. **Stop at the outward gate.** `live`'s gate is asked on entry, before the stage runs. Do not
   deploy to production without the owner's explicit go, present the staging evidence and the
   rollback plan, then wait.
7. **Know the rollback line before deploying to prod**, not after: the exact command (a Fly
   rollback, a Vercel instant-rollback, a git-revert-and-redeploy, whatever the project uses) and
   what state it returns to.
8. **Deploy to production** once approved.
9. **Run the use cases against production**: `codeloop verify {id} --env production --no-record`
  (verifying against live data without mutating it, read-only use cases only, or ones that clean
  up what they create).
10. **Run the production smoke test.**
11. **Write `evidence/{nnn}/prod.md`** in the same shape as step 5, `env: prod`.
12. **If either environment's use cases or smoke test fail**: do not write `result: pass`. Write
   `result: fail` with what broke, roll back using the line from step 7, and send the card back to
   `build` (or wherever the failure traces to) rather than forcing the gate.

## Stack notes

**Fly.io.** Deploy command is typically `fly deploy`; rollback is `fly releases` +
`fly releases rollback <version>` or re-deploying the previous image. Staging and prod are usually
separate Fly apps, confirm the deploy command targets the right one via its config/app name, not
by trusting the command's name alone.

**Vercel.** Deploy is a `git push` to the branch Vercel watches, or `vercel deploy --prod`;
rollback is "promote a previous deployment" in the Vercel dashboard or CLI, effectively instant,
no rebuild needed. This gives staging/prod a faster, lower-risk rollback than a rebuild-based
platform.

**npm/PyPI (SDK/CLI packages).** "Deploy" is `publish`; there is no rollback in the usual sense -
a published version is permanent. The equivalent safety net is: verify against a local link/install
of the built package before publishing, since a bad publish can only be followed by a new, higher
version, never un-published cleanly.

**Self-hosted / Docker Compose / bare VM.** Deploy command is whatever the project's own script
does (pull image, restart service); rollback is re-running that script against the previous image
tag. Confirm the previous tag is still available before deploying the new one, don't learn this
mid-incident.

## Questions to ask before working

## Q1 Does evidence/{nnn}/verify.md say result: pass?
recommended: If not, stop; do not deploy unverified code to staging.
answer:

## Q2 What is the rollback command for this project's platform, confirmed before touching production?
recommended: Name the exact command (fly releases rollback, vercel promote <deployment>, git
revert + redeploy, etc.) in the staging evidence, so it's on hand if prod needs it minutes later.
answer:

## Q3 Do any of this card's use cases mutate data in a way that's unsafe to run against production?
recommended: Prefer read-only use cases for the production pass; if a use case must create data,
confirm it cleans up after itself, or skip it in prod and rely on the broader smoke test instead.
answer:

## Q4 Who is the outward gate's approver, and have they seen the staging evidence?
recommended: The card's configured owner approver; don't deploy to prod on an implicit go, show
the staging.md result and wait for the explicit approval the gate records.
answer:

## Template

See `template.md` in this folder for the `staging.md` / `prod.md` evidence skeleton.

## Checklist

- [ ] `evidence/{nnn}/verify.md` said `result: pass` before any deploy started
- [ ] Staged: deploy command ran, use cases ran with `--env staging`, broader smoke test ran
- [ ] `evidence/{nnn}/staging.md` written with `result: pass` and the literal string the gate
  checks for
- [ ] Rollback command identified and recorded before touching production
- [ ] The outward gate's approval was explicit, not assumed, before any prod deploy command ran
- [ ] Prod: deploy command ran, use cases ran with `--env production` (read-only, or
  self-cleaning), broader smoke test ran
- [ ] `evidence/{nnn}/prod.md` written with `result: pass`
- [ ] Any failure at either hop was written as `result: fail` with what broke, and rolled back -
  never silently retried until green

## Done

Staging: `codeloop check file evidence/{nnn}/staging.md --has 'result: pass'` exits 0. Production
(behind the `prod` outward gate): `codeloop check file evidence/{nnn}/prod.md --has 'result: pass'`
exits 0. Both are literal substring checks on the file, the file must exist, be non-empty, and
contain the string `result: pass`.

## Examples

**Good.** `evidence/012/staging.md`:
```markdown
result: pass
sha: a1b2c3d
env: staging
deployed: 2026-10-09T14:02:00Z
smoke: `make staging-health && make test-auth`, both green; `codeloop verify c-012 --env staging
--no-record`, 3/3 use cases passed
rollback: `fly releases rollback` to the release before this deploy, app chanl-platform-staging
```
Owner reviews this, approves the outward gate, prod deploy follows the same shape, and
`evidence/012/prod.md` lands with `result: pass` only after both the card's own use cases and the
platform's broader smoke test passed against the live environment.

**Failing, and why.** `evidence/012/staging.md` written as `result: pass` right after the deploy
command exited 0, with no use-case run and no smoke test, the deploy succeeding is not the same
as the feature working on staging. The card proceeds to the prod gate on a false signal; the
cross-tenant bug `verify` was supposed to catch locally never got re-checked against the staging
environment's actual config, and ships.
