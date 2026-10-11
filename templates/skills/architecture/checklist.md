# Architecture checklist

- [ ] all five pages exist under `.codeloop/wiki/architecture/`, each non-empty
- [ ] `overview.md` has a `flowchart` diagram and a folder/purpose/depends-on table
- [ ] every folder in `.codeloop/state/repo-facts.json`'s `topFolders` is named in `overview.md`,
      or in a "Left out:" line that says why
- [ ] `flows.md` has 2 to 4 `sequenceDiagram` blocks, each participant named as it is in
      `overview.md`'s table
- [ ] `data-model.md` has an `erDiagram` and a table of the fields that matter, not every field of
      every schema
- [ ] `change-map.md` has 5 to 15 rows, each naming a real file in its "Edit" cell and a real
      command in its "Then run" cell
- [ ] `invariants.md` has 3 to 10 rules, each naming a file that exists ("enforced by:") and a
      test file that exists ("tested by:")
- [ ] no page is over 150 lines
- [ ] no table has more than 15 data rows
- [ ] no flowchart diagram has more than 15 distinct node ids
- [ ] no scanner leftovers: no bare count used as a label (e.g. "59 routes"), no `TODO` placeholder
- [ ] every backticked path, table-cell path, `source:` value and mermaid `click` target is a path
      that exists on disk
- [ ] `codeloop check architecture` exits 0
