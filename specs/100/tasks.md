# Tasks: c-100 Board, Plan and Shipped

Each group becomes its own story at the split. Tests come first in every group.

## Story 1: the board by stage, with Needs you on top (US1)

- [ ] T001 [US1] [test] Failing tests: one row of stage columns for every build-type lane, each story in exactly one column, Needs you row lists gated and stuck stories
- [ ] T002 [US1] [api] Board service returns stage columns pre-joined across lanes in src/lib/board.ts and src/lib/services.ts
- [ ] T003 [US1] [sdk] Board query in the SDK returns the stage view
- [ ] T004 [US1] [ui] Board page draws stage columns with the Needs you row, composed from components/shared kanban
- [ ] T005 [US1] [test] Use case usecases/100/board-by-stage.yaml driven through serve and the browser

## Story 2: Up next fills itself, with a Settings section (US2)

- [ ] T006 [US2] [test] Failing tests: refill pulls the top of Plan only while Up next is under its limit, never overfills, takes from the right end
- [ ] T007 [US2] [api] Config board.up_next.limit and auto_refill with validation in src/lib/config.ts; refill in src/lib/engine.ts
- [ ] T008 [US2] [ui] Settings page section for the limit and refill, owner only
- [ ] T009 [US2] [test] Use case usecases/100/up-next-refill.yaml

## Story 3: Plan replaces Initiatives and Roadmap (US3)

- [ ] T010 [US3] [test] Failing tests: Plan lists every story the old pages showed, rank persists, a parent link to a missing story is refused
- [ ] T011 [US3] [api] Plan service with rank and parent link in src/lib/services.ts
- [ ] T012 [US3] [ui] Plan page with rank, parent and a new-problem entry; Initiatives and Roadmap routes redirect to Plan
- [ ] T013 [US3] [test] Use case usecases/100/plan.yaml

## Story 4: Shipped groups done stories by release (US4)

- [ ] T014 [US4] [test] Failing tests: each shipped story lands in exactly one release group, untagged ones in Unreleased
- [ ] T015 [US4] [api] Shipped service groups by git tag with evidence links
- [ ] T016 [US4] [ui] Shipped page by release
- [ ] T017 [US4] [test] Use case usecases/100/shipped.yaml

## Story 5: search, links and bulk changes (US5)

- [ ] T018 [US5] [test] Failing tests: query parser, bulk action touches only the selection
- [ ] T019 [US5] [api] Query over the index and a bulk endpoint in src/lib/services.ts
- [ ] T020 [US5] [sdk] SDK and CLI card list --q share the same query
- [ ] T021 [US5] [ui] Query bar and multi-select on board and Plan
- [ ] T022 [US5] [docs] Docs pages for board, Plan, Shipped and the query language
- [ ] T023 [US5] [test] Use case usecases/100/search-bulk.yaml
