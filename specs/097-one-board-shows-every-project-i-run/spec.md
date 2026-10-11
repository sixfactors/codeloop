# c-097 spec: One board shows every project I run

Story: As a founder, I can see and act on every project from one board, so that I stop juggling servers and ports.

feature: hub
size: M
metric: projects_per_board
done_when: `bash scripts/playwright-hub-switch.sh` exits 0

acceptance:
- US1 Given two registered projects with the same card ids, when both are written to in parallel through the hub, then each project's cards.json holds only its own changes.
- US2 Given a person signed in once on the hub, when they switch from project A to project B, then B shows its own open question and no page error.
- US3 Given a running hub, when `codeloop serve` runs in a second project, then the same hub registers it and `serve --standalone` still serves one project alone.

screens: none

## Not building

- Start at login (`codeloop hub install`): optional, later.

## Failure modes

- Two projects' writes land in one cards.json (US1).
- A cached response or live update from one project reaches another (US1).
- Links rendered by the server point at the wrong project and the page errors on load (US2).
- A second serve starts a second hub, or standalone mode breaks (US3).
