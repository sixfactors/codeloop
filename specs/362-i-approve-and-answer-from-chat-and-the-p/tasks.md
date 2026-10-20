# c-362 tasks: I approve and answer from chat, and the page loads fast and lists every artifact

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [US1] [api] `approveWithConditions` in src/lib/services.ts: refuse with nothing written when an open question or finding has no recommendation, else record each recommended interview answer as the owner's, answer each open review or gap finding `waived`, then run the approve flow (src/lib/flow.ts:39)
- [ ] T002 [US1] [api] `codeloop approve <id> --accept-recommended` in src/commands/card.ts, the `accept` body field on POST /cards/:id/approve in src/lib/server.ts:228, and the option on `approveCard` in src/sdk/client.ts:162
- [ ] T003 [US4] [api] Card reads in src/lib/server.ts stop awaiting the index rebuild (`index.ready`, src/lib/server.ts:155) and read the store directly while the hub reopens a closed index
- [ ] T004 [US5] [api] `ArtifactsRepo.list` in src/lib/store/file.ts walks docs/artifacts at any depth through an exported `allArtifactFiles` (src/lib/artifact.ts:46), each page with its kind, topic and story, designs, plans and workflows before mocks, newest first in each
- [ ] T005 [US3] [ui] An Approve with conditions button and confirm step listing answers to accept and findings to waive, and a Waived findings fold with who and when, in workspace/components/shared/questions.tsx, workspace/components/shared/card-detail.tsx and workspace/hooks/use-api.ts
- [ ] T006 [US4] [ui] workspace/app/cards/[id]/loading.tsx paints the app frame and a PageSkeleton at once while the server renders the story
- [ ] T007 [US2] [test] Approve with conditions through the real route: accepts, waives and approves in one step; refuses with the questions file and events unchanged when one has no recommendation, in src/lib/__tests__/approve-conditions.test.ts
- [ ] T008 [US4] [test] A story read after the index closed answers within 1 s, and a system design two folders under docs/artifacts is listed with its kind and story, in src/lib/__tests__/story-page-reads.test.ts

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: Q1 in `decided by:`, Q2 in `which stories:`, Q3 in `conditions:`, Q4 in `speed:`, Q5 in `artifacts:`, all under `## Decisions` in specs/362-i-approve-and-answer-from-chat-and-the-p/spec.md:26
- S6 pass: specs/362-i-approve-and-answer-from-chat-and-the-p/spec.md:35 leaves out a relayed-by record, the board-sync commands (a sibling story), docs/plans and a never-closing index
