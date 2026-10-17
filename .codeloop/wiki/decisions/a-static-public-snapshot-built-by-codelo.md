---
title: Publish a filtered static snapshot of the board and wiki
scope:
  - src/lib/server.ts
  - src/lib/scrub.ts
freq: 1
severity: warning
cards:
  - c-323
updated: 2026-10-17
---

## Options

- **A static public snapshot, built by `codeloop publish` through an allow-list filter and served by a read-only host, rebuilt on each push to main.** Chosen: it ships without waiting for the cloud record, uses the existing read-only board (src/lib/server.ts:145) and `scrubOutput` (src/lib/scrub.ts:20), and its filter is the one the Cloud public view will reuse, so it is written once. The snapshot carries its build time and commit. It touches `src/lib/server.ts`, `src/lib/scrub.ts` and a new publish command.
- **Wait for the Codeloop Cloud public view (c-321 step 6) and publish from the cloud record.** Lost: it depends on steps 1 to 5 of the Cloud design, months of work, and the filter would be the same code either way.
- **Turn on Protobox's public pack for the folder `codeloop cloud push` writes.** Lost: the folder holds the raw cards.json with every note and the config, so it would publish what must stay private; a pack shows documents, not a board; and it would make Protobox's pack format the public face of codeloop.

## Why

Not yet measured: a visitor (the founder or engineer evaluating codeloop) cannot see the loop working on real stories before installing it, because the board exists only on the owner's machine and none of BMAD, Kiro or Spec Kit offers a live example to point at. What would confirm it: ask three people who tried codeloop from docs/trial/trial-guide.md whether a live board would have changed their decision to install, and count site visits that reach the install command with and without a demo link.

## Consequences

**A static public snapshot, built by `codeloop publish` through an allow-list filter and served by a read-only host, rebuilt on each push to main.**: it ships without waiting for the cloud record, uses the existing read-only board (src/lib/server.ts:145) and `scrubOutput` (src/lib/scrub.ts:20), and its filter is the one the Cloud public view will reuse, so it is written once. The snapshot carries its build time and commit. It touches `src/lib/server.ts`, `src/lib/scrub.ts` and a new publish command. The other options are not built; reopening one is a new decision.
