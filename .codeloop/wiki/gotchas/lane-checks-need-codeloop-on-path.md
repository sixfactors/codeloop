---
title: Lane checks need codeloop on PATH
scope:
  - src/lib/engine.ts
  - src/lib/shell.ts
freq: 1
severity: warning
cards:
  - CL-001
updated: 2026-10-02
---

Lane `done.cmd` lines call `codeloop check ...`, `codeloop spec check ...` and `codeloop verify ...`. The CLI is often run through npx or a local build and is not on PATH, so the shell exits 127 and the card records a failed check that has nothing to do with the work.

Anything that runs a `done.cmd` or a use case must pass `env: checkEnv()` from `src/lib/shell.ts`, which puts a shim for the running CLI first on PATH. The engine, `lane eval` and `verify` do. A new call site that uses `spawnSync` without it will fail only for users who have no global install.
