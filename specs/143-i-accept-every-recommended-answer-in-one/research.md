# c-143 research: I accept every recommended answer in one command

## What exists

exists: have — `codeloop answer <card> --accept-all` ships: src/commands/ask.ts:44, engine src/lib/interview.ts:179 (`acceptAllAnswers`), service src/lib/services.ts:489, HTTP `POST /api/cards/:id/questions/accept-all` at src/lib/server.ts:251, SDK `questions.acceptAll` at src/sdk/client.ts:356. Added in commit 614bbe8. The card's ask is already met; close it rather than build.

Proof the verdict is right: `grep -rniE "acceptAll|accept-all" src` finds the command, engine, service, route and SDK; `src/lib/__tests__/question-options.test.ts:70` and `:78` run the engine and the route. The same grep over `ui/` returns nothing, and `src/lib/mcp.ts:76` has only the per-question `accept` flag: those are the two surfaces without it.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | `/speckit.clarify` asks questions one at a time with a recommended option; the user replies "yes" or "recommended" per question. No batch accept. | https://github.com/github/spec-kit |
| BMAD | Elicitation menus are numbered; the user picks per step, there is no accept-all. | https://docs.bmad-method.org/ |

## The pain, grounded

pain: a founder who owns a card with six agent questions typed `answer --accept` six times before accept-all existed. Source: the commit that added it, 614bbe8, and scripts/first-user.sh:173, which still loops `--accept` three times in a row.

## Options

- Close the card as `have`; add `--accept-all` to `README.md` and the MCP tool in `src/lib/mcp.ts`, nothing else. Chosen.
- Build accept-all again as a new command (`codeloop accept <card>`). Rejected: a second spelling of `src/lib/interview.ts` splits the docs and the tests for no new capability.
- Add a UI "Accept all" button in `ui/components/card-detail.tsx`. Deferred: real gap (per-question button only, line 73), but a separate card with its own acceptance line.

## Risks

- scripts/first-user.sh:173 still uses three `--accept` calls, so it does not exercise the batch path.
- Accept-all by an agent through MCP would take the owner's decision; src/lib/mcp.ts uses `mcpRole()`, so any addition must keep the role check.

## Open questions for the interview

- Is the card satisfied by the CLI command, or does "one command" mean the board and MCP too?
- Should accept-all also skip questions whose recommendation is an option letter that fails to resolve, or refuse as it does now (src/lib/interview.ts:186)?
- Should the UI get the button under this card or a new one?

## Sources

- source: src/commands/ask.ts:44 — the CLI flag already shipped
- source: src/lib/interview.ts:179 — engine function that accepts every open recommendation in one locked write
- source: src/lib/__tests__/question-options.test.ts:70 — test that proves the batch path
- source: https://github.com/github/spec-kit - per-question accept only, no batch
- source: https://docs.bmad-method.org/ - numbered choice per step, no batch

verdict: have

## Rubric

- R2 pass: `grep -rniE "acceptAll|accept-all" src` lists ask.ts:44, interview.ts:179, services.ts:489, server.ts:251, client.ts:356; the same grep over ui/ is empty
- R5 pass: three options under ## Options; the re-build lost on src/lib/interview.ts:179 already existing, the UI button deferred as its own card
- R7 pass: three questions listed at specs/143-i-accept-every-recommended-answer-in-one/research.md:31, none answered here
