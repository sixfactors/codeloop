# Start here

codeloop moves cards through lanes: a stage is finished when its check command exits 0, and a gate holds the card until the owner or reviewer approves. The engine, the API, the SDK, the CLI and the board app are layered; [architecture/overview](architecture/overview.md) has the diagram and the folder table.

## Set up

```
npm ci
npm --prefix ui ci
npm run build:all
npm test
```

`npm run build:all` also builds the board app in the workspace folder; `scripts/e2e-founder-loop.sh` and the CLI tests run against `dist/`, so build first.

## The three things you will actually do here

1. **Run the tests for one area.** `npm test -- lane-engine`, then `bash scripts/e2e-founder-loop.sh` after touching the engine, lanes, gates or runs.
2. **Open the board on this repo's own cards.** `codeloop serve --owner` prints a URL with the write token; without the owner flag approvals are refused.
3. **See what waits for you, or dry-run the agent.** `codeloop inbox` lists gates and shipped cards; `codeloop run --agent --dry-run` names what a scheduled run would start.

## Where to go next

- [Overview](architecture/overview.md) and [flows](architecture/flows.md): the layers and three real journeys
- [Invariants](architecture/invariants.md): the rules and the tests that guard them
- [Change map](architecture/change-map.md): which file to edit for a given change
- [Commands](runbooks/commands.md): every npm script and script file
- [Gotchas](gotchas/adopt-without-from-overwrites-the-index.md): mistakes already hit, scoped to files
