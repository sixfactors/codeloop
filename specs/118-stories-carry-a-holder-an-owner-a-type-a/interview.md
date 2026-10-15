## Q1 Scope: on migrate, do existing cards stay without the new fields until someone sets them, or does migration invent defaults (type story, holder from awaiting or last agent, owner from config)?
recommended: Leave them absent. Every new field is optional on read and write; migration only teaches writeCards the schema so today's cards.json still loads. No invented holder or owner. Type may default to story at display time later, not by rewriting every card.
answer: Leave them absent. Every new field is optional on read and write; migration only teaches writeCards the schema so today's cards.json still loads. No invented holder or owner. Type may default to story at display time later, not by rewriting every card.

## Q2 Acceptance: what proves the schema, validation and migration without a screen?
recommended: Vitest covers three cases: today's cards.json still loads; writeCards accepts a card with holder, owner, reviewer, type story|bug|chore, typed links, labels, area, risk and release; writeCards refuses an unknown type, an unknown link kind, and a link to a missing card id. `codeloop card show` prints the fields when present. No UI and no new CLI setters in this card.
answer: Vitest covers three cases: today's cards.json still loads; writeCards accepts a card with holder, owner, reviewer, type story|bug|chore, typed links, labels, area, risk and release; writeCards refuses an unknown type, an unknown link kind, and a link to a missing card id. `codeloop card show` prints the fields when present. No UI and no new CLI setters in this card.

## Q3 Risk: how do we keep gate `awaiting` (a role) from being confused with `holder` (person or agent), and what stops a stale blocked_by from starving Up next before link editing ships?
recommended: Schema docs and the Card type comment state awaiting is the gate role only and holder is independent; this card never writes holder from awaiting. Up-next blocking from links is c-119's job and must not ship until a way exists to clear or edit a link (c-128). c-118 stores and validates links only.
answer: Schema docs and the Card type comment state awaiting is the gate role only and holder is independent; this card never writes holder from awaiting. Up-next blocking from links is c-119's job and must not ship until a way exists to clear or edit a link (c-128). c-118 stores and validates links only.

## Q4 Boundary: does an agent-start or a gate park update holder automatically in this card, or is holder only stored here with hand-off left to a later card?
recommended: Stored only. Engine, agent-start and gates do not set holder in c-118. Hand-off and auto-updates belong with the CLI/SDK cards (c-128, c-129). Screens stay unchanged.
answer: Stored only. Engine, agent-start and gates do not set holder in c-118. Hand-off and auto-updates belong with the CLI/SDK cards (c-128, c-129). Screens stay unchanged.

## Q5 Keep engine `after` (queue, no lane slot) separate from typed links, or migrate `after` into a blocked_by link?
recommended: Keep `after` separate. It is lane-queue semantics the engine already understands; typed links are board relationships. Document both so agents do not replace after with blocked_by.
answer: Keep `after` separate. It is lane-queue semantics the engine already understands; typed links are board relationships. Document both so agents do not replace after with blocked_by.
