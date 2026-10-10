---
name: interview
stage: spec
lane: build
inputs:
  - specs/{id}/research.md
  - specs/{id}/spec.md (draft, if scaffolded)
  - specs/{id}/interview.md (if one is already open)
  - src/lib/interview.ts
outputs:
  - specs/{id}/interview.md
check: "codeloop spec check {id}"
questions: 5
---

# Interview

## Role

You are the interview stage: the last human decision point before `spec.md` and `tasks.md` get
written. Good work asks the five questions whose answers would change what gets built, scope,
acceptance, risk, boundary, and at most one more, each with a recommended answer the owner can
take by just saying so. Bad work asks five questions whose answers are already obvious from
`research.md`, or asks a question and then never folds the answer into `spec.md`.

## Inputs

1. `specs/{id}/research.md`, the verdict and the pain. Don't re-ask what research already
   answered.
2. `specs/{id}/spec.md`, if scaffolded, draft every field mentally first; a question exists only
   where the draft has a genuine fork.
3. `specs/{id}/interview.md`, if one already exists, read what's open before adding more;
   `addQuestions` refuses past five total.
4. `src/lib/interview.ts`, the format it parses: `## Q<n> <question>` then `recommended:` and
   `answer:` lines, nothing else. `MAX_QUESTIONS = 5` is enforced there, not just a convention.

## Procedure

1. Read the card and its research verdict: `codeloop card show {id}`.
2. Draft `spec.md`'s fields in your head, story, feature, size, metric, done_when, acceptance.
   Mark every field where more than one answer is plausible.
3. For each uncertain field, write one question in one of four categories:
   - **scope**, what is and isn't in this card (feeds "Not building")
   - **acceptance**, what proves it, in which layer (feeds the `USn` lines)
   - **risk**, the riskiest assumption, and what guards it (feeds "Failure modes")
   - **boundary**, where this card's slice ends and the next one starts (feeds `size` and split)
   A fifth question outside these four is allowed only when it would otherwise block every other
   answer (e.g. "which of two conflicting docs is current").
4. Give every question a `recommended:` answer, your best default. The owner may not reply before
   the card needs to move; the recommended answer is what gets taken on `--accept`, and a question
   with no recommended answer has nothing an owner in a hurry can accept.
5. Write them in one file, not one at a time: `codeloop ask {id} --file <path>`, where `<path>` is a
   markdown file with the `## Qn` blocks (see `template.md`). One call keeps the numbering clean.
6. Wait for answers. Read them back with `codeloop card show {id}` or by reading
   `specs/{id}/interview.md` directly, `writeAnswer` records each as a human event on the card.
7. Fold every answered question into `spec.md` before the spec stage starts. An answer that never
   reaches `spec.md` was pointless to ask, the spec stage reads `spec.md`, not `interview.md`.
8. An unanswered question blocks nothing by itself, but the field it was asked about stays a guess
   in `spec.md`; `codeloop spec check` doesn't know a field is unresolved, so a human has to notice.

## Questions to ask before working

This section is the skill's own output format, worked for a real card, c-058, "Small fixes skip
the ceremony", through `codeloop ask c-058 --file`:

```
## Q1 Scope: which stages does a trivial card skip: research, spec and the spec gate only, or also the review/pr gate? And is anything about epics or splitting in here?
recommended: Skip research, spec and the spec gate; keep build, verify (local gate) and review (pr gate). Prod gate unchanged. Splitting and epics stay in c-060.
answer:

## Q2 Who sets size: the agent's investigate stage alone, the founder at `card new`, or agent proposes and the founder's first gate confirms?
recommended: Agent proposes `size:` in the investigate stage; founder can override with `card new --size`; a trivial sizing is shown in the local gate note ("size: trivial, skipped research/spec") so Dean sees it once.
answer:

## Q3 Acceptance: what proves it, and on which real card do we dogfood it?
recommended: Dogfood on a real one-line fix in codeloop. Given a card sized trivial, when `codeloop run`, then no research.md or spec.md exists, events show create -> build -> verify in one run, and `codeloop stats` shows trivial cycle time under one hour.
answer:

## Q4 Riskiest assumption: the agent calls an M card trivial to dodge the spec gate. Diff cap, founder confirm, or trust?
recommended: Hard cap: trivial = at most 3 files and 50 changed lines, enforced by `check diff` at verify; over the cap the card is re-sized to S and parked at the spec gate.
answer:

## Q5 Sizes: add `trivial` below S, or keep the story standard's S/M/L and let S skip?
recommended: Add `trivial` as a fourth size (one row in the story standard); stages carry `when: size >= S` in build.yaml.
answer:
```

Q1 is scope, Q2 is boundary (who decides, where the line sits), Q3 is acceptance, Q4 is risk, Q5 is
the one extra, here it's load-bearing because Q1–Q4's answers all depend on whether `trivial` is a
real size or a shortcut, so it earns the fifth slot.

## Template

See `template.md`, the bare `## Q<n>` / `recommended:` / `answer:` block, ready for
`codeloop ask {id} --file`.

## Checklist

See `checklist.md`:

- [ ] at most 5 questions in the file
- [ ] every question has non-empty text and a non-empty `recommended:`
- [ ] each question is tagged (in your own notes, not the file) scope, acceptance, risk, or boundary, a fifth "other" is justified, not a habit
- [ ] every question already answered in `interview.md` is reflected in `spec.md`'s fields
- [ ] no question restates something `research.md` already settled

## Done

There is no standalone `codeloop check interview`, the engine enforces the file's shape
(`MAX_QUESTIONS`, the `## Qn` format) at write time in `addQuestions`/`writeAnswer`, not as a lane
gate. The real proof this stage did its job is downstream:

```
codeloop spec check {id}
```

Every field this skill was meant to resolve is a field `spec check` reads; an interview that asked
the right questions but never updated `spec.md` still fails the spec stage, just for a reason that
looks like a spec problem instead of an interview one. Check `codeloop card show {id} --json` for
`openQuestions` if `spec check` fails and you're not sure whether an answer went missing.

## Examples

**Good**, c-058's `interview.md` above: five questions, one per category plus one load-bearing
extra, each with a recommended answer, written in one `--file` call.

**Bad**, a sixth question appended to that file. `addQuestions` in `src/lib/interview.ts` throws:

```
RefusalError: 6 questions would be on c-058, the limit is 5: ask only what changes the build
```

Also bad: Q2 above with no `recommended:` line. `writeAnswer`'s `--accept` path reads
`q.recommended`; an empty string means `--accept` has nothing to take, so the owner is forced to
type a full answer for a question the asker should have defaulted.
