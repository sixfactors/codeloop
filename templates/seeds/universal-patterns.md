
## General

### Error-first control flow [confidence:HIGH]
Check error conditions and return/throw early. Keep the happy path at the lowest indentation level. Reduces nesting, improves readability.

### One logical change per commit [confidence:HIGH]
Each commit should be a single, reviewable unit. Mixing refactors with features makes review harder and reverts riskier.

### Config in version control [confidence:HIGH]
All configuration (except secrets) lives in the repo. If a new developer can't `git clone && make dev` and have a working setup, something is missing.
