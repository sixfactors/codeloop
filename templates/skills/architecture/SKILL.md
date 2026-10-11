---
name: architecture
stage: architecture
lane: wiki
inputs:
  - .codeloop/state/repo-facts.json
  - .codeloop/wiki/reference/*.md
  - README.md
  - docs/
outputs:
  - .codeloop/wiki/architecture/overview.md
  - .codeloop/wiki/architecture/flows.md
  - .codeloop/wiki/architecture/data-model.md
  - .codeloop/wiki/architecture/change-map.md
  - .codeloop/wiki/architecture/invariants.md
check: "codeloop check architecture"
questions: 0
---

# Architecture

## Role

You are the architecture stage of the codeloop `wiki` lane. The scanner already did the fact
gathering: `.codeloop/state/repo-facts.json` and the raw inventories under `.codeloop/wiki/
reference/` name every route, schema and Makefile target it could find on disk, with no judgment
about which of them matter. Your job is the judgment the scanner cannot do: read the actual code,
then explain how the system works to an engineer who has never opened it. Good work names a real
folder and says in one sentence what lives there and why; a diagram's boxes are folders that
exist and its labels are not restatements of a count. Bad work is the scanner's tables copied into
a new filename: a containers diagram with "59 routes" as an arrow label, a table with every field
of every schema, a `change-map.md` row that names no path. `codeloop check architecture` fails
every one of those, and it is counting lines and resolving paths, not reading prose: it cannot
tell you wrote a good paragraph, only that you did not invent a path or leave a scanner leftover.

## Inputs

1. `.codeloop/state/repo-facts.json`, inlined below: the stack, routes, entities, Makefile and
   script targets, CI, deploy targets and `topFolders`, the top-level directories that hold source
   code. Every folder `topFolders` names must appear in `overview.md`, or in a line that says it
   was left out and why (a `coverage/` or `dist/` folder, for instance).
2. `.codeloop/wiki/reference/*.md`, in the brief: the scanner's own C4-shaped pages (context,
   containers, stack, erd, service-contracts, data-flows, deploy). These are facts, not
   explanation; read them for what exists, then go read the code they point at before writing
   anything. A reference page's row naming a file is a pointer, not a citation you can repeat
   without opening the file.
3. `README.md` and `docs/`, when they exist: the stated purpose and any existing documentation.
   A README's claim about what the system does still has to be checked against the code; write
   what the code does, and note where it disagrees with the README instead of repeating the README.

## Procedure

1. Read `.codeloop/state/repo-facts.json` and the reference pages. Note every entry in
   `topFolders`: each one needs a home in `overview.md`.
2. For each top folder, open its entry files (an `index.ts`, a `main.py`, whatever the stack's
   convention is) and skim its exported types and functions. You are looking for what the folder
   is *for*, not an inventory of what is in it. One real sentence beats a restated file list.
3. Write `overview.md`: one paragraph on what the system does, a `flowchart TB` with one subgraph
   per layer (each box a real folder, `click NODE "path"` naming it, a one-line purpose beside it),
   and a table of folder, purpose, depends on. A folder with nothing to say for itself (generated
   output, vendored code) gets a "left out" line naming it and why, not a box.
4. Pick 2 to 4 journeys a user or caller actually takes through the system (the routes and entry
   points in repo-facts.json point at these). Write `flows.md`: one `sequenceDiagram` per journey,
   with participants named exactly as they appear in `overview.md`'s table, not as the scanner's
   route paths.
5. Write `data-model.md`: an `erDiagram` of the entities that matter to those journeys (not every
   field of every schema the scanner found), and a table of the fields a reader actually needs to
   know about.
6. Write `change-map.md`: 5 to 15 rows of "to change X, edit Y, then run Z". Pick the changes a new
   engineer is most likely to need in their first weeks; `Y` is a real path, `Z` a real command.
7. Write `invariants.md`: 3 to 10 rules that must stay true, each naming the file that enforces it
   and the test that proves it. An invariant with no test is a hope, not a rule; find or name the
   test that would catch the regression, don't invent one that does not exist.
8. Run `codeloop check architecture` and fix every line it reports. It only catches mechanical
   problems (a missing page, an invented path, a table past its row limit); it does not tell you
   the explanation is good, so reread each page as the stranger it is written for before you stop.

## Checklist

See `checklist.md`. Every line is verifiable by a reviewer or by `codeloop check architecture`:

- [ ] all five pages exist, each non-empty
- [ ] `overview.md` has a `flowchart` diagram, a folder/purpose/depends-on table, and every
      `topFolders` entry named or explicitly left out with a reason
- [ ] `flows.md` has 2 to 4 `sequenceDiagram` blocks, participants named as in `overview.md`
- [ ] `data-model.md` has an `erDiagram` and a table of the fields that matter
- [ ] `change-map.md` has 5 to 15 rows naming a real file to edit and a real command to run
- [ ] `invariants.md` has 3 to 10 rules, each naming a file that exists and a test file that exists
- [ ] no page is over 150 lines, no table over 15 rows, no diagram over 15 distinct node ids
- [ ] no scanner leftovers: no bare counts as labels ("59 routes"), no `TODO` placeholders
- [ ] every backticked path, table cell path, `source:` value and mermaid `click` target exists on disk
- [ ] `codeloop check architecture` exits 0

## Done

```
codeloop check architecture
```

Exit 1 and one line per problem, each in the form `<page>: <problem>`: a missing page, an invented
path, a table or diagram past its limit, a sequence participant not named in the overview, a
change-map row or invariant naming a file or test file that does not exist, or a scanner leftover.

## Template

See `template.md` for a skeleton of each page with worked mermaid examples. Follow its structure;
its placeholder text is not real content and must not survive into the written pages.
