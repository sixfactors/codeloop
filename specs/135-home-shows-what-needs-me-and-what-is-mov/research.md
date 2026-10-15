# c-135 research: Home shows what needs me and what is moving

## What exists

exists: unlock, `workspace/components/shared/home-view.tsx` and `workspace/app/home/page.tsx` already render a project Home from GET `/api/home` (`homeView` in `src/lib/services.ts`): Needs you, Failing, In progress, Agents now, and Shipped this week, with a peek drawer. The nav already links Home (`app-shell.tsx`). What the design and card still lack: rows you finish here (Approve / Answer / See failure beside the proof meter), "shipped since yesterday" (API window is seven days), failing folded into Needs you instead of a second list, and Inbox / hub home retired as the morning entry. Agents stay session-shaped on the page card; the design's live Agents rail is owned with c-125 / shell work, not rebuilt as a second roster here.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: Home as Needs you + In progress with finish-from-here actions, agents live in the rail, shipped-since-yesterday in the greeting — see Sources.

## Options

- Reshape today's `HomeView` (and only the summary window / row actions the screen needs) to the design wireframe: greeting + counts, Needs you rows with proof meter and Approve / Answer / See failure (or Open proof), In progress with holder and stage sub-label, retire Inbox as the first place a person lands, keep `homeView` as the one call. Chosen — matches design §5 Home caption ("replaces today's Inbox and hub home"), `architecture/ui.md` screen map, unlock-before-build, and the card note `[ui] Needs you, In progress, agents now, shipped since yesterday`.
- Close the card as `have` because `/home` and GET `/api/home` ship. Rejected — a founder still opens each story to approve or answer, still has a separate Inbox, and still reads "shipped this week"; the title is finish-from-one-list in minutes.
- Delete Home and rebuild from chanl-admin or a new inbox. Rejected — the server already groups the lists; a rewrite burns `homeView` / `useHome` for no product gain.
- Wait for c-125 members and c-134 Proof before any Home change. Rejected — Home can ship finish actions with today's `useDecide` / answer flows and deep-link Open proof; members rail and Proof tab content are later swaps, not blockers for the list shape.

## The pain, grounded

pain: a founder's morning still means bouncing Inbox ↔ story ↔ evidence to approve, answer or open a failure, so triage takes longer than the initiative's two-minute target. Source: card story ("approve, answer or open a failure from one list" / "my morning takes minutes"), `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof; separate inbox called out), `docs/artifacts/codeloop-ui-design.html:227` (Home wireframe and caption: every row finished from here), and today's `home-view.tsx` (Review/Answer links out; no Approve or See failure on the row; Failing is a separate card).

## Risks

- Scope bleed into c-125 / Agents rail: keep Agents now as today's session list (or consume members when present); do not invent Member storage on this card.
- Scope bleed into c-134 Proof: "Open proof" should deep-link the story's Proof / Evidence, not rebuild acceptance-line UI on Home.
- Changing `shippedThisWeek` to a yesterday window without a clear field name will break inbox summary copy and any client that reads `summary.shippedThisWeek`; rename or document the semantic change in one place.
- Hub "All projects" Home (`hub-home.tsx`) is a second surface; this card owns per-project Home unless the interview locks All-projects in scope — do not silently rewrite the hub grid.
- Removing or orphaning `/inbox` without a redirect breaks bookmarks; Home replaces it as entry, keep a redirect or alias until nothing links there.
- Inline Approve without proof in view reintroduces the initiative's "nothing approved without its proof" rule — gate rows need Open proof (or an inline proof meter that is honest) beside Approve.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:227 — Home wireframe: Needs you with Approve / Answer / See failure; In progress; agents in nav
- source: docs/artifacts/codeloop-ui-design.html:248 — caption: Home replaces Inbox and hub home; every row finished from here
- source: docs/artifacts/codeloop-ui-design.html:399 — today's Inbox / hub home map to Home (per project and All projects)
- source: .codeloop/wiki/architecture/ui.md:9 — three moments: what needs me, what is moving, what shipped
- source: .codeloop/wiki/architecture/ui.md:52 — Home replaces Inbox and hub home
- source: .codeloop/wiki/initiatives/people-and-agents-workplace.md — metric and pain: one place for needs-you / moving / shipped; separate inbox today
- source: workspace/components/shared/home-view.tsx:39 — Needs you row links Review/Answer; no Approve, proof meter or See failure
- source: src/lib/services.ts:819 — homeView already groups needsYou / failing / inProgress / agents / shipped (7-day window)
- source: workspace/app/inbox/page.tsx — Inbox route still exists beside Home; design retires it as morning entry

verdict: build
