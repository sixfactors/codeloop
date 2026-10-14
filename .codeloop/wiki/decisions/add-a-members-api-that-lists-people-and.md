---
title: Add a members API that lists people and agents as one Member shape
scope:
  - src/lib/active-card.ts
  - src/lib/services.ts
  - src/lib/server.ts
freq: 1
severity: warning
cards:
  - c-125
updated: 2026-10-14
---

## Options

- Add a members API (and service view) that lists people and agents as one Member shape (`kind`, `name`, live `status` + current story from `activeSessions`), so Home's Agents panel and Settings can read one roster. Reuse `activeSessions` for the live join; name agents from a members/agents config (or stable display names), not raw session ids. Chosen — matches the card's `[api]` note, the design decision "Agents listed as members, with a name and a live status", and the api-before-screens order (screens are c-135 / c-139).
- Treat `homeView.agents` as done. Rejected — it only shows sessions that are working now; idle agents vanish, people are absent, and the id is a host session string, not a teammate name.
- Derive "who is working" only from `agent-start` events on cards. Rejected — events are history; live presence already lives in `activeSessions`, and idle members still need a roster source.

## Why

a founder cannot see each agent as a teammate with a name, whether it is working or idle, and which story it holds — so agent work is invisible unless they hunt session files or happen to open Home while a run is mid-flight. Source: docs/artifacts/codeloop-ui-design.html (Agents panel: builder-1 on CL-142, reviewer idle; decision "Agents listed as members, with a name and a live status") and the card story on c-125 ("see each agent, its status and its story" / "agent work is visible like a teammate's"). Confirmed by `homeView.agents` being session-shaped only and by the absence of a members endpoint or Member type in `src/lib/services.ts` / `src/lib/server.ts`.

## Consequences

Add a members API (and service view) that lists people and agents as one Member shape (`kind`, `name`, live `status` + current story from `activeSessions`), so Home's Agents panel and Settings can read one roster. Reuse `activeSessions` for the live join; name agents from a members/agents config (or stable display names), not raw session ids. — matches the card's `[api]` note, the design decision "Agents listed as members, with a name and a live status", and the api-before-screens order (screens are c-135 / c-139). The other options are not built; reopening one is a new decision.
