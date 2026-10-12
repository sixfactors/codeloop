# User interface

Status: target design, adopted 2026-10-12. The current workspace app does not match it yet; the
initiative `people-and-agents-workplace` (epic `ui-rebuild`, stories c-118 to c-139) builds it.
The full design with wireframes is `docs/artifacts/codeloop-ui-design.html` (board: Artifacts).

## What the interface is for

Three moments: what needs me, what is moving, what next and what shipped. Two rules follow:
nothing is approved without its proof on the same screen, and an agent is shown as a teammate
with a name and a live status.

## Objects

| Object | What it is | Written by |
|---|---|---|
| Initiative | A bet with a goal, a metric and a hypothesis | Owner |
| Epic | An outcome needing several stories; carries the score | Owner, agent proposals |
| Story (types Story, Bug, Chore) | One shippable change with acceptance lines | Anyone; agents propose |
| Task | A step inside a story, tagged api, sdk, ui, test or docs | Agent |
| Question | Something an agent needs decided, with a recommended answer | Agent asks, person answers |
| Approval | A gate decision and the proof seen | Person |
| Proof | Use cases and their runs, the live walk, reviews, commits, mocks | Computed and agents |
| Release | A git tag and the stories that shipped in it | Computed |
| Wiki page (architecture, runbook, reference, decision, gotcha) | How the system works and why | Agents and people |

Feature folds into epic (story c-126, pending the owner's yes).

## Story fields

Key, type, status, holder (person or agent), owner, reviewer, priority, size, risk, parent,
links (blocks, blocked by, relates, duplicates), labels, area, release, proof meter, time in
stage, watchers. One home on screen: the property panel on the story's right.

## States

People see six: Backlog, Up next, In progress (with the stage as a sub-label), Needs you, Done,
Shipped. Flags on any state: Failing, Blocked. Needs you is shown whenever a gate, a question or
a failure waits on a person.

## Building blocks

Key, status pill, holder, priority, proof meter, gate badge, question bubble, link chip, property
row, activity entry, query bar, doc block. They combine into five patterns: row, tile, peek,
record, doc. Every screen is made from these and the design system in
`.codeloop/design-system/` (story c-130, c-131).

## Screens

| Place | Replaces today |
|---|---|
| Home: needs you, in progress, agents now, shipped | Inbox, hub home |
| Board: one row of states, swimlanes by holder | Board with nine stage columns per workflow |
| Story record and peek | Card page, card drawer, evidence page |
| Plan: ranked tree and timeline | Initiatives, Roadmap, epic and feature pages |
| Releases | (new) |
| Wiki: typed pages, owner, verified date, changed-by | Wiki |
| Reports | Stats |
| Settings | Setup, Settings |

## Build order

Bottom up, one layer at a time: api (c-118 to c-126), sdk (c-127), cli (c-128, c-129), design
system (c-130 to c-132), screens (c-133 to c-139). Each screen ships behind a browser test and an
independent design review.
