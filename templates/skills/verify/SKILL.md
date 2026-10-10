---
name: verify
stage: verify
lane: build
inputs:
  - specs/{id}/spec.md
  - "usecases/{nnn}/*.yaml (one per acceptance line, written or extended this stage)"
  - src/lib/verify.ts
outputs:
  - "usecases/{nnn}/uc-*.yaml, one per acceptance line"
  - "evidence/{nnn}/verify.md"
  - "evidence/{nnn}/<uc-id>.json, one per use case"
check: "codeloop verify {id}"
questions: 3
---

# verify

Write one use case per acceptance line, run it through the real seam (`cli` and/or `api` layer,
never a mocked call standing in for either), and let `codeloop verify {id}` produce the evidence.
A use case that was never watched failing is not yet a use case, this stage's `--mutate` pass
exists to prove that.

## Role

The builder working the `verify` stage, after `build` passed. One failure mode, one use case. The
failure modes come from the card's `spec.md` "Failure modes" section and the acceptance lines
(`US1`...`US5`), every acceptance line needs at least one use case, or `codeloop verify` exits 2
with "an acceptance line has no use case."

## Inputs

- `specs/{id}/spec.md`, acceptance lines and the "Failure modes" list.
- `usecases/{nnn}/`, existing use case files for this card, if any (the directory name is the
  card's number, zero-padded).
- `src/lib/verify.ts`, what the runner actually does: loads every `.yaml` in `usecases/{nnn}/`,
  runs each one's `cli` layer (a shell command) and/or `api` layer (an HTTP request) against the
  configured `base_url`, and fails the whole run if any acceptance line has no use case, or if any
  use case's layers don't all pass.

## Procedure

1. **List the acceptance lines** from `spec.md`. For each one with no `usecases/{nnn}/*.yaml`
   whose `accept:` field names it, write one.
2. **Name the failure mode first.** Before writing the use case's `run`/`request`, write its
   `failure_mode:`, the specific way this acceptance line breaks in production if the feature is
   wrong. "the endpoint returns 500" is not a failure mode; "a cross-tenant request returns another
   workspace's settings" is.
3. **Pick the layer(s).** `cli` for anything a command line can drive and assert on exit code and
   stdout; `api` for a direct HTTP request asserting on status code. Use both when the card ships
   both a CLI path and an API consumer for the same acceptance line. `ui` layers are declared but
   not run by `codeloop verify` today, don't rely on one alone to prove an acceptance line; pair
   it with a `cli` or `api` layer, or note in the use case that UI coverage is manual.
4. **Write the YAML.**
   ```yaml
   id: uc-{nnn}-{seq}
   accept: US{n}
   failure_mode: "<the specific way this breaks>"
   layers:
     cli: { run: "<command>", expect: { exit: 0, stdout: "<substring>" } }
     # and/or:
     api: { request: { method: GET, path: "/..." }, expect: { status: 200 } }
   ```
5. **Run `codeloop verify {id}` locally.** Confirm the new use case passes for the right reason -
   read its `evidence/{nnn}/<uc-id>.json` and check the `layers` output, not just the exit code.
6. **Prove it can fail.** Temporarily break the feature (revert the fix, or hand-edit the
   assertion to something the current code can't satisfy) and re-run. A use case that stays green
   when the feature is broken is not testing anything, fix the use case, not the feature, when
   this happens.
7. **Run `--mutate` once the card's first `Feature: {id}` commit exists.** This re-runs every
   `cli` use case at the commit *before* that trailer, in a disposable worktree. Any use case that
   still passes there never depended on the feature, it's vacuous. Exit code 4 means at least one
   vacuous use case was found; fix or remove it, don't ignore the list.
8. **Read `evidence/{nnn}/verify.md`** after a full run, it has the acceptance-to-use-case table
   the stage's gate reads. Confirm every acceptance line has a row and every row says `pass`.
9. **If `--mutate` can't run** (exit 5, no commit carries the `Feature:` trailer yet, or the
   environment setup command failed on the base commit), that's a signal to commit with the
   trailer before closing this stage, not to skip the mutation check.

## Stack notes

The runner itself is stack-neutral, it shells out (`cli`) or calls `fetch` (`api`). What differs
per stack is what the `cli` use case actually runs and what `--mutate`'s setup command needs:

**Node/NestJS/Next.js.** Default `--mutate` setup is `npm ci && npm run build --if-present`
(configurable via `verify.setup` in `.codeloop/config.yaml`). `cli` use cases typically run the
project's own CLI or an `npm run` script; `api` use cases hit the dev server's port.

**Python/FastAPI.** Set `verify.setup` to the project's install step (`pip install -e .` or
`poetry install`), since the default Node-oriented setup won't run. `cli` use cases run the
project's console-script entry point or `python -m`; `api` use cases hit the Uvicorn dev server.

**Go.** Set `verify.setup` to `go build ./...` (or omit it if the binary needs no build step
before the use case's `cli` command runs it directly).

## Questions to ask before working

## Q1 Does every acceptance line already have a use case, or is this stage starting from zero?
recommended: Check `usecases/{nnn}/` first; extend what's there rather than rewriting use cases
that already pass for the right reason.
answer:

## Q2 Can this failure mode be proven with a cli or api layer, or does it only show up in the UI?
recommended: Prefer cli/api, they're what the runner actually executes. If the failure is
UI-only, pair a cli/api use case that catches the underlying data bug with a note that visual
coverage is manual.
answer:

## Q3 Has --mutate been run since the card's Feature: {id} commit landed?
recommended: Yes, before calling this stage done, a use case not yet proven to fail is not yet
verified.
answer:

## Template

See `template.md` in this folder for the use case YAML skeleton.

## Checklist

- [ ] `codeloop verify {id}` exits 0
- [ ] Every acceptance line in `spec.md` has at least one use case naming it in `accept:`
- [ ] Every use case's `failure_mode:` names a specific production breakage, not a generic
  "it fails"
- [ ] Every use case runs through `cli` and/or `api`, no use case relies on a `ui` layer alone
- [ ] Each use case was watched failing once (reverted fix, or a temporarily wrong assertion)
  before being trusted
- [ ] `--mutate` has been run since the card's `Feature: {id}` commit exists, and found no
  vacuous use case (or any found were fixed, not left as "known vacuous")
- [ ] `evidence/{nnn}/verify.md` shows `result: pass` and a row for every acceptance line

## Done

`codeloop verify {id}` exits 0. It exits 2 if any acceptance line has no use case or `spec.md` has
no acceptance lines; 1 if any use case failed; 4 if `--mutate` found a vacuous use case; 5 if
`--mutate` could not run. Read `evidence/{nnn}/verify.md` for the table backing the stage's gate
(`codeloop check file evidence/{nnn}/verify.md --has 'result: pass'` is what the lane actually
checks).

## Examples

**Good.** Acceptance line `US2: Given a user in workspace A, when they request workspace B's
settings, then they get a 404`. Use case:
```yaml
id: uc-012-02
accept: US2
failure_mode: "a cross-tenant request returns another workspace's settings instead of 404"
layers:
  api: { request: { method: GET, path: "/workspaces/{B}/settings" }, expect: { status: 404 } }
```
Run with the tenant-scope filter temporarily removed from the service query: the use case goes
red (200 with workspace B's real data). Restored, it's green. `--mutate` confirms the commit
before `Feature: c-012` also returns 404 here only because the route didn't exist yet (expected -
a 404 for "route not found" and a 404 for "scoped out" are different failures, so this use case
additionally asserts the response body carries no `notificationPrefs` field, distinguishing the
two).

**Failing, and why.** Same acceptance line, use case written as
`{ api: { request: { method: GET, path: "/health" }, expect: { status: 200 } } }`, passes every
run regardless of whether tenant scoping works, because it never exercises the code path the
acceptance line is about. `codeloop verify` reports `pass`, the stage's gate is green, and the
cross-tenant leak ships.
