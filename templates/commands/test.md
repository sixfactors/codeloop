---
description: Run tests, parse results, track coverage history
argument-hint: [suite] [--watch] [--coverage]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

<!-- codeloop-version: 0.2.0 -->

# /test

Run tests, parse results, and track coverage over time.

> **When to use `/test` vs `/qa`**: Use `/test` for quick feedback during development — run a specific suite, check coverage, iterate. Use `/qa` when you're ready to promote a task — it runs the full test suite plus static analysis, coverage gates, and integrity checks, and sets the `env:local-pass` label that unlocks `/deploy`. `/test` does NOT set env labels.

## Usage

```bash
/test                    # Run default test command from config
/test <suite>            # Run specific test suite or file pattern
/test --watch            # Run in watch mode (if runner supports it)
/test --coverage         # Run with coverage reporting
```

## Phase 1: Detect

1. Read `.codeloop/config.yaml` for the `test` section:
   ```yaml
   test:
     command: "npm test"
     coverage_threshold: 80
   ```
2. If no `test.command` configured, auto-detect the test runner:
   - `package.json` with `scripts.test` → use `npm test`
   - `vitest.config.*` → `npx vitest run`
   - `jest.config.*` → `npx jest`
   - `pyproject.toml` with `[tool.pytest]` → `pytest`
   - `go.mod` → `go test ./...`
   - `Cargo.toml` → `cargo test`
   - If nothing detected → ask the user what command to run

## Phase 2: Run

1. If `<suite>` argument provided, append it to the test command (e.g., `npm test -- src/auth/`)
2. If `--watch` flag, append watch flag for the detected runner:
   - vitest: already defaults to watch in dev, use `npx vitest`
   - jest: `--watch`
   - pytest: use `pytest-watch` or `ptw`
   - go: no native watch — inform user
3. If `--coverage` flag, append coverage flag:
   - vitest/jest: `--coverage`
   - pytest: `--cov`
   - go: `-cover`
4. Run the command, capture stdout and stderr

## Phase 3: Parse Results

Parse the test runner output to extract:

| Field | Example |
|-------|---------|
| Total tests | 42 |
| Passed | 40 |
| Failed | 1 |
| Skipped | 1 |
| Duration | 3.2s |
| Coverage % | 82% (if available) |
| Failed test names | List of specific failures |

If tests **failed**, show:
- Each failed test name and file
- The failure message / assertion error
- Suggestion: which code is likely broken based on the test file path

## Phase 4: Track History

Update `.codeloop/test-history.json` (create if not exists):

```json
{
  "runs": [
    {
      "timestamp": "2026-02-21T10:30:00Z",
      "suite": "all",
      "total": 42,
      "passed": 40,
      "failed": 1,
      "skipped": 1,
      "coverage": 82,
      "duration": 3.2,
      "commit": "abc1234"
    }
  ]
}
```

Keep the last 50 runs. Older entries are dropped.

Include the current git commit SHA (from `git rev-parse --short HEAD`).

## Phase 5: Report

```
## Test Results

**Suite**: all | **Runner**: vitest
**Result**: 40/42 passed, 1 failed, 1 skipped (3.2s)
**Coverage**: 82% (threshold: 80% ✓)

### Failures
- `src/auth/login.test.ts` → "expected 200, got 401"

### Trend (last 5 runs)
  42 ████████████████████ 100%
  42 ████████████████████ 100%
  42 ███████████████████░  95%
  42 ████████████████████ 100%
  42 ███████████████████░  95%  ← current
```

## Phase 6: Board Sync

If `.codeloop/board.json` exists:
- Find the active task (first `in_progress`, then `planned`)
- Add label: `tests:pass` or `tests:fail` (replace any existing `tests:*` label)
- If coverage available, add label: `coverage:82%` (replace any existing `coverage:*` label)
- Write updated board

## Rules

- **Never modify test files.** This skill only runs and reports — it doesn't fix tests.
- **Respect the config.** If `test.command` is set, use it. Don't override with auto-detection.
- **Track everything.** Even skipped tests matter — a rising skip count is a warning sign.
- **Show the trend.** History makes patterns visible — one failure vs. recurring failure.
