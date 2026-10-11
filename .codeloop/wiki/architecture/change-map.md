# Change map

| To change | Edit | Then run |
|---|---|---|
| What a stage must pass before a card moves (its done.cmd) | `.codeloop/lanes/wiki.yaml` | `codeloop lane lint` |
| The rules for advance, approve, reject or stuck | `src/lib/engine.ts` | `npm test -- lane-engine` |
| How an agent is started, limited or timed out | `src/lib/agent.ts` | `npm test -- agent` |
| Which cards a scheduled run picks up | `src/lib/run.ts` | `bash scripts/e2e-founder-loop.sh` |
| A new capability on the board (service, route, SDK op) | `src/lib/services.ts` | `npm test -- sdk` |
| A new route or its status code | `src/lib/server.ts` | `npm test -- server` |
| A new CLI subcommand | `src/program.ts` | `npm test -- help` |
| The brief an agent is given for a stage (buildBrief) | `src/lib/agent.ts` | `codeloop brief c-096` |
| The architecture check's rules | `src/lib/architecture-check.ts` | `codeloop check architecture` |
| A board screen | `workspace/lib/api.ts` | `npm run build:workspace` |
| The agent's skill for a wiki stage | `templates/skills/architecture/SKILL.md` | `codeloop skill eval architecture` |
| Docs site content | `site/content/docs/concepts/wiki-and-learning.md` | `npm --prefix site run build` |
