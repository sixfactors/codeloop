# c-100 spec: I see work in action, the plan and what shipped

Story: As a founder, I can use a simple board, a plan and a shipped view, so that I understand the state of work at a glance.

feature: board-views
size: L
metric: time_to_answer_what_needs_me
done_when: the five stories below are each live

The design lives in the wiki and the board spec (chanl-platform docs/plans/codeloop/2026-10-11-board-plan-shipped.md); this card holds only the story, its split and its decisions.

acceptance:
- US1 Given stories in several stages, when I open the board, then I see one row of stage columns (Up next to Live) with a Needs you row on top, the same for every build-type workflow.
- US2 Given Up next below its limit, when a story is ranked at the top of Plan, then it moves into Up next on its own; the limit and refill are owner settings.
- US3 Given the backlog, epics and features, when I open Plan, then I can rank, link a story to its parent and describe a new problem there.
- US4 Given stories that shipped, when I open Shipped, then they are grouped by release with their evidence.
- US5 Given many stories, when I search or select several, then a query bar and bulk actions work across the board and Plan.

screens: board, plan, shipped

## Split (L stories do not pass the spec gate)

1. The board by stage, with Needs you on top (US1)
2. Up next fills itself from Plan, with its Settings section (US2)
3. Plan replaces Initiatives and Roadmap (US3)
4. Shipped groups done stories by release (US4)
5. Search, links and bulk changes on the board and Plan (US5)

## Not building

- Sprints and story points; Jira import (story c-107).

## Failure modes

- The board still draws one row per workflow, or a story appears in two columns (US1).
- Up next overfills, or refills from the wrong end of Plan (US2).
- A parent link points at a missing story, or Plan drops a story the old pages showed (US3).
- A shipped story is missing from its release, or lands in two (US4).
- A bulk action changes stories outside the selection (US5).

## Clarifications

### Session 2026-10-11

- Q: Should the Plan page absorb Initiatives and Roadmap, so the sidebar shows Board, Plan, Shipped, Wiki? A: Yes (A). Initiatives and Roadmap become sections of Plan; Artifacts and Stats move under More. (owner)
- Q: How many stories should Up next hold before agents stop pulling new ones in? A: 6, refilled automatically from the top of Plan (B), changeable by the owner on the board Settings page and as board.up_next.limit / auto_refill in config. (owner)
