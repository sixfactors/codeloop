verdict: accept

| Finding | Evidence | Severity |
|---|---|---|
| Correctly scopes exists:build to what is left, not a rebuild | `src/commands/update.ts:122` and `src/lib/scaffold.ts:92-93` confirm init/update install-missing-never-overwrite already works; `src/lib/mock.ts:31` (designSystem) and `src/lib/mock.ts:206` (checkMock) confirm mock new/check mock already read the project's copy. Research names only "rewriting existing mocks" and "workspace consumer" as absent, matching reality. | high (this is the thing that would have failed the card if wrong) |
| "ui/ has zero references to the design system" claim verified true | `grep -rn "design-system|tokens.css|blocks.css" ui/ --include="*.ts" --include="*.tsx" --include="*.css" --include="*.js" --include="*.jsx"` excluding node_modules returns no matches, exit 1 | medium |
| Competitor table empty, correctly justified | `.codeloop/wiki/competitors/` is an empty directory (`ls -la` confirms 0 entries); SKILL.md says only add a row for a competitor with an existing page | low |
| Source line numbers slightly off but point at real code | `mock.ts:30` cited for designSystem; actual function declaration is line 31 (JSDoc comment is on 30). `mock.ts:222` cited for checkMock; function starts at line 206, cited line falls inside its body. Not fabricated, just one-line-off pointers. | low |
| Pain and options grounded in real files, not assumption | README.md literally says "every new mock uses it"; options table cites real tradeoffs (self-contained HTML for board/gallery vs. live CSS links) and rejects "close as have" with a cited line from c-130 research | low |
| `codeloop check research c-131 --min-sources 3` passes | ran directly, exit 0, no output; decision file already written at `.codeloop/wiki/decisions/i-can-change-the-design-system-and-every.md` per the card log | low |

Research correctly identifies that init/update/mock-new/check-mock are already shipped (c-130, commit 51fd313) and scopes this card to the two things actually missing: a sync that rewrites existing mocks' token/block markers, and a workspace consumer contract. It does not propose rebuilding the ownership path. All nine source citations point at real files with claims that match what's in them; line numbers are off by a few lines in two spots but not wrong about what exists.
