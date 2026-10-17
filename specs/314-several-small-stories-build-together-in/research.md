# c-314 research: Several small stories build together in one turn

## What exists

exists: build. Parts exist; batching does not. An orchestrator turn is one story: `placeTurn` places one story (src/lib/orch-isolation.ts:68), `placeAndBrief` writes one brief and takes one lease (src/lib/orch.ts:510), and `settle` gates one hand-back for that story's current stage (src/lib/orch.ts:237). Two pieces a batch needs are already built. A story's own commits can be read out of a shared branch by their trailer (`treeRange`, src/lib/orch-isolation.ts:106), which is how tree mode judges each story on its own work today. A lease claims a story's plan files while its builder runs, so two stories that touch the same file cannot run at once (`takeLease`, src/lib/orch-isolation.ts:84). Trivial stories hold no lane slot (`holdsSlot`, src/lib/engine.ts:455), and `orch.max_builders` (default 2) caps parallel builders, so parallel runs save wall time but not agent starts.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| BMAD | The developer agent takes one story at a time from the sprint and implements it to done before the next; there is no batch of stories in one run | https://github.com/bmad-code-org/BMAD-METHOD |
| Spec Kit | One implement run works one feature's task list; several small features mean several runs | https://github.com/github/spec-kit |

## The pain, grounded

pain: the founder pays a full build turn for every small fix. The owner asked to merge small stories into one build cycle; a batch of 17 interface stories each started its own agents for the same stages, and the board holds 26 open S stories today, each of which would take its own build turn. Source: the card note on c-314 and `codeloop board` on this repo, 2026-10-17.

## Options

- **Batch small stories into one build turn, with a lease per story and a way out for a story that fails.** Chosen: the orchestrator picks trivial and S stories at build whose planned files do not overlap, writes one brief listing each, takes a lease per story, and the builder commits each story under its own trailer; settle then gates each story on its own commits and scope, and a story that fails leaves the batch for its own next turn while the rest advance. It touches `src/lib/orch.ts`, `src/lib/orch-isolation.ts` and `src/lib/engine.ts`.
- **Merge the small stories into one combined story.** Lost: unrelated fixes would share one scope, one verify and one review, one failure would hold back all of them, and the board would lose each story's own history.
- **Run the small stories in parallel builders.** Lost: still one agent start per story, and `orch.max_builders` caps it at two by default.

## Risks

- A batch whose stories touch the same file mixes their commits. Bounded by: only stories with no overlapping planned files are batched, and the per-story lease refuses the rest.
- One story's failure could block the others. Bounded by: each story is gated alone, and a failure takes only that story out of the batch.
- A builder may commit two stories' work under one trailer. Bounded by: the scope check reads each story's trailered commits against its own plan, and a file outside it fails that story.
- Batching changes who holds a lease and how a turn is recorded; the orchestrator's turn record (src/lib/orch.ts:43) is per story today.

## Open questions

- How many small stories may share one turn, and must they touch different files?
- When one story in a batch fails, does it leave the batch straight away or does the batch wait?
- May stories from different features share a batch?
- Does each story still get its own verify and its own approval, or one approval for the batch?

## Sources

- source: src/lib/orch.ts:510 — placeAndBrief places, briefs and leases exactly one story
- source: src/lib/orch.ts:237 — settle gates one hand-back for one story's stage
- source: src/lib/orch-isolation.ts:68 — placeTurn decides where one story's turn runs, by lease and builder cap
- source: src/lib/engine.ts:455 — holdsSlot: trivial stories hold no slot, so batching them costs no lane capacity
- source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue — a merge queue tests several changes together and removes a failing one from the group, the model for the way out
- source: https://docs.renovatebot.com/noise-reduction/ — grouping small updates into one change cuts the per-change overhead while each update stays named

## Rubric

- R2 pass: `grep -n "batch" src/lib/orch.ts src/lib/orch-isolation.ts src/lib/engine.ts` finds no batch of stories, and `placeAndBrief` at src/lib/orch.ts:510 takes one `cardRef`
- R5 pass: specs/314-several-small-stories-build-together-in/research.md:18
- R7 pass: specs/314-several-small-stories-build-together-in/research.md:31

verdict: build
