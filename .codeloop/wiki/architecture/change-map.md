# Change map

| To change | Edit | Then run |
|---|---|---|
| How a card moves, is approved or rejected | `src/lib/engine.ts` | `bash scripts/e2e-founder-loop.sh` |
| What an agent is told for a stage | `src/lib/agent.ts` | `npm test -- agent` |
| Which lanes are due on the schedule | `src/lib/run.ts` | `npm test -- agent` |
| Add a capability to the board and CLI | `src/lib/services.ts` | `npm test -- sdk` |
| Add or change an API route | `src/lib/server.ts` | `npm test -- server` |
| A CLI command's flags or output | `src/commands/card.ts` | `npm test -- help` |
| What the browser can call | `src/sdk/client.ts` | `npm test -- sdk` |
| A board screen | `workspace/lib/api.ts` | `npm run build:workspace` |
| The lane file format or its lint | `src/lib/lane.ts` | `node dist/index.js lane lint` |
| How wiki pages are written and linted | `src/lib/wiki.ts` | `npm test -- wiki` |
| The architecture check | `src/lib/architecture-check.ts` | `node dist/index.js check architecture` |
| Config keys | `src/lib/config.ts` | `npm test -- validate-config` |
