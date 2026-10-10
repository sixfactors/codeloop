# Breakdown checklist, shape/{id}

- [ ] `hypothesis:` line present, one sentence
- [ ] `metric:` line present, names the one metric this epic moves
- [ ] every story has a size tag, `[S]` or `[M]`; an `[L]` is split into sibling stories before this file is written
- [ ] every story's `done_when:` is a thing a person can click or run, never "all tasks complete" or similar
- [ ] every story has an `exists:` verdict copied from the brief, with a path or URL when not `build`
- [ ] every `depends_on:` is `none` or an earlier story id in this same file
- [ ] at most seven stories under `## Stories`; anything past that sits under `## Later`
- [ ] every story's line ends with `rice: R=<n> I=<n> C=<n> E=<n>`, all four present
- [ ] `codeloop check breakdown {id} --ranked` exits 0
