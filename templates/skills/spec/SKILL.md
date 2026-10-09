---
name: spec
stage: spec
lane: build
inputs:
  - docs/story-standard.md
  - specs/{id}/research.md
  - specs/{id}/interview.md
  - templates/spec/spec.md
  - templates/spec/tasks.md
  - .codeloop/config.yaml (personas)
outputs:
  - specs/{id}/spec.md
  - specs/{id}/tasks.md
check: "codeloop spec check {id}"
questions: 2
---

# Spec

## Role

You are the spec stage: you turn an answered interview and a research verdict into a card that
reads the same to a founder, a builder and an agent, and a `tasks.md` an agent can execute without
asking what "it" refers to. Good work has a title that says what the user can now do, a story with
all three parts, acceptance a user would notice, and tasks each traceable to one of those
acceptance lines. Bad work is a title naming the mechanism, an acceptance line with no task, or a
task with no layer tag, each one is a named failure the check catches, not a style complaint.

## Inputs

1. `docs/story-standard.md`, the whole standard this stage is graded against: title check, the
   three-part story, INVEST, acceptance format, size and split, one metric, `done_when`.
2. `specs/{id}/research.md`, the verdict and the grounded pain; the story's "so that" comes from
   here, not from imagination.
3. `specs/{id}/interview.md`, every answered question. An unresolved one means a field in
   `spec.md` is still a guess.
4. `templates/spec/spec.md`, `templates/spec/tasks.md`, the skeletons `codeloop spec new` writes;
   fill them in, don't restructure them.
5. `.codeloop/config.yaml` under `personas:`, the repo's personas on top of the built-in six
   (founder, builder, reviewer, dev, visitor, team). A persona not in this list fails the check.

## Procedure

1. Confirm every interview question is answered or explicitly accepted. An open question means the
   field it covers is still a guess, resolve it before writing that field, don't guess around it.
2. Write the title: a verb phrase naming what the user can now do, at most 12 words, no backtick,
   `--`, `:`, `.yaml`, `.md`, `/`, `()`, and no camelCase token. "Small fixes skip the ceremony", not
   "Size-adaptive lanes: investigate stage sets size".
3. Write `Story: As a <persona>, I can <what>, so that <pain relieved>.` The persona must be one of
   the known list. The "so that" is required, no outcome, no card.
4. Set `feature:` (the capability this card slices), `initiative:` (the wiki page it serves),
   `size:` (S hours, M a day or two, L three-plus or needs design, split an L before it reaches
   this gate), `metric:` (the one stage metric this card moves; `no-data` means instrument first,
   not guess).
5. Write `done_when:`, a command that exits 0, or a screen a person opens. Never "all stories
   complete".
6. Write `acceptance:`, 1 to 5 lines, `- USn Given <state>, when <action>, then <result>.` Each
   line is something a user would notice through a real seam (API, SDK, CLI, UI). Six lines means
   split the card, not trim the list.
7. Write `screens:`, one name per screen the mock should draw, or `screens: none` when there's
   nothing to draw.
8. Write `## Not building`, what this card deliberately leaves out. A task not traceable to an
   acceptance line fails `spec check --strict`, and an exclusion not written here is the most common
   reason a reviewer finds scope creep later.
9. Write `## Failure modes`, the ways this breaks in production. This list becomes the test-design
   stage's input one-for-one; write it as failure modes, not as a restatement of the acceptance
   lines.
10. Write `tasks.md`, up to 8 lines, `- [ ] Tnnn [P]? [USn] [layer] <what, naming the file>`, layer
    one of `api | sdk | ui | test | docs`. Order backend before SDK before UI (the DRY onion). Every
    acceptance line needs at least one task; every task needs exactly one layer tag.
11. Run the done command and fix every reported error before the spec gate is asked.

## Questions to ask before working

Most of what spec needs should already be answered by the interview stage. Ask only when something
genuinely new surfaces while writing the file itself, usually a size or metric boundary that only
becomes visible once acceptance is written out:

```
## Q1 Writing the acceptance lines turned up a fourth user-visible behavior beyond the three the interview covered. Fold it into this card, or split it off?
recommended: Fold it in only if it shares a done_when and doesn't push the line count past 5; otherwise split it into a sibling story with split_from set.

## Q2 The size looks closer to L once tasks.md is drafted. Split now, or accept L and route through SPIDR later?
recommended: Split now with SPIDR (paths, interfaces, data, rules, spike) into 2-3 sibling stories under the same feature; an L card can't pass the spec gate unsplit anyway.
```

## Template

`spec.md` (mirrors `templates/spec/spec.md`):

```
# {{id}} spec: {{title}}

Story: As a <persona>, I can <what>, so that <pain relieved>.

feature: <capability this card is a slice of>
initiative: <wiki/initiatives/<slug>.md>
size: S | M | L
metric: <the one stage metric this card moves>
done_when: <a command that exits 0, or a screen a person opens>

acceptance:
- US1 Given <state>, when <action>, then <result>.

screens:

## Not building

-

## Failure modes

-
```

`tasks.md` (mirrors `templates/spec/tasks.md`):

```
# {{id}} tasks: {{title}}

- [ ] T001 [P] [US1] [api] What to do, naming the file
```

## Checklist

See `checklist.md`:

- [ ] title ≤ 12 words, no `` ` `` `--` `:` `.yaml` `.md` `/` `()`, no camelCase token
- [ ] story has all three parts: persona, "I can", "so that"
- [ ] persona is in the known list (built-in six, plus `.codeloop/config.yaml` `personas:`)
- [ ] `size:` is S, M, or L; an L is split before the spec gate
- [ ] `metric:` is present and defined under the lane or in `wiki/numbers/`
- [ ] `done_when:` is a command or a screen, never "all stories complete"
- [ ] `acceptance:` is 1–5 lines, each starting `Given`, containing `when` and `then`
- [ ] `screens:` names match the mock's `data-screen` sections, or says `screens: none`
- [ ] every acceptance line has at least one task in `tasks.md`
- [ ] every task has exactly one layer tag and no task is untraceable to an acceptance line
- [ ] `codeloop spec check {id}` exits 0

## Done

```
codeloop spec check {id}
```

Exit 2 on a malformed story, a missing size/metric/`done_when`, an unsplit L, an acceptance line
with no task, or a task missing its layer tag. The stage also carries `gate: { name: spec, approver:
owner }` in `build.yaml`, the check passing is necessary, not sufficient; the founder still
approves before build starts.

## Examples

**Good**, `specs/002-readme-matches-the-lane-engine-the-site/spec.md` and `tasks.md` (card
CL-002), real files:

```
# CL-002 spec: The README describes the product that ships

Story: As a visitor, I can read the README and the site and find the same product, so that I
trust the install.

feature: Install and first run
initiative: wiki/initiatives/any-stack-same-loop.md
size: S
metric: install after visit
done_when: `bash scripts/readme-quickstart.sh` exits 0 in an empty folder

acceptance:
- US1 Given the npm page or the repo, when I read the first screen, then I see the same three
sentences and the same lane diagram as codeloop.protobox.ai.
- US2 Given a clean folder, when I follow the quickstart top to bottom, then `codeloop inbox`
prints a board with one card and no errors.
- US3 Given the README, when I look for the three most common things, then I find start a card,
answer the inbox, and approve a gate, each as one command.

screens: none

## Not building

- A docs site. The README links to the site; docs stay in docs/.
- Any mention of the ten old commands. They are stages inside lanes now.

## Failure modes

- Quickstart names a command that does not exist in 0.3.0.
- README and site drift again after the next release: the site build copies the README's first
section, or a test diffs them.
```

```
# CL-002 tasks

- [ ] T001 [US1] [docs] Rewrite README.md: what it is, lane diagram, three sentences matching
site/app/page.tsx
- [ ] T002 [US2] [docs] Quickstart: npm i -g, init, start, inbox, approve; nothing else
- [ ] T003 [US2] [test] scripts/readme-quickstart.sh runs the quickstart in a temp dir and fails
on any non-zero exit
- [ ] T004 [US3] [docs] "Three things" section: start a card, answer the inbox, approve a gate
- [ ] T005 [US1] [test] Test that the README's first section and the site's hero copy are identical
```

Ran `codeloop spec check CL-002` against these files: exit 0, output `specs/002-readme-matches-the-
lane-engine-the-site ok: 5 tasks, 0 done`.

**Bad**, an acceptance block with six lines (`US1`..`US6`) and a sixth task written as
`- [ ] T006 Add a loading spinner` with no `[USn]` and no `[layer]` tag. `codeloop spec check` fails
twice: the card should have been split before reaching six acceptance lines, and the untagged task
can't be traced to a layer or an acceptance line, so it fails `spec check --strict`'s "every task
traceable" rule silently carrying scope the card never approved.
