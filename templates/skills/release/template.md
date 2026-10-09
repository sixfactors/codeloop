# Release evidence: {staging|prod}

<!-- evidence/{nnn}/staging.md and evidence/{nnn}/prod.md share this shape. -->

```markdown
result: pass | fail
sha: <commit>
env: staging | prod
deployed: <ISO timestamp>
smoke: <what ran, broader health/smoke command, and its result>
usecases: <codeloop verify {id} --env <env> --no-record result, e.g. "3/3 passed">
rollback: <the exact command to revert, and what state it returns to>
```

**If `result: fail`:** replace `smoke`/`usecases` with what broke, link the failing evidence
JSON, and record that rollback ran (or why it wasn't needed).
