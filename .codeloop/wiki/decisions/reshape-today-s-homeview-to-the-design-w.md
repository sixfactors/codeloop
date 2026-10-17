---
title: Reshape today's HomeView to the design wireframe
scope:
  - workspace/components/shared/home-view.tsx
  - workspace/app/home/page.tsx
  - src/lib/services.ts
  - .codeloop/wiki/initiatives/people-and-agents-workplace.md
freq: 1
severity: warning
cards:
  - c-135
updated: 2026-10-14
---

## Options

- Reshape today's `HomeView` (and only the summary window / row actions the screen needs) to the design wireframe: greeting + counts, Needs you rows with proof meter and Approve / Answer / See failure (or Open proof), In progress with holder and stage sub-label, retire Inbox as the first place a person lands, keep `homeView` as the one call. Chosen — matches design §5 Home caption ("replaces today's Inbox and hub home"), `architecture/ui.md` screen map, unlock-before-build, and the card note `[ui] Needs you, In progress, agents now, shipped since yesterday`.
- Close the card as `have` because `/home` and GET `/api/home` ship. Rejected — a founder still opens each story to approve or answer, still has a separate Inbox, and still reads "shipped this week"; the title is finish-from-one-list in minutes.
- Delete Home and rebuild from a private project or a new inbox. Rejected — the server already groups the lists; a rewrite burns `homeView` / `useHome` for no product gain.
- Wait for c-125 members and c-134 Proof before any Home change. Rejected — Home can ship finish actions with today's `useDecide` / answer flows and deep-link Open proof; members rail and Proof tab content are later swaps, not blockers for the list shape.

## Why

a founder's morning still means bouncing Inbox ↔ story ↔ evidence to approve, answer or open a failure, so triage takes longer than the initiative's two-minute target. Source: card story ("approve, answer or open a failure from one list" / "my morning takes minutes"), `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof; separate inbox called out), `docs/artifacts/codeloop-ui-design.html:227` (Home wireframe and caption: every row finished from here), and today's `home-view.tsx` (Review/Answer links out; no Approve or See failure on the row; Failing is a separate card).

## Consequences

Reshape today's `HomeView` (and only the summary window / row actions the screen needs) to the design wireframe: greeting + counts, Needs you rows with proof meter and Approve / Answer / See failure (or Open proof), In progress with holder and stage sub-label, retire Inbox as the first place a person lands, keep `homeView` as the one call. — matches design §5 Home caption ("replaces today's Inbox and hub home"), `architecture/ui.md` screen map, unlock-before-build, and the card note `[ui] Needs you, In progress, agents now, shipped since yesterday`. The other options are not built; reopening one is a new decision.
