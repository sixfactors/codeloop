# c-134 research: The story page shows the proof beside the decision

## What exists

exists: unlock, `workspace/components/shared/card-detail.tsx` already renders one body for the full card page and the board peek (`CardDrawer` → `DetailSheet`): `RecordLayout` with a facts rail, a `GateCard` (Approve / Reject), and tabs for Questions, Output, History, Spec, Tasks and Evidence. Evidence still lives as a file list (and a separate `workspace/app/evidence/[nnn]/` page); there is no Proof tab that lists each acceptance line with its use-case run, review and commits beside the gate decision. Tabs always open on Questions (`defaultValue="questions"`), not on whatever the story is waiting for. The property rail shows Id / Lane / Stage / Initiative / Epic / Feature — not Status, Holder, Owner, Reviewer, Priority, Links, Release, Commits. Wiki is a header button to a card wiki page, not a tab of linked architecture.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. The target is this product's design: a story record with Proof beside the gate decision, a property panel on the right, and tabs Proof / Spec / Tasks / Questions / Wiki / Activity that open on what the story waits for — see Sources.

## Options

- Reshape today's `CardDetail` / `RecordLayout` / `GateCard` / `CardDrawer` into the design's record: property panel on the right, Proof tab that absorbs Evidence (acceptance lines + runs + review + commits + mocks), gate banner with Approve / Send back on the same pane, and default tab = waiting reason (Proof at a gate, Questions when open, Tasks while an agent runs). Chosen — matches design §5 Story wireframe and §8 ("Card page, card drawer → Story record and peek"; "Evidence page → The story's Proof tab"), unlock-before-build, and build order ("Story record first").
- Delete the card page and rebuild from chanl-admin templates. Rejected — RecordLayout, GateCard, Questions, Spec/Tasks tabs and peek already fit; a rewrite burns the shared body for no product gain.
- Close the card as `have` because Approve and an Evidence tab ship. Rejected — a founder still opens a separate evidence folder and never sees each acceptance line next to the decision; the title names proof beside the decision.
- Wait for GET `/api/stories/:id` (c-121) before any UI change. Rejected — the screen can reshape with today's `useCard` / `useCardFull` / `useQuestions` joins; the one-call story view is a later swap, not a blocker for the layout.

## The pain, grounded

pain: a founder at a gate must leave the story to find evidence, never sees each acceptance line with its test beside Approve, and lands on Questions instead of Proof — so they cannot approve what they can see in under the initiative's two-minute target. Source: card story ("approve a gate with each acceptance line, its test, the review and commits in view"), `.codeloop/wiki/initiatives/people-and-agents-workplace.md` (metric: minutes to a decision with its proof; "evidence on its own page"), `docs/artifacts/codeloop-ui-design.html:275` (Proof beside decision; opens on what it waits for), and today's `card-detail.tsx` (`defaultValue="questions"`, Evidence tab as file names, Evidence button to a separate route).

## Risks

- Scope bleed into c-118 fields (holder, owner, reviewer, links, release): show what the API already returns; stub or omit property rows until those fields land, do not invent parallel storage here.
- Scope bleed into c-121 `/api/stories/:id`: keep reshaping the presentational body; do not redesign the fetch contract in this card.
- Removing or orphaning `workspace/app/evidence/[nnn]/` without a redirect breaks bookmarks; Proof should own the content and redirect or deep-link the old route.
- Peek (`stacked` drawer) vs full page must stay one body; a Proof-heavy layout that only works at full width would break triage from Board/Home.
- "Approve records what you saw" (design §6) may need an event/note shape beyond today's gate note — stay with existing `useDecide` unless a separate card owns proof-linked approval audit.

## Sources

- source: docs/artifacts/codeloop-ui-design.html:275 — Story record wireframe: Proof tab, waiting banner with Approve, property panel
- source: docs/artifacts/codeloop-ui-design.html:308 — opens on what the story waits for; Wiki links architecture, does not copy it
- source: docs/artifacts/codeloop-ui-design.html:403 — Evidence and Artifacts fold into the story's Proof tab
- source: .codeloop/wiki/architecture/ui.md:9 — nothing approved without its proof on the same screen
- source: .codeloop/wiki/architecture/ui.md:54 — Story record and peek replace card page, drawer and evidence page
- source: .codeloop/wiki/initiatives/people-and-agents-workplace.md — metric and pain: proof beside every decision; evidence was its own page
- source: workspace/components/shared/card-detail.tsx:112 — RecordLayout + GateCard + tabs; Evidence is a file list, default tab is Questions
- source: workspace/components/shared/card-drawer.tsx:11 — peek reuses CardDetail; must stay one body with the page
- source: workspace/app/evidence/[nnn]/evidence-page.tsx — separate evidence route the design absorbs into Proof

verdict: build
