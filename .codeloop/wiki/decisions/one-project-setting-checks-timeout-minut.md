---
title: One project setting, checks.timeout_minutes, default 10, read by
scope:
  - src/lib/engine.ts
  - src/lib/run.ts
  - src/lib/gate.ts
  - src/lib/handback.ts
  - src/lib/verify.ts
  - src/lib/health.ts
  - src/lib/proposals.ts
  - src/lib/orch.ts
  - src/lib/services.ts
freq: 1
severity: warning
cards:
  - c-365
updated: 2026-10-19
---

## Options

- **One project setting, `checks.timeout_minutes`, default 10, read by every path that runs a project command.** Chosen. It matches how GitHub and GitLab set a job limit in the project's own file, and the default keeps every existing project's behaviour. It touches `src/lib/engine.ts`, `src/lib/run.ts`, `src/lib/gate.ts`, `src/lib/handback.ts`, `src/lib/verify.ts`, `src/lib/health.ts`, `src/lib/proposals.ts`, `src/lib/orch.ts` and `src/lib/services.ts` (the split call).
- **A per-stage `timeout` in the lane file.** Lost: the production project has one slow check, but the owner asked for one project setting, and the lane file is a shipped template that `lane refresh` replaces.
- **Raise the constant to 40 minutes for everyone.** Lost: a hung check on a small project would then hold a slot for 40 minutes.

## Why

the founder's production orchestrator (brief of 19 October) runs a build check of about 25 minutes that is killed at 10, which stalls many cards; it will set 40. Source: that brief and src/lib/engine.ts:212.

## Consequences

**One project setting, `checks.timeout_minutes`, default 10, read by every path that runs a project command.** It matches how GitHub and GitLab set a job limit in the project's own file, and the default keeps every existing project's behaviour. It touches `src/lib/engine.ts`, `src/lib/run.ts`, `src/lib/gate.ts`, `src/lib/handback.ts`, `src/lib/verify.ts`, `src/lib/health.ts`, `src/lib/proposals.ts`, `src/lib/orch.ts` and `src/lib/services.ts` (the split call). The other options are not built; reopening one is a new decision.
