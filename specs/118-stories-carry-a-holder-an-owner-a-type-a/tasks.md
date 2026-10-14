# c-118 tasks: Stories carry a holder, an owner, a type and links

- [ ] T001 [US1] [api] Add holder, owner, reviewer, type, links, labels, area, risk and release to `Card` / `CardExtras` in src/lib/cards.ts
- [ ] T002 [US5] [api] Validate type (story|bug|chore) and link types (blocks|blocked_by|relates|duplicates) on write, and refuse a link to a story that does not exist, in src/lib/cards.ts
- [ ] T003 [US2] [api] Load a cards.json with none of the new fields; a missing holder reads as unassigned and the owner defaults to the card's creator, in src/lib/cards.ts
- [ ] T004 [US4] [api] Write a link on both stories (blocks on one, blocked_by on the other) inside one `withLock` write in src/lib/engine.ts
- [ ] T005 [US1] [api] Return the new fields from `GET /api/cards` and the single-card read in src/lib/server.ts
- [ ] T006 [US5] [api] Answer a refused write with the field name that failed, from `POST /api/cards`, in src/lib/server.ts
- [ ] T007 [US1] [sdk] Add the new fields to the card type in workspace/lib/types.ts and the card read in workspace/lib/api.ts
- [ ] T008 [US1] [ui] Show holder, owner and reviewer on the story record as a person or an agent in workspace/components/shared/card-detail.tsx
- [ ] T009 [US2] [ui] Show Unassigned for an empty holder while the owner stays named in workspace/components/shared/holder.tsx
- [ ] T010 [US3] [ui] Show the type on the record and on the board tile in workspace/components/shared/board-card.tsx
- [ ] T011 [US4] [ui] Show typed link chips on both stories in workspace/components/shared/card-detail.tsx
- [ ] T012 [US5] [ui] Show the refused field's name from a failed write in workspace/components/shared/inline-error.tsx
- [ ] T013 [US1] [test] Cover all five acceptance lines, a legacy cards.json, a dead link and concurrent holder writes in src/lib/__tests__/cards-api.test.ts

## Rubric

- S3 pass: no interview answers exist; the card has 0 open questions and no specs/118-stories-carry-a-holder-an-owner-a-type-a/interview.md (`ls specs/118-*/`)
- S6 pass: the not-building section of specs/118-stories-carry-a-holder-an-owner-a-type-a/spec.md lists board editing of holder/owner and the query bar (`grep -n "Not building" -A4 spec.md`)
