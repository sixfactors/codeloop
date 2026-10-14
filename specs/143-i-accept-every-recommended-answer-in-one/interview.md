# c-143 interview: I accept every recommended answer in one command

Builds on research.md: verdict `have` (line 5), UI and MCP gaps (line 7), open questions (lines 33-35).

## Q1 Scope: is the card met by the CLI command alone, or must the board and MCP also accept all? CLI only, or CLI plus board and MCP?
recommended: CLI only. `codeloop answer <card> --accept-all` already ships (research.md:5), so close the card as `have`. The board button and MCP flag go to new cards (research.md:7).
answer:

## Q2 Boundary: when a recommendation is an option letter that does not resolve, should accept-all skip that question or refuse the whole batch? Skip, or refuse?
recommended: Refuse the whole batch, as src/lib/interview.ts:186 does now, and name the question. A half-applied accept-all leaves the owner unsure what was decided.
answer:

## Q3 Risk: an agent calling accept-all through MCP would take the owner's decision. Should any new surface keep the role check? Yes, or allow agents?
recommended: Keep the role check. Accept-all stays owner-only on every surface; `mcpRole()` in src/lib/mcp.ts decides, and an agent run is refused (research.md:29).
answer:

## Q4 Acceptance: what proves a new accept-all surface works, and should scripts/first-user.sh:173 use it? Given what, then what?
recommended: Given a card with three open questions, when the owner runs `codeloop answer <card> --accept-all`, then all three are answered and `codeloop check questions` exits 0. Switch scripts/first-user.sh:173 to one `--accept-all` call so the batch path runs in the first-user proof (research.md:28).
answer:

## Rubric

- I2 pass: Q1 scope, Q2 boundary, Q3 risk, Q4 acceptance in specs/143-i-accept-every-recommended-answer-in-one/interview.md; every heading carries a tag word.
- I4 pass: the three open questions at research.md:33-35 map to Q1, Q2 and Q1 (UI button under a new card, folded into Q1's recommendation); none left unasked.
- I6 pass: once answered, Q1 goes to spec.md Scope, Q2 to Boundary, Q3 to Risks, Q4 to Acceptance; check with `grep -n "accept-all" specs/143-i-accept-every-recommended-answer-in-one/spec.md`.
