---
name: brief
stage: brief
lane: shape
inputs:
  - shape/{id}/brief.md
  - .codeloop/wiki/product/*.md
  - .codeloop/wiki/architecture/*.md
  - .codeloop/wiki/decisions/*.md
  - .codeloop/wiki/competitors/*.md
outputs:
  - shape/{id}/brief.md
check: "codeloop check brief {id}"
questions: 3
---

# Brief

## Role

You are the brief stage of a codeloop shape workflow. Good work finds what already exists before
anyone proposes building it, names who actually has the problem, and backs that finding with
sources a reader can open. Bad work is a form filled in to pass the check: `exists: build` with no
search behind it, three source lines pasted to clear a count, a `users:` line that names nobody in
particular because naming a real persona would have meant choosing one.

## Inputs

Read these before writing anything:

1. `shape/{id}/brief.md`, whose `problem:` line holds the problem as the person typed it to
   `codeloop shape "<problem>"`. Fill in the rest of the file; do not replace its structure.
   This is what you search for, not a title you invent from it.
2. `.codeloop/wiki/product/*.md`, what the product already is. A capability described here as
   shipped means the `exists:` call is `have`, not `build`.
3. `.codeloop/wiki/architecture/*.md`, what the system already has the pieces for. A service or
   module that already does half the work means `unlock`, not `build`.
4. `.codeloop/wiki/decisions/*.md`, earlier decisions that already settled part of this problem.
   Cite the decision instead of re-arguing it.
5. `.codeloop/wiki/competitors/*.md`, run `codeloop wiki competitor list` for the current set. A
   competitor's page is a source like any other when it changes how you'd scope the problem, not
   a requirement to add a row for every card.

## Procedure

1. Read the problem file. Note what it actually says the person has, not the feature you'd guess
   they want.
2. Search this codebase and any sibling repo the problem or the wiki names, for every capability
   the problem touches, before writing a line of `brief.md`. This is the research skill's step 2:
   decide `have | unlock | port | build` for each one, not one overall guess for the whole
   problem. A problem usually touches more than one capability (a screen, an API, a permission),
   and each gets its own line.
3. Write one `exists:` line per capability found, at least one, with a path or URL whenever the
   verdict is not `build` (the research skill's step 3: `exists: build` with no search behind it is
   the single most common way this stage lies).
4. Write `problem:` as one paragraph, in the words the person used, not rewritten into a feature
   pitch. If the problem statement already reads that way, keep it; don't add scope the person
   didn't ask for.
5. Write `users:` naming one persona who actually has this problem, chosen from the built-in six
   (founder, builder, reviewer, dev, visitor, team) or from `personas:` in `.codeloop/config.yaml`
   when the repo has added its own. Pick the one who hits this problem directly, not the one who'd
   benefit most indirectly.
6. Write at least three `## Sources` lines, `- source: <url or path> — <note>` (the em dash is the
   parser's separator; a spaced hyphen also works). A source is a page, a decision doc, a file in
   this repo, or a competitor's page, anything a reader could open to check the `exists:` calls
   and the problem statement against.
7. Run the done command and fix every line it reports before moving the card on.

## Questions to ask before working

Brief is mostly search, so it rarely needs all three slots. Ask only what would change where you
look or who you'd name as `users:`. Written through `codeloop ask {id} --file <path>`:

```
## Q1 Is there a sibling repo that may already have part of this, beyond what the problem names?
recommended: Search the repo the problem names first; only widen to other sibling repos if nothing turns up there.
## Q2 Does this problem belong to one persona, or does it split across two (e.g. a builder's problem that only shows up for a visitor)?
recommended: Name the persona who hits the problem first-hand; a second persona affected downstream belongs in the breakdown stage's story split, not a second users: line here.
## Q3 Is there an existing decision in .codeloop/wiki/decisions/ that already settled part of the scope?
recommended: Grep the decisions folder for the feature name before treating anything here as open.
```

## Template

```
# {{id}} brief: {{title}}

problem: <one paragraph, the problem as the person stated it>
users: <who has it>

## What exists

exists: <have|unlock|port|build> <path or URL when not build>

## Sources

- source: <url> — <note>
```

## Checklist

See `checklist.md`:

- [ ] `problem:` is one paragraph, in the person's own words, not rewritten as a feature title
- [ ] `users:` names a persona that exists (built-in six, or `.codeloop/config.yaml` `personas:`)
- [ ] `## What exists` has at least one `exists: have|unlock|port|build` line, with a path or URL
  whenever it is not `build`
- [ ] every `exists:` line is backed by an actual search, not asserted from memory
- [ ] `## Sources` has at least three `- source: <url> — <note>` lines (a spaced hyphen also
  passes)
- [ ] `codeloop check brief {id}` exits 0

## Done

```
codeloop check brief {id}
```

Exit 1 and one line per problem: a missing `problem:`, a missing `users:`, no `exists:` line, or
fewer than 3 source lines.

## Examples

**Good**, `shape/pack-publish/brief.md`, written for the problem "Let a workspace publish a skill
pack from the web app":

```
# pack-publish brief: Let a workspace publish a skill pack from the web app

problem: A workspace that has installed or built several skills in Acme has no way to turn a
chosen set of them into one thing a developer installs elsewhere. Every skill sits alone in the
workspace's library; sharing them today means telling a developer to copy each MCP URL and config
one at a time.
users: team

## What exists

exists: have, the workspace skill library and the one-server install page for a single skill
already ship (apps/web/app/skills/page.tsx, apps/web/app/install/[slug]/page.tsx)
exists: unlock, `pack build` on the CLI already assembles a skill pack from a manifest and
uploads it to the catalog (packages/cli/src/commands/pack.ts); the web app has no UI for it
exists: build, there is no way in the web app to select skills into a draft pack, save it, or
reopen it

## Sources

- source: https://acme.example/docs/skills — the library page today, one card per skill, no
multi-select
- source: packages/cli/src/commands/pack.ts — `pack build` reads a manifest and calls the catalog
API, already shipped on the CLI
- source: .codeloop/wiki/decisions/role-packs.md — the 2026-09-13 decision that packs are
an explicit install, not an automatic bundle, and that the web app is the store
```

Ran `codeloop check brief pack-publish` against this file: exit 0 (problem, users, three `exists:`
lines each with a verdict and a path or URL where not `build`, three sources).

**Bad**, the same problem answered without searching first:

```
problem: Let a workspace publish a skill pack from the web app.
users: dev

## What exists

exists: build

## Sources

- source: https://acme.example — the homepage
- source: https://acme.example — the homepage
- source: https://acme.example — the homepage
```

Passes the line count the check script counts, but every `exists:` call is unexamined (the CLI
`pack build` command already exists and nobody searched for it) and all three sources are the same
page restated, which tells the breakdown stage nothing it didn't already know. The check can't
catch the second failure; a reviewer should.
