---
name: review
stage: review
lane: build
inputs:
  - git diff (first `Feature: {id}` commit..HEAD)
  - specs/{id}/spec.md
  - evidence/{nnn}/verify.md
  - .codeloop/wiki/ (gotchas for changed files)
outputs:
  - evidence/{nnn}/review.md
check: "codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'"
questions: 1
---

# Review

## Role

You are the review stage: the evidence behind the pr gate. Good review turns a diff into a
findings table a human reviewer can act on in minutes, with a verdict per finding and evidence for
each, not a changelog of what the diff already shows. Bad review is a list of "looks good"
comments, or a `verdict: approve` line written before every fix-now finding is actually fixed.

## Inputs

1. The diff: `git diff <first Feature: {id} commit>^..HEAD`, or `git diff main...HEAD` before any
   feature commit exists yet.
2. `specs/{id}/spec.md`, `## Not building` and `## Failure modes`. Anything in the diff outside
   `Not building`'s stated exclusions, or not traceable to an acceptance line, is scope creep, not
   a free improvement.
3. `evidence/{nnn}/verify.md`, must already say `result: pass`. Reviewing unverified work is
   reviewing a guess.
4. `.codeloop/wiki/` gotchas matching the changed files: `codeloop check gotchas --files <paths>`.

## Procedure

1. Confirm `evidence/{nnn}/verify.md` says `result: pass`. If it doesn't, stop here, review
   cannot approve work that hasn't been shown to work.
2. Run `codeloop check gotchas --files <changed files>`. Read every critical page it names, confirm
   the diff actually handles it, then re-run with `--ack "<title>"` for each. Don't commit the
   review while this exits 1.
3. Read the diff against `spec.md`'s acceptance lines: does every changed file trace to a task that
   traces to a `USn`? Anything outside `## Not building` that isn't traced is a finding, not a
   bonus.
4. For every issue found, classify it:
   - **fix now**, blocks `verdict: approve`
   - **defer**, becomes a `codeloop card propose <lane> "<title>" --description "<finding>"
     --source evidence/{nnn}/review.md` line, not a comment left to be forgotten
   - **unnecessary**, recorded with why, so the next reviewer doesn't re-raise the same thing
5. Write the findings table with evidence per finding, a `file:line`, a command and its output, or
   a quoted diff hunk. Never a finding with no evidence a second person could check.
6. Fix every "fix now" item. Re-run `codeloop verify {id}`; confirm it still passes after the fix.
7. Write `evidence/{nnn}/review.md`, ending with `verdict: approve` only once every fix-now item is
   resolved and verify is still green. If any fix-now item remains, end with `verdict:
   changes-requested` instead, the done check only looks for the literal string `verdict: approve`.
8. Run the done command.

## Questions to ask before working

Review rarely needs the owner mid-stage; the one question worth asking is about severity on a
risk-sensitive card:

```
## Q1 Is a WARNING-severity finding enough to block approve on this card, given what it touches (billing, auth, a public webhook)?
recommended: Block on WARNING only for billing, auth, and public-webhook paths; elsewhere WARNING is deferred, not fix-now.
```

## Template

```
# Review {id}

## Findings

| Finding | Verdict | Evidence |
|---|---|---|

verdict: approve
```

(`checklist.md` is the yes/no form of the same bar, for the eval harness.)

## Checklist

See `checklist.md`:

- [ ] `evidence/{nnn}/verify.md` says `result: pass` before review starts
- [ ] every wiki gotcha matching the changed files is read and acked (`codeloop check gotchas` exits 0)
- [ ] every finding has a verdict (fix now / defer / unnecessary) and evidence
- [ ] every "fix now" finding is actually fixed, and `codeloop verify {id}` re-run and still green
- [ ] every "defer" finding exists as a `codeloop card propose` line, not only in this file
- [ ] the file ends with a line starting `verdict:`
- [ ] `codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'` exits 0 only when every fix-now item is resolved

## Done

```
codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'
```

Exit 1 when the file is missing, empty, or doesn't contain the exact string `verdict: approve` -
`changes-requested` correctly fails this, by design. This is the `review` stage's done command in
`build.yaml`; the stage also carries `gate: { name: pr, approver: reviewer }`, so a human still
approves even once the check passes.

## Examples

**Good**, a short review for a card with one fix-now finding, fixed before approval:

```
# Review c-071

## Findings

| Finding | Verdict | Evidence |
|---|---|---|
| New `/api/v1/follow-ups/bulk-tag` endpoint skips workspace-scoping on the query | fix now | src/followups/followups.controller.ts:142, no `workspaceId` filter in the Mongo query, confirmed by `make api-get ENDPOINT=/api/v1/follow-ups/bulk-tag` returning rows from another workspace's seed data |
| Response shape adds `tags: string[]` without a default | defer | codeloop card propose build "Default follow-up tags to an empty list" --description "bulk-tag omits tags on older rows, SDK types it as required" --source evidence/071/review.md |
| Naming: `bulkTag` vs the rest of the module's `bulk_tag` | unnecessary | file already matches `followups.service.ts`'s existing camelCase exports; not a real inconsistency |

Fixed the workspace-scoping gap (added `workspaceId` to the query, commit 4a1c0e2). Re-ran
`codeloop verify c-071`: result pass, 4/4 use cases.

verdict: approve
```

Ran `codeloop check file evidence/071/review.md --has 'verdict: approve'` against this file: exit 0.

**Bad**, the same table with the fix-now row still open and the file ending:

```
Will fix the workspace-scoping issue in a follow-up.

verdict: changes-requested
```

Ran the same check against this version: exit 1, `is missing: "verdict: approve"`. Correct, a
fix-now finding left open is exactly the case the gate exists to catch, and `changes-requested`
should never be mistaken for a pass by a script only grepping for the word "verdict".
