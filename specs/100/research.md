# c-100 research: I see work in action, the plan and what shipped

## What exists (reuse, do not rebuild)

- The board today is one section per lane, each a row of stage columns, plus a backlog strip and ten facet filters. exists: unlock
- source: workspace/components/shared/board.tsx:182 — `Board` renders `LaneSection` per lane (`orderLanes`), `Column` per stage, a backlog via `backlogQuery`, facets from `BOARD_FACETS`
- source: workspace/components/shared/board-card.tsx — card face: id, priority chip, size, persona, feature, question count (six badges)
- source: workspace/components/shared/inbox-view.tsx — the inbox already ranks what waits on the owner by band, with Answer and Approve controls; the "Needs you" row can reuse its grouping and controls
- source: workspace/app/roadmap/page.tsx — roadmap view; source: workspace/components/shared/initiatives-table.tsx — initiatives table; both become sections of Plan
- source: src/lib/lane.ts:15 — `Stage` has no `phase` field; the board can only group by lane and stage id today
- source: .codeloop/lanes/build.yaml — codeloop's own build lane is an older version (research, spec, build, verify, review, staging, live) than the shipped template ops-ai has (adds interview and mock): lanes drift after upgrades (story c-090)
- source: src/lib/engine.ts — `workable`, `parkCard`, `closeCard`, `assertRoomInLane` (built today) give Up next its limit and the park action
- source: docs/plans/codeloop/2026-10-11-board-plan-shipped.md (chanl-platform) — the agreed design: columns, rows, Up next, Plan, Shipped, parent links, Jira fields
- source: docs/plans/codeloop/2026-10-11-jira-features.md (chanl-platform) — query bar, links, bulk change, releases taken from Jira
- source: git tags in this repo: only v0.4.0 exists, so Shipped groups most stories under "not yet released"

## What does not exist yet

- `phase:` on stages and a server endpoint that returns the board as phases x rows, computed on the server
- Up next as a real queue with a limit and auto refill from Plan
- Plan view, Shipped view, parent links, the query bar
- Derived git data per story (commits, release) for Shipped

## Size

L. The story standard refuses an L story at the spec gate, so the spec stage splits it into stories that each ship alone:
1. Board by phase with the Needs you row (engine `phase:`, board endpoint, new board page)
2. Up next queue with limit and auto refill, plus park from the board
3. Plan view (backlog ranking, epics and features, parent links, Describe a problem)
4. Shipped view grouped by release, from git
5. Query bar, bulk change, Jira-parity fields (type, labels, links, resolution, comments, due)

## Verdict

verdict: build. Unlock the existing inbox grouping, card drawer and shared components; add the phase mapping and the board endpoint on the server first, then the three views. Split into the five stories above at spec.
