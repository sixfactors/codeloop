## Q1 Scope: does this card only set the `blocked` flag from `blocked_by` links, or also enforce "a blocked story never enters Up next" (remap or refuse queued)?
recommended: Flag only. Wire `blocked` into `storyState` when a `blocked_by` target is not done or shipped. Put Up next exclusion in Not building until c-128 can clear or edit a link; shipping the rule now would starve a card with no fix path.
answer: Flag only. Wire `blocked` into `storyState` when a `blocked_by` target is not done or shipped. Put Up next exclusion in Not building until c-128 can clear or edit a link; shipping the rule now would starve a card with no fix path.

## Q2 Acceptance: what proves the six states and flags without a board screen?
recommended: Vitest on `storyState`: six-state mapping unchanged; retries still add `failing` on In progress; `blocked_by` to a non-done card adds `blocked`; target done or shipped clears it; dropped cards stay omitted. GET `/api/board` and `/api/home` already serve `display` — assert `flags` include `blocked` when linked. No UI mock (screens: none; c-136 draws the board).
answer: Vitest on `storyState`: six-state mapping unchanged; retries still add `failing` on In progress; `blocked_by` to a non-done card adds `blocked`; target done or shipped clears it; dropped cards stay omitted. GET `/api/board` and `/api/home` already serve `display` — assert `flags` include `blocked` when linked. No UI mock (screens: none; c-136 draws the board).

## Q3 Risk: which links set `blocked`, and what happens when the target is dropped, circular, or only has a reciprocal `blocks` link?
recommended: Only `blocked_by` sets the flag. A target that is done or shipped clears it; dropped counts as resolved (no block). `blocks` on the other card does not flag this one. Refuse to invent a second link store — resolve against the same `cards.json` c-118 writes. Circular pairs both show blocked until one is done; that is visible, not silent.
answer: Only `blocked_by` sets the flag. A target that is done or shipped clears it; dropped counts as resolved (no block). `blocks` on the other card does not flag this one. Refuse to invent a second link store — resolve against the same `cards.json` c-118 writes. Circular pairs both show blocked until one is done; that is visible, not silent.

## Q4 Boundary: what stays out so this card ends before screens, CLI link edit, and engine queue policy?
recommended: Derivation and tests only. No board HTML (c-136), no CLI/SDK setters for links (c-128/c-129), no change to `promoteQueued` or advance. Engine `after` stays separate from typed links (c-118). `stuck` and `failing` stay as today — Needs you via gate, failing as a flag on In progress.
answer: Derivation and tests only. No board HTML (c-136), no CLI/SDK setters for links (c-128/c-129), no change to `promoteQueued` or advance. Engine `after` stays separate from typed links (c-118). `stuck` and `failing` stay as today — Needs you via gate, failing as a flag on In progress.
