# Review checklist, c-{nnn}

- [ ] `evidence/{nnn}/verify.md` says `result: pass` before review starts
- [ ] every wiki gotcha matching the changed files is read and acked (`codeloop check gotchas` exits 0)
- [ ] every finding has a verdict (fix now / defer / unnecessary) and evidence
- [ ] every "fix now" finding is actually fixed, and `codeloop verify {id}` re-run and still green
- [ ] every "defer" finding exists as a `codeloop card propose` line, not only in this file
- [ ] the file ends with a line starting `verdict:`
- [ ] `codeloop check file evidence/{nnn}/review.md --has 'verdict: approve'` exits 0
