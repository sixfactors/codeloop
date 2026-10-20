---
title: Freeze v1 as a packed release the production project runs, build v2
scope:
  - scripts/check-frozen.sh
  - dist/index.js
  - docs/artifacts/codeloop/cloud/c-321-implementation-plan.html
  - docs/story-standard.md
freq: 1
severity: warning
cards:
  - c-329
updated: 2026-10-20
---

## Options

- Freeze v1 as a packed release the production project runs, build v2 beside it under its own name, home, port and schedule tag, prove after every v2 session that v1 was left alone, run codeloop's own board on v2 first, and switch the production project once, with a rehearsed rollback and a written bar it must meet before. Chosen. Each child story removes one way a development build can reach the production record, the bar makes "proven" a check and not a feeling, and the rollback is rehearsed before it is needed.
- Build v2 in place, on the same board and binary, behind feature flags. Rejected: every build of the checkout changes what the production project's hooks, cron run and MCP execute, a misread flag is a write to the production board, and v2 moves the record out of `cards.json` into a store only the hub writes, which no flag can hide from v1 readers.
- Fork the repository for v2 and keep this one as v1. Rejected: two histories for one product, every v1 fix landing twice, and the frozen build still has to be pinned and proven on the production machine, which is the work of c-331 and c-333 whichever repository holds the code.

## Why

the founder (persona founder) runs ops-ai every day on codeloop, and building v2 in the same checkout changed what it ran: on 2026-10-20 `scripts/check-frozen.sh` found the hub on :4050 running from the checkout's `dist/` and a checkout `dist/index.js` process writing a hand-back onto ops-ai's board, while the global was a tarball with no commit recorded (`~/.codeloop/v1-freeze.md`). Source: `scripts/check-frozen.sh` (its first run, kept in specs/331-the-production-project-runs-a-frozen-v1/rubric-build.md) and the 10-18 plan P0 in `docs/artifacts/codeloop/cloud/c-321-implementation-plan.html`.

## Consequences

Freeze v1 as a packed release the production project runs, build v2 beside it under its own name, home, port and schedule tag, prove after every v2 session that v1 was left alone, run codeloop's own board on v2 first, and switch the production project once, with a rehearsed rollback and a written bar it must meet before. Each child story removes one way a development build can reach the production record, the bar makes "proven" a check and not a feeling, and the rollback is rehearsed before it is needed. The other options are not built; reopening one is a new decision.
