# Use case skeleton

<!-- One file per use case, in usecases/{nnn}/uc-{nnn}-{seq}.yaml. -->

```yaml
id: uc-{nnn}-{seq}
accept: US{n}
failure_mode: "<the specific way this acceptance line breaks in production>"
layers:
  cli:
    run: "<shell command>"
    expect:
      exit: 0
      stdout: "<substring that must appear>"
  api:
    base_url: "<optional override; default comes from deploy.<env>.base_url>"
    request:
      method: GET
      path: "/..."
      body: null
    expect:
      status: 200
```

**Before marking this use case done:**

1. Ran once green, for the right reason (checked the evidence JSON, not just the exit code).
2. Ran once red, broke the feature on purpose and watched this use case catch it.
3. If `cli`, confirmed it still catches the break after `--mutate`'s worktree setup (no
  environment-only false red).
