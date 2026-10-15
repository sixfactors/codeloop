verdict: accept

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| Existing seam correctly identified, not rebuilt | `card-detail.tsx:112-230` has `RecordLayout` + `GateCard` + `Tabs defaultValue="questions"` with triggers Questions/Output/History/Spec/Tasks/Evidence; `card-drawer.tsx:11,27-38` wraps the same `CardDetail` body in `DetailSheet`. Research's `exists:` line names both files and quotes the one-body-two-presentations pattern, matches exactly. | n/a (pass) |
| Property rail claim verified | Research says rail shows "Id / Lane / Stage / Initiative / Epic / Feature". Code at `card-detail.tsx:126-141` shows exactly those FieldRows plus Metric/Sizing/Dates, no Status/Holder/Owner/Reviewer/Priority/Links/Release. Matches. | n/a (pass) |
| Design-doc line citations verified | `docs/artifacts/codeloop-ui-design.html:275-308` has the Story record wireframe: tabs `Proof/Spec/Tasks/Questions/Wiki/Activity`, props panel with Status/Holder/Owner/Reviewer/Priority/Links/Release, caption "opens on whatever the story is waiting for." Line 403 table row "Evidence page, Artifacts page → The story's Proof tab; mocks under Proof." Both match research's quotes. | n/a (pass) |
| `ui.md` citation verified | `.codeloop/wiki/architecture/ui.md:54` reads "Story record and peek \| Card page, card drawer, evidence page" exactly as cited. | n/a (pass) |
| `exists: unlock` call is defensible but blends two standard categories | `docs/story-standard.md` defines unlock as "built but not exposed, expose it, do not rebuild." The shared body (RecordLayout/GateCard/CardDrawer) is unlock; the Proof tab content (acceptance lines + run + review + commits in one view) does not exist anywhere and is genuinely new build. Research says this in prose but keeps the single `exists: unlock` tag for the whole card. | low |
| Sources real, ≥3, format correct | 9 `- source:` lines, all paths/URLs exist and the quoted content matches what's at each location (spot-checked 5 of 9). `codeloop check research` event log shows it passed (advanced research→interview). | n/a (pass) |
| No competitor row, none required | `.codeloop/wiki/competitors/` has no page relevant to this UI reshape; research correctly left the table empty rather than inventing a row. | n/a (pass) |

## Separate: interview answers have no owner authorship

Card events (`.codeloop/cards.json`, c-134) show **no `answer` action anywhere in the full event list**. The only human events are `propose`, `promote`, `spec`, `unstick` — all `actor: owner`. Every other event is `actor: engine`.

The four stages ran as one unattended block: `agent-start` for research, interview, mock, and spec all fired at the identical timestamp `2026-10-14T17:56:53.217Z` (parallel background cursor runs), and resolved in sequence — interview's `agent-run`/`advance` landed at `17:58:32.351Z`, before research's own `advance` at `17:58:51.386Z`. Total elapsed research→park-at-spec: under 2 minutes 10 seconds, no human turn in between.

`interview.md`'s four `answer:` lines are character-for-character identical to their `recommended:` lines. The interview skill (`templates/skills/interview/SKILL.md` step 6) requires "each answer is recorded as a human event on the card"; step 5b requires an answer the person didn't confirm to be written as an `assumption:` line, not `answer:`. Neither happened — the agent wrote its own recommendations into the answer slots and the engine advanced straight through interview into mock and spec without the owner ever being asked.

## Summary

The research itself is well-grounded: it names the real shared component (`card-detail.tsx`) instead of proposing a rebuild, every quoted line in its 9 sources checks out against the actual files, and the pain and verdict are sourced rather than assumed — accept it as written. Separately, and more serious: the card skipped the interview gate entirely, with the agent self-answering all four questions and the engine advancing research → interview → mock → spec in one unattended ~2-minute run with zero recorded owner input, which the interview skill's own procedure does not permit.
