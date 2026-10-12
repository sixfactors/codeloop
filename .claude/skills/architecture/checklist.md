# Architecture checklist

- [ ] all seven pages exist, each non-empty: `overview.md`, `flows.md`, `data-model.md`,
      `change-map.md`, `invariants.md` under `.codeloop/wiki/architecture/`, plus
      `.codeloop/wiki/start-here.md` and `.codeloop/wiki/runbooks/commands.md`
- [ ] `overview.md` has a `flowchart` diagram and a folder/purpose/depends-on table
- [ ] every folder in `.codeloop/state/repo-facts.json`'s `topFolders` is named in `overview.md`,
      or in a "Left out:" line that says why
- [ ] `flows.md` has 2 to 4 `sequenceDiagram` blocks, each participant named as it is in
      `overview.md`'s table, with a failure branch shown (an `alt`/`else`, not only the happy path)
- [ ] `data-model.md` has an `erDiagram` and a table of the fields that matter, not every field of
      every schema
- [ ] `change-map.md` has 5 to 15 rows, each naming a real file in its "Edit" cell and a real
      command in its "Then run" cell
- [ ] `invariants.md` has 3 to 10 rules, each naming a file that exists ("enforced by:"), a test
      file that exists ("tested by:"), and one line saying what breaks if the rule is violated
- [ ] `start-here.md` has one paragraph on what this is, a link to `architecture/overview.md`, the
      real setup commands, and the three most common real tasks a user of this repo runs
- [ ] `runbooks/commands.md` names every npm script and make target from `repo-facts.json`, or
      leaves it out with a "Left out:" line; every command shown in backticks on either page is a
      real `codeloop` subcommand, npm script, make target, existing file, or binary on PATH
- [ ] no page is over 150 lines
- [ ] no table has more than 15 data rows
- [ ] no flowchart diagram has more than 15 distinct node ids
- [ ] no scanner leftovers: no bare count used as a label (e.g. "59 routes"), no `TODO` placeholder
- [ ] every backticked path, table-cell path, `source:` value and mermaid `click` target is a path
      that exists on disk
- [ ] `codeloop check architecture` exits 0

## Depth (not checked mechanically - a reviewer's bar)

- [ ] every top folder's git history was read (`git log --format='%s%n%b' -- <folder> | head
      -200`), along with the gotchas and decisions pages and the tests for the core modules, before
      writing about it
- [ ] each page answers a question a senior engineer new to the repo would actually ask (e.g. "what
      happens when two agents advance the same card at once"), not what the folder name already says
- [ ] every claim names a function, a condition, a number, or a file:line - no sentence that would
      be true of any project ("handles requests", "stores data")
- [ ] flows use the real function names and show the failure branch, not `lib->>lib` placeholders
- [ ] each page that has something genuinely surprising ends with a "Sharp edges" section (2 to 5
      items, each citing a gotcha page, a commit, or a test) - and a page with nothing surprising
      has no invented one
- [ ] every invariant says what breaks if it is violated, in one line
