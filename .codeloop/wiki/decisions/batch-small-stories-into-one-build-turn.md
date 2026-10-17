---
title: Batch small stories into one build turn, with a lease per story and a
scope:
  - src/lib/orch.ts
  - src/lib/orch-isolation.ts
  - src/lib/engine.ts
freq: 1
severity: warning
cards:
  - c-314
updated: 2026-10-17
---

## Options

- **Batch small stories into one build turn, with a lease per story and a way out for a story that fails.** Chosen: the orchestrator picks trivial and S stories at build whose planned files do not overlap, writes one brief listing each, takes a lease per story, and the builder commits each story under its own trailer; settle then gates each story on its own commits and scope, and a story that fails leaves the batch for its own next turn while the rest advance. It touches `src/lib/orch.ts`, `src/lib/orch-isolation.ts` and `src/lib/engine.ts`.
- **Merge the small stories into one combined story.** Lost: unrelated fixes would share one scope, one verify and one review, one failure would hold back all of them, and the board would lose each story's own history.
- **Run the small stories in parallel builders.** Lost: still one agent start per story, and `orch.max_builders` caps it at two by default.

## Why

the founder pays a full build turn for every small fix. The owner asked to merge small stories into one build cycle; a batch of 17 interface stories each started its own agents for the same stages, and the board holds 26 open S stories today, each of which would take its own build turn. Source: the card note on c-314 and `codeloop board` on this repo, 2026-10-17.

## Consequences

**Batch small stories into one build turn, with a lease per story and a way out for a story that fails.**: the orchestrator picks trivial and S stories at build whose planned files do not overlap, writes one brief listing each, takes a lease per story, and the builder commits each story under its own trailer; settle then gates each story on its own commits and scope, and a story that fails leaves the batch for its own next turn while the rest advance. It touches `src/lib/orch.ts`, `src/lib/orch-isolation.ts` and `src/lib/engine.ts`. The other options are not built; reopening one is a new decision.
