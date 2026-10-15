# c-134 spec: The story page shows the proof beside the decision

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can approve a gate with each acceptance line, its test, the review and commits in view, so that I approve what I can see.

feature: ui-screens
initiative: wiki/initiatives/people-and-agents-workplace.md
size: M
metric: minutes to a decision with its proof
done_when: story-record screen at a gate shows Proof beside Approve; CardDetail default-tab tests exit 0

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given a story waiting at a gate, when I open the full story page or the board peek, then Proof is open beside Approve and Send back, and each acceptance line shows its use-case run, the review and commits on the same pane.
- US2 Given a story with open questions or an active agent run and not at a gate, when I open the record, then the default tab is Questions or Tasks respectively.
- US3 Given today's card detail, when I open the record, then the tabs are Proof, Spec, Tasks, Questions, Wiki and Activity, Evidence lives under Proof, History under Activity, Wiki links architecture without copying it, and the property panel on the right shows returned fields with holder, owner, reviewer, links and release as — until those cards land.
- US4 Given a bookmark to the evidence route, when I open it, then I land on that story's Proof tab.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:
- story-record

## Not building

- New holder, owner, reviewer, links or release storage (c-118); show what the API already returns, omit or "—" for the rest.
- GET `/api/stories/:id` or any fetch-contract redesign (c-121); join today's useCard / useCardFull / useQuestions.
- AppShell chrome and nav (c-133), Board tile bodies, Home gate list bodies.
- Redesigning Spec or Tasks tab content beyond tab placement and labels.
- A proof-linked approval audit beyond today's useDecide / gate note ("Approve records what you saw" as a new event shape).
- Deleting RecordLayout / GateCard / CardDrawer to rebuild from another product; reshape in place.

## Failure modes

- Tabs still default to Questions at a gate, so the founder never sees Proof beside Approve without an extra click.
- Proof lists file names only (today's Evidence tab), so acceptance lines and use-case keys are not beside the decision.
- Peek (`stacked`) and full page diverge: Proof-heavy layout works only at full width and breaks Board triage.
- Evidence bookmarks 404 or keep a separate primary page after Proof absorbs the content.
- Property panel invents holder/owner/reviewer storage instead of "—", colliding with c-118.
- Approve / Send back leave the shared body or stop using useDecide, so gate notes and events drift from the rest of the board.
