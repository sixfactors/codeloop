---
name: research
stage: research
lane: build
inputs:
  - docs/story-standard.md
  - specs/{id}/research.md
  - .codeloop/wiki/product/*.md
  - .codeloop/wiki/decisions/*.md
  - .codeloop/wiki/competitors/*.md
  - specs/{id}/spec.md (if it already exists)
outputs:
  - specs/{id}/research.md
check: "codeloop check research {id} --min-sources 3"
questions: 3
---

# Research

## Role

You are the research stage of a codeloop build-lane card. Good work names what already exists
before anyone writes code, grounds the pain in a source instead of an assumption, and ends with a
verdict the spec stage can act on without re-deriving it. Bad work is a form filled in to pass the
check: an `exists: build` nobody searched for, three source lines pasted to clear a count, a pain
with no source and no `assumption:` tag.

## Inputs

Read these before writing anything:

1. `docs/story-standard.md`, the "Unlock before build" table: `have` closes the card, `unlock`
   means expose don't rebuild, `port` means a sibling repo already has it, `build` means absent.
2. `specs/{id}/research.md`, the file `codeloop spec new {id}` scaffolded from
   `templates/spec/research.md`. You fill it in, you don't replace its structure.
3. `.codeloop/wiki/product/` and `.codeloop/wiki/decisions/`, both in the brief: what the product
   is, and what earlier research already decided. A decision page that covers this ground means
   the `exists:` call and the pain are already known; cite the page instead of re-deriving them.
   `.codeloop/wiki/INDEX.md` lists every folder and who writes it.
4. `.codeloop/wiki/competitors/*.md`, run `codeloop wiki competitor list` for the current set.
   Only add a row for a competitor that already has a page; `codeloop wiki competitor add <name>`
   first if one doesn't exist and the comparison is worth keeping.
5. `specs/{id}/spec.md`, if the card already has one, the title and story tell you what to search
   for; research never contradicts an already-approved spec, it questions an unapproved one.

## Procedure

1. Read the card: `codeloop card show {id}`. Note the title, story and feature, that's what you
   are searching for, not the card id.
2. Search this codebase and any sibling repo named in the card's feature or initiative for the
   capability already existing, before writing a line of `research.md`. Decide `have | unlock |
   port | build`.
3. Write the `exists:` line in `specs/{id}/research.md`, with a path or URL whenever it is not
   `build`. `exists: build` with no search behind it is the single most common way this stage lies.
4. For each competitor page in `.codeloop/wiki/competitors/` relevant to this card's feature, add a
   row to "How others show it": `| Name | How they show it | Source |`. This row is copied onto
   that competitor's wiki page when the stage passes, write it so it reads standalone there, not
   only in context of this card.
5. Find the pain this card answers. Grep `docs/wiki/` and this repo's prior research for a source.
   If none exists, write `pain: assumption: <what you believe>, confirmed by <what would prove
   it>`. Never write a pain with no source and no `assumption:` tag, that's a guess wearing a fact's
   clothes.
6. List 2–3 Options under `## Options`, noting which was chosen when the verdict is `build`.
7. List `## Risks`, what building this costs or breaks if the `exists:` call is wrong.
8. Write at least three `- source: <url or path> — <note>` lines (a URL, or a file in this repo,
   optionally `path:line`; a path counts only when the file exists) (the dash before "source" and the dash
   before the note both matter; `codeloop check research` parses the exact pattern).
9. End the file with one line starting `verdict:`, `build`, `buy`, or `drop`. Nothing after this
   line is read by the check, so don't bury it in a risks paragraph. When the stage passes, the
   engine copies the verdict, the `exists:` line, the `pain:` line and `## Options` to
   `.codeloop/wiki/decisions/<title>.md`, so write them to read standalone there.
10. Run the done command and fix every line it reports before moving the card on.

## Questions to ask before working

Research is mostly search, not negotiation, so it rarely needs all five slots. Ask only what would
change where you look or how hard you look. Written through `codeloop ask {id} --file <path>` with
the file in this format:

```
## Q1 Is there a sibling repo in the same workspace that may already have this?
recommended: Check the repo named in the card's feature or initiative first; search there before this codebase if it's named.

## Q2 Should this research check against a specific competitor, or none?
recommended: Only the competitors already in .codeloop/wiki/competitors/; don't add a new one for a single card.

## Q3 Is the pain already evidenced somewhere in this repo, or does it need an assumption tag?
recommended: Grep docs/wiki/ for the feature name first; if nothing turns up, write assumption: and move on rather than stall the card on it.
```

## Template

```
# {{id}} research: {{title}}

## What exists

exists: build

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

## Options

## The pain, grounded

pain:

## Risks

## Sources

verdict:
```

(This mirrors `templates/spec/research.md` exactly, don't add sections the check doesn't read and
a downstream stage doesn't expect.)

## Checklist

See `checklist.md`. Every line is verifiable by a reviewer or by `codeloop check research`:

- [ ] `exists:` line present, one of `have | unlock | port | build`
- [ ] a path or URL given when `exists:` is not `build`
- [ ] every competitor row's name matches an existing page under `.codeloop/wiki/competitors/`
- [ ] `pain:` has a source, or says `assumption:` with what would confirm it
- [ ] at least 3 lines matching `- source: <url or path> — <note>`
- [ ] file ends with a line starting `verdict:` followed by `build`, `buy`, or `drop`
- [ ] `codeloop check research {id} --min-sources 3` exits 0

## Done

```
codeloop check research {id} --min-sources 3
```

Exit 1 and one line per problem: a missing file, a missing `verdict:` line, or fewer than 3 source
lines. Add `--online` to also require each source URL to answer with a 2xx or 3xx status, use it
when a cited page is load-bearing for the verdict, not for every run.

## Examples

**Good**, `specs/002-readme-matches-the-lane-engine-the-site/research.md` (card CL-002), real file
in this repo:

```
# CL-002 research: The README describes the product that ships

## What exists

exists: unlock, the lane engine, board, inbox and cloud sync are built and published as
@protoboxai/codeloop@0.3.0; only the README still describes the pre-lane product (ten slash
commands, `/design → /ship`). The site at codeloop.protobox.ai already describes lanes.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | README opens with a 4-step quickstart (`specify init`, then the slash commands in
order) and a supported-agents table | https://github.com/github/spec-kit |
| BMAD | README opens with the four-phase loop (clarify, plan, build, learn) and one install
command (`npx skills add`) | https://docs.bmad-method.org/ |

## The pain, grounded

pain: a visitor reads two products: the site sells lanes and gates, the README sells ten commands.
Source: this repo, README.md line 15 vs site/app/page.tsx. Spec Kit issue #75 ("illusion of work")
shows what happens when the pitch and the tool diverge.

## Options

- Rewrite the README to the three questions (what, run it, three common things) with the lane
diagram from the site. Chosen.
- Point the README at the site and keep it to a quickstart. Rejected: npm shows the README, not
the site.

## Risks

- The quickstart must be run from a clean clone before merge or it lies the same way.

## Sources

- source: https://github.com/github/spec-kit - README structure, quickstart first
- source: https://docs.bmad-method.org/ - one install command, loop first
- source: https://codeloop.protobox.ai - what the site already promises

verdict: build
```

Ran `codeloop check research CL-002 --min-sources 3` against this file: exit 0, no output.

**Bad**, `specs/058-small-fixes-skip-the-ceremony/research.md` (card c-058) in its current state,
also real:

```
exists: build

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

## Options

## The pain, grounded

pain:

## Risks

## Sources
```

Ran `codeloop check research c-058 --min-sources 3` against this file: exit 1, with:

```
specs/058-small-fixes-skip-the-ceremony/research.md has no line starting with "verdict:"
specs/058-small-fixes-skip-the-ceremony/research.md cites 0 sources, needs 3 (`- source: <url or path> — <note>`)
```

It fails for two reasons: no `verdict:` line, and zero `- source:` lines. `exists: build` is also
unexamined, nobody searched the sibling repos before writing it, which the check can't catch but a
reviewer should.
