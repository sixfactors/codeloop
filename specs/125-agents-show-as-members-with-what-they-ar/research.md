# c-125 research: Agents show as members with what they are working on

## What exists

exists: build — live work is already tracked as session→card under `.codeloop/state/active/` (`activeSessions` in `src/lib/active-card.ts`) and folded into `homeView.agents` / `BoardStory.agent` on GET `/api/home` and `/api/board`. That is a list of currently working sessions (session id, card, title, since), not a Members roster. There is no Member type (person | agent), no idle agent entries, no people alongside agents, and no `/api/members`. `agents:` in config.yaml are run presets (`cmd`, timeouts), not teammate identities with a name and status. c-121 scoped members out to this card.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: nav Agents panel shows named agents with a live pill (working on a story key, or idle), and Settings lists members and agents together. Jira's Assignee is the named analogue in the design ("Holder (person or agent) plus Owner") and is cited under Sources, not as a wiki row.

## Options

- Add a members API (and service view) that lists people and agents as one Member shape (`kind`, `name`, live `status` + current story from `activeSessions`), so Home's Agents panel and Settings can read one roster. Reuse `activeSessions` for the live join; name agents from a members/agents config (or stable display names), not raw session ids. Chosen — matches the card's `[api]` note, the design decision "Agents listed as members, with a name and a live status", and the api-before-screens order (screens are c-135 / c-139).
- Treat `homeView.agents` as done. Rejected — it only shows sessions that are working now; idle agents vanish, people are absent, and the id is a host session string, not a teammate name.
- Derive "who is working" only from `agent-start` events on cards. Rejected — events are history; live presence already lives in `activeSessions`, and idle members still need a roster source.

## The pain, grounded

pain: a founder cannot see each agent as a teammate with a name, whether it is working or idle, and which story it holds — so agent work is invisible unless they hunt session files or happen to open Home while a run is mid-flight. Source: docs/artifacts/codeloop-ui-design.html (Agents panel: builder-1 on CL-142, reviewer idle; decision "Agents listed as members, with a name and a live status") and the card story on c-125 ("see each agent, its status and its story" / "agent work is visible like a teammate's"). Confirmed by `homeView.agents` being session-shaped only and by the absence of a members endpoint or Member type in `src/lib/services.ts` / `src/lib/server.ts`.

## Risks

- `agents:` presets (how to start a process) must stay distinct from member identity (who shows in the roster); conflating them forces every new tool install to look like a new teammate.
- Session ids from the host are unstable display names; the API must map session → member, or the nav will show opaque strings.
- c-118's `holder` (person or agent on a story) and this roster must share the same member ids, or swimlanes (c-136) and "who has this" disagree.
- Scope bleed into c-135 (Home chrome) and c-139 (Settings): this card owns the api data; those cards own the panels that render it.
- Stale `active/` files (24h TTL) can leave a member "working" after the process died; surface `since` / freshness or keep the existing stale skip.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:233 — Agents panel: named agent with live story pill, idle agent
- source: docs/artifacts/codeloop-ui-design.html:424 — decision: agents listed as members with name and live status
- source: docs/artifacts/codeloop-ui-design.html:248 — caption: agents panel shows who is working on what, live
- source: src/lib/active-card.ts:82 — activeSessions: live session→card substrate, not a members roster
- source: src/lib/services.ts:773 — homeView.agents is session/card/title/since only; no people, no idle
- source: src/lib/agent.ts:34 — loadAgents: config presets for run cmd, not teammate members
- source: .codeloop/wiki/architecture/ui.md:10 — agent shown as a teammate with a name and a live status
- source: .codeloop/wiki/features/ui-data-api.md:14 — api layer includes agents as members (this card)
- source: .codeloop/wiki/decisions/ui-rebuild-bottom-up.md — api before screens; c-125 sits in ui-data-api
- source: specs/121-each-screen-loads-its-data-with-one-call/interview.md:14 — members scoped to c-125, out of c-121

verdict: build
