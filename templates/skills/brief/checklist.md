# Brief checklist, shape/{id}

- [ ] `problem:` is one paragraph, in the person's own words, not rewritten as a feature title
- [ ] `users:` names a persona that exists (built-in six, or `.codeloop/config.yaml` `personas:`)
- [ ] `## What exists` has at least one `exists: have|unlock|port|build` line, with a path or URL whenever it is not `build`
- [ ] every `exists:` line is backed by an actual search, not asserted from memory
- [ ] `## Sources` has at least three `- source: <url or path> — <note>` lines (a spaced hyphen also passes)
- [ ] `codeloop check brief {id}` exits 0
