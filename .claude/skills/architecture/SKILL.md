---
name: architecture
stage: architecture
lane: wiki
inputs:
  - .codeloop/state/repo-facts.json
  - .codeloop/wiki/reference/*.md
  - .codeloop/wiki/gotchas/*.md
  - .codeloop/wiki/decisions/*.md
  - README.md
  - docs/
outputs:
  - .codeloop/wiki/architecture/overview.md
  - .codeloop/wiki/architecture/flows.md
  - .codeloop/wiki/architecture/data-model.md
  - .codeloop/wiki/architecture/change-map.md
  - .codeloop/wiki/architecture/invariants.md
  - .codeloop/wiki/start-here.md
  - .codeloop/wiki/runbooks/commands.md
check: "codeloop check architecture"
questions: 0
---

# Architecture

## Role

You are the architecture stage of the codeloop `wiki` lane. The scanner already did the fact
gathering: `.codeloop/state/repo-facts.json` and the raw inventories under `.codeloop/wiki/
reference/` name every route, schema, Makefile target and npm script it could find on disk, with no
judgment about which of them matter. Your job is the judgment the scanner cannot do: read the
actual code and its history, then explain how the system works to an engineer who has never opened
it. Good work names a real folder, a real function, a real file:line, and says why the system is
built that way, not just what the folder is named. Bad work is the scanner's tables copied into a
new filename: a containers diagram with "59 routes" as an arrow label, a table with every field of
every schema, a `change-map.md` row that names no path, a sentence so generic it would be true of
any project ("handles requests", "stores data"). `codeloop check architecture` fails the mechanical
version of that (a missing page, an invented path, a table past its row limit); it cannot tell you
the explanation is shallow, so the Depth section below is the bar a reviewer judges you against
that the check cannot.

## Inputs

1. `.codeloop/state/repo-facts.json`, inlined below: the stack, routes, entities, Makefile targets,
   npm scripts, CI, deploy targets and `topFolders`, the top-level directories that hold source
   code. Every folder `topFolders` names must appear in `overview.md`, or in a line that says it
   was left out and why (a `coverage/` or `dist/` folder, for instance). The Makefile targets and
   npm scripts are exactly what `runbooks/commands.md` must account for.
2. `.codeloop/wiki/reference/*.md`, in the brief: the scanner's own C4-shaped pages (context,
   containers, stack, erd, service-contracts, data-flows, deploy). These are facts, not
   explanation; read them for what exists, then go read the code they point at before writing
   anything. A reference page's row naming a file is a pointer, not a citation you can repeat
   without opening the file.
3. `.codeloop/wiki/gotchas/*.md` and `.codeloop/wiki/decisions/*.md`, when they exist: real mistakes
   people hit and real calls already made. A gotcha scoped to a file you are explaining is a Sharp
   edge waiting to be cited, not background reading to skim past.
4. `README.md` and `docs/`, when they exist: the stated purpose and any existing documentation.
   A README's claim about what the system does still has to be checked against the code; write
   what the code does, and note where it disagrees with the README instead of repeating the README.

## Procedure

1. Read `.codeloop/state/repo-facts.json`, the reference pages, and every gotcha and decision page.
   Note every entry in `topFolders`: each one needs a home in `overview.md`.
2. For each top folder, open its entry files (an `index.ts`, a `main.py`, whatever the stack's
   convention is) and read the exported functions that matter, not just their signatures. Then run,
   for that folder: `git log --format='%s%n%b' -- <folder> | head -200`. The why a folder is shaped
   the way it is usually lives in a commit body or a test, never in the file name alone.
3. Write `overview.md`: one paragraph on what the system does, a `flowchart TB` with one subgraph
   per layer (each box a real folder, `click NODE "path"` naming it, a one-line purpose beside it),
   and a table of folder, purpose, depends on. A folder with nothing to say for itself (generated
   output, vendored code) gets a "left out" line naming it and why, not a box.
4. Pick 2 to 4 journeys a user or caller actually takes through the system (the routes and entry
   points in repo-facts.json point at these). Write `flows.md`: one `sequenceDiagram` per journey,
   with participants named exactly as they appear in `overview.md`'s table, not as the scanner's
   route paths, and with the failure branch shown (an `alt`/`else`, not just the happy path).
5. Write `data-model.md`: an `erDiagram` of the entities that matter to those journeys (not every
   field of every schema the scanner found), and a table of the fields a reader actually needs to
   know about.
6. Write `change-map.md`: 5 to 15 rows of "to change X, edit Y, then run Z". Pick the changes a new
   engineer is most likely to need in their first weeks; `Y` is a real path, `Z` a real command.
7. Write `invariants.md`: 3 to 10 rules that must stay true, each naming the file that enforces it
   and the test that proves it, and each saying in one line what breaks if the rule is violated. An
   invariant with no test is a hope, not a rule; find or name the test that would catch the
   regression, don't invent one that does not exist.
8. Write `start-here.md`: one paragraph on what this is, a link to `architecture/overview.md` for
   the diagram, the real setup commands, the three most common tasks a *user of this repo* actually
   runs (not the three the scanner guessed at), each with its real command, and where to go next
   (the sections this skill and the rest of the wiki shape write).
9. Write `runbooks/commands.md`: every make target and every npm script from `repo-facts.json`, each
   with what it is for and when to run it, grouped so a reader can scan it. A script or target you
   leave out needs a "Left out:" line naming it and why (a one-off migration script, say).
10. Add "Sharp edges" to the bottom of each of the seven pages where something genuinely surprises a
    newcomer: 2 to 5 bullets, each citing its source (a gotcha page's path, a commit hash and
    subject, or a test name). A page with nothing surprising gets no Sharp edges section, not an
    invented one.
11. Run `codeloop check architecture` and fix every line it reports. It only catches mechanical
    problems; it does not tell you the explanation is good, so reread each page as the stranger it
    is written for, against the Depth bar below, before you stop.

## Depth

The check cannot grade prose, so this is the bar a reviewer (human or `codeloop skill eval
architecture`) holds you to instead. It is not optional padding; a page that skips it reads exactly
like the scanner output it is supposed to replace.

1. Before writing, read git history for each top folder (`git log --format='%s%n%b' -- <folder> |
   head -200`), the gotchas and decisions pages, and the tests for the core modules. The why lives
   in commit bodies and tests, not in file names.
2. Each page answers questions a senior engineer new to the repo would actually ask, not what the
   folder names already say. Examples of the bar: "what happens when two agents advance the same
   card at once", "why is cards.json one file and what does that cost", "what stops an agent
   approving its own gate", "where does a failed check's message go next".
3. Every claim is specific: it names the function, the condition, the number or the file:line. A
   sentence that would be true of any project ("handles requests", "stores data") is cut.
4. Flows show the real steps with the real function names, the failure branch (`alt`/`else` blocks)
   and where state is written, not `lib->>lib` placeholders.
5. Each page ends with "Sharp edges": 2 to 5 things that surprise people, each with its source (a
   gotcha page, a commit, a test).
6. Invariants say what breaks if the rule is violated, in one line.

## Checklist

See `checklist.md`. Every line is verifiable by a reviewer or by `codeloop check architecture`:

- [ ] all seven pages exist, each non-empty: the five under `architecture/`, plus `start-here.md`
      and `runbooks/commands.md`
- [ ] `overview.md` has a `flowchart` diagram, a folder/purpose/depends-on table, and every
      `topFolders` entry named or explicitly left out with a reason
- [ ] `flows.md` has 2 to 4 `sequenceDiagram` blocks, participants named as in `overview.md`, with a
      failure branch shown
- [ ] `data-model.md` has an `erDiagram` and a table of the fields that matter
- [ ] `change-map.md` has 5 to 15 rows naming a real file to edit and a real command to run
- [ ] `invariants.md` has 3 to 10 rules, each naming a file that exists, a test file that exists,
      and what breaks if the rule is violated
- [ ] `start-here.md` has the setup commands and the three most common real tasks
- [ ] `runbooks/commands.md` names every npm script and make target, or leaves it out with a reason,
      and every command in backticks is real (a codeloop subcommand, an npm script, a make target, a
      file that exists, or a binary on PATH)
- [ ] no page is over 150 lines, no table over 15 rows, no diagram over 15 distinct node ids
- [ ] no scanner leftovers: no bare counts as labels ("59 routes"), no `TODO` placeholders
- [ ] every backticked path, table cell path, `source:` value and mermaid `click` target exists on disk
- [ ] every page that has something surprising ends with a Sharp edges section citing its source
- [ ] `codeloop check architecture` exits 0

## Done

```
codeloop check architecture
```

Exit 1 and one line per problem, each in the form `<page>: <problem>`: a missing page, an invented
path, a table or diagram past its limit, a sequence participant not named in the overview, a
change-map row or invariant naming a file or test file that does not exist, a scanner leftover, a
command in `start-here.md`/`runbooks/commands.md` that is not real, or a script/target
`runbooks/commands.md` leaves out with no reason.

## Template

See `template.md` for a skeleton of each page with worked mermaid examples. Follow its structure;
its placeholder text is not real content and must not survive into the written pages.
