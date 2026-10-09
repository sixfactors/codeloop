---
name: test-design
stage: verify
lane: build
inputs:
  - specs/{id}/spec.md
  - src/lib/verify.ts
  - usecases/*/*.yaml (format reference)
  - .codeloop/config.yaml (deploy.<env>.base_url)
outputs:
  - usecases/{nnn}/*.yaml
check: "codeloop verify {id}"
questions: 2
---

# Test design

## Role

You are test design: for every way this card's acceptance can fail in production, you write one
use case codeloop can actually run, so `codeloop verify` proves the build instead of restating the
acceptance lines back to themselves. Good work has one use case per failure mode, each wired to a
real seam (cli or api) and watched fail once before it's trusted. Bad work has one use case per
acceptance line that only ever asserts the happy path, or a use case with no runnable layer that
can never pass no matter what the code does.

## Inputs

1. `specs/{id}/spec.md`, the `## Failure modes` list and the `acceptance:` lines. Each failure
   mode becomes exactly one use case; each use case's `accept:` must name a real `USn`.
2. `src/lib/verify.ts`, the schema this reads: `id`, `accept`, `failure_mode`, and `layers.cli`
   (`run`, `expect.exit`, `expect.stdout`) or `layers.api` (`request`, `expect.status`). A case
   passes only when `layers.length > 0` and every layer in it passes, an empty `layers: {}` always
   fails.
3. `usecases/*/*.yaml`, existing cases in this repo for the exact format; `usecases/001/` and
   `usecases/first-user/` are small enough to read whole.
4. `.codeloop/config.yaml` under `deploy.<env>.base_url`, where an `api` layer's request goes when
   the use case doesn't set its own `base_url`.

## Procedure

1. Read `specs/{id}/spec.md`'s `## Failure modes` list. Each line becomes exactly one use case; a
   failure mode with no use case is invisible to `codeloop verify --mutate`.
2. For each failure mode, pick the acceptance line it threatens. A use case with no matching
   acceptance line is noise `codeloop verify` can't place, `result.missing` only flags acceptance
   lines with zero cases, it doesn't catch a case pointed at a `USn` that doesn't exist, so get this
   right by hand.
3. Name the file `usecases/{nnn}/<slug>-<nn>.yaml`. The `id:` field inside it names the evidence
   file (`evidence/{nnn}/<id>.json`), so keep it filesystem-safe and matching the filename stem.
4. Write `accept: USn` exactly matching one of `spec.md`'s acceptance numbers.
5. Write `failure_mode:` as one sentence describing how it breaks, not how it's fixed.
6. Pick the real seam this failure mode is reachable through:
   - `layers.cli: { run: "<bash command>", expect: { exit: 0, stdout: "<substring>" } }`
   - `layers.api: { request: { method, path, body }, expect: { status } }`
   A use case with neither (`layers: {}`, or only `ui`) can trace to an acceptance line but will
   never pass `codeloop verify`, note it as manual in the checklist rather than pretend it runs.
7. Run the use case by hand before trusting it: execute the exact `run` command (or hit the exact
   `request`), and confirm the exit code and stdout you asserted are what actually happens. A case
   copied from another file without being run is a guess with YAML syntax.
8. Prove it is non-vacuous: `codeloop verify {id} --mutate` re-runs the cli use cases at the commit
   before the first `Feature: {id}` commit. A case that still passes there never depended on the
   feature; it shows up in `vacuous` and exit code 4. Run this once the first feature commit exists,
   not before.

## Questions to ask before working

```
## Q1 Is there a staging base_url configured for an api-layer case, or should everything run against local?
recommended: Use local unless the failure mode is specifically about a deployed environment (e.g. a prod-only config value); set `base_url` on the case only then.

## Q2 This failure mode is only reachable through the UI. Write a ui-only case that can't pass codeloop verify, or skip it and note it as manual?
recommended: Skip the automated case; add one line to the card's Not building or a manual-test note instead of a use case that fails verify forever by construction.
```

## Template

```
id: {nnn}-<nn>
accept: US<n>
failure_mode: "<one sentence: how this breaks, not how it's fixed>"
layers:
  cli: { run: "<bash command>", expect: { exit: 0, stdout: "<substring>" } }
```

or, for an API-reachable failure mode:

```
id: {nnn}-<nn>
accept: US<n>
failure_mode: "<one sentence>"
layers:
  api: { request: { method: "POST", path: "/api/v1/...", body: { } }, expect: { status: 200 } }
```

## Checklist

See `checklist.md`:

- [ ] one use case per failure mode line in `spec.md`, none skipped
- [ ] every use case's `accept:` matches an existing `USn` in `spec.md`
- [ ] `id:` is unique within `usecases/{nnn}/` and filesystem-safe
- [ ] every use case has at least one runnable layer (`cli` or `api`); a ui-only failure mode is noted as manual instead of written as an unrunnable case
- [ ] each case was run by hand and its asserted exit code / stdout / status observed, not guessed
- [ ] `codeloop verify {id} --mutate` has been run at least once and the case does not appear in `vacuous`

## Done

```
codeloop verify {id}
```

Exit 2 when an acceptance line has no use case. Exit 1 when any case fails. Exit 0 on a real pass,
writing `evidence/{nnn}/verify.md` and one `evidence/{nnn}/<id>.json` per case. Add `--mutate` to
also require non-vacuousness (exit 4 if any cli case still passes before the feature's first
commit, exit 5 if that commit doesn't exist yet to compare against).

## Examples

**Good**, two real cases from this repo. `usecases/001/uc-001-05-propose-promote.yaml`:

```
id: uc-001-05
accept: US5
failure_mode: "a lane changes without evidence, or with a red eval"
layers:
  cli: { run: "bash usecases/001/uc.sh us5", expect: { exit: 0, stdout: "proposal-cites-cards-promote-refused" } }
```

`usecases/first-user/first-user-01-install.yaml`:

```
id: first-user-01-install
accept: US1
failure_mode: "the package installs only because this checkout is on PATH or in node_modules, or
the tarball is missing dist/, so a stranger's `npm install -g` gets a broken codeloop"
layers:
  cli: { run: "bash scripts/first-user.sh --only install", expect: { exit: 0, stdout: "FIRST-USER PASS install" } }
```

Ran `codeloop verify 001` against the real `usecases/001/` directory: all 5 cases reported
`pass`, `result: pass (5/5 use cases, sha 527980d)`.

**Bad**, card CL-002 has three acceptance lines (US1, US2, US3) in `spec.md` and, at the time this
was checked, zero files in `usecases/002/`. Ran `codeloop verify CL-002`:

```
  acceptance line US1 has no use case in usecases/
  acceptance line US2 has no use case in usecases/
  acceptance line US3 has no use case in usecases/
```

This is exactly the state test-design exists to close: an approved spec with acceptance lines and
no way to prove any of them. A second way to fail even with files present: a use case written with
`layers: {}` (every layer commented out "for now") passes the YAML parser but never passes `verify`
- `pass = layers.length > 0 && layers.every(...)`, so zero layers is an automatic, permanent fail,
not a skip.
