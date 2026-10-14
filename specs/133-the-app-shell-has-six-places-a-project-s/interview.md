## Q1 Scope: how much of "Everywhere" (⌘K actions, peek, keyboard) ships on this card — nav IA only with today's search palette, or the full design §5 chrome (approve / answer / create / move in ⌘K, peek over lists, j/k/a/r/c)?
recommended: Ship the six-place rail, Settings at the bottom, project switcher (All projects kept), and extend ⌘K with the named actions plus list peek and j/k navigation on lists that already have a drawer/sheet. Defer bulk multi-select and saved views, and do not rebuild Home/Board/Plan/Releases/Wiki/Reports bodies here.
answer:

## Q2 Acceptance: what proves a founder can move between the six places with switcher and palette, without building each screen's content?
recommended: One shell mock (`screens: app-shell`) showing the six nav labels, Settings, switcher and ⌘K chrome, plus a Vitest (or Playwright smoke) that `navGroups` / routes expose Home, Board, Plan, Releases, Wiki, Reports — and no longer Initiatives, Roadmap, Artifacts or Stats as first-class rail items. Placeholder Plan/Releases/Reports routes may render an empty shell page; `codeloop check mock c-133` passes.
answer:

## Q3 Risk: what happens to today's Initiatives, Roadmap, Artifacts, Stats (and Inbox) URLs when the rail drops them — redirects to the new places, keep silent aliases, or 404?
recommended: Redirect Initiatives and Roadmap to Plan, Stats to Reports, Artifacts into the story Proof path (or Board until Proof exists), and Inbox/hub-home into Home. Keep aliases only long enough that hub `/p/<id>/...` bookmarks do not break; do not leave the old labels in the rail.
answer:

## Q4 Boundary: where does this card stop relative to screen bodies (c-134+), Releases data (c-123), the Agents panel on Home, and Settings?
recommended: This card owns the shared AppShell chrome only: six nav slots with stub destinations, switcher, palette/peek/keyboard as scoped in Q1, and Settings still at the bottom. Out of scope: Home/Board/Plan/Wiki/Releases/Reports layouts and data (later screen cards), release list from git tags (c-123), the Agents live panel in the Home nav, and Settings contents (members, workflow, Up next).
answer:

## Rubric

- I2 pending: Each question is tagged scope, acceptance, risk or boundary; at most one other
- I4 pending: Every R7 open question is asked here or marked settled with a reason
- I6 pending: Once answered, each answer is folded into spec.md and the field named
