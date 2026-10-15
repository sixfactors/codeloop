# c-067 interview: Research writes the first draft

The owner answered all five questions on 2026-10-11, before research ran (card events `answer` Q1 to Q5). Research (research.md, 2026-10-14) built on those answers and left five open questions under `## Open questions for the interview`. `MAX_QUESTIONS` in src/lib/interview.ts:11 is five, so none can be asked as a sixth; each is settled below from an owner answer or from research's chosen option, and the two that rest on an inference are written into spec.md as `assumption:` lines for the owner to strike at the spec gate.

| Q | Tag | Builds on research line |
|---|---|---|
| Q1 | scope | `## Risks` "Screenshots": no code path takes one, `screenshots: none` must pass |
| Q2 | boundary | `## Risks` "Two research stages": plan.yaml has its own weaker research stage |
| Q3 | acceptance | `## The pain, grounded`: first run exited 1 in 693 ms with the template untouched |
| Q4 | risk | `## Risks` "Filler": `wiki/competitors/` was empty until this stage filled it |
| Q5 | other (boundary of the lane: when a card stops) | `## What exists`: nothing posts a "close?" question today |

## Q1 Scope: `codeloop research <card>` writes research.md and a draft spec.md. Are screenshots required or best-effort, and does it read the competitor wiki first?
recommended: At least three sources required; screenshots best-effort through Chrome MCP when present, otherwise a `screenshots: none` line; `wiki/competitors/` is read before any web search.
answer: At least three sources required; screenshots best-effort through Chrome MCP when present, otherwise a `screenshots: none` line; `wiki/competitors/` is read before any web search.

## Q2 Who runs it: every scan proposal automatically, the plan lane on Monday, or Dean on demand?
recommended: On demand, and in the Monday plan run for the top five backlog cards only; not on every scan proposal (cost).
answer: On demand, and in the Monday plan run for the top five backlog cards only; not on every scan proposal (cost).

## Q3 Acceptance: what proves it?
recommended: Given a backlog card, when `codeloop research c-xxx`, then research.md has an `exists:` verdict and three sources with URLs, spec.md has story, acceptance and `## Not building`, and the card reaches the spec gate under 30 minutes on a dogfood card.
answer: Given a backlog card, when `codeloop research c-xxx`, then research.md has an `exists:` verdict and three sources with URLs, spec.md has story, acceptance and `## Not building`, and the card reaches the spec gate under 30 minutes on a dogfood card.

## Q4 Riskiest assumption: web research produces generic filler. Where is the bar?
recommended: One source must be a competitor page already in the wiki; research.md must answer unlock-vs-build with a path or URL; `check file` fails without both.
answer: One source must be a competitor page already in the wiki; research.md must answer unlock-vs-build with a path or URL; `check file` fails without both.

## Q5 When the verdict is `have` or `unlock`, auto-close the card or ask?
recommended: Park it with one inbox question "close? recommended yes"; never auto-close.
answer: Park it with one inbox question "close? recommended yes"; never auto-close.

## Research's open questions, settled

Each line names the R7 question, how it is settled, and where the settlement lives.

- R7-1 Where a researched backlog card sits when the verdict is `build`. Settled by Q3's answer: the card "reaches the spec gate", so it stays in the research stage and flows on to interview; it is in flight and counts against `wip:` from the moment `codeloop research` runs. Written as spec.md `assumption:` (the wip count is inferred, the owner did not say it).
- R7-2 Whether the draft-spec bar lives in `check research` or in a flag only `codeloop research` sets. Settled by research's chosen option: `codeloop research` is `card run` on the build lane's research stage (src/commands/card.ts:275), so there is one done cmd and one place for the bar; it applies to every build-lane card. Q4's answer names `check file` as the mechanism. Written as spec.md US3 and `done_when:`.
- R7-3 Which skill drafts spec.md. Settled by research's chosen option (research.md `## Options`, first bullet, and `.codeloop/wiki/decisions/extend-the-research-stage-that-already-r.md`): the research skill gains a second output. The spec skill still rewrites spec.md at the spec stage from the interview answers; the draft is a proposal.
- R7-4 Whether the Monday run reuses the build lane's research stage or the plan lane's own `research` stage changes. Settled by Q2's answer plus research's "Two research stages" risk: the plan run calls `codeloop research <card>` on the top five proposed cards, which is the build stage's skill and check; `.codeloop/lanes/plan.yaml`'s own research stage is unchanged. Written as spec.md `assumption:` (which stage was not in the owner's answer).
- R7-5 Where the "close? recommended yes" question parks the card. Settled by Q5's answer and the chosen option: parked the way `card park` does, at the research stage it is in, which frees the lane slot; the card never reaches the spec gate on a `have` or `unlock` verdict. Written as spec.md US4.

## Rubric

- I2 pass: Q1 scope, Q2 boundary, Q3 acceptance, Q4 risk, Q5 the one other (when a card stops); the table at the top of specs/067-research-writes-the-first-draft/interview.md names each tag and the research.md line it builds on
- I4 pass: research.md `## Open questions for the interview` lists five; none can be asked (five questions already answered, `MAX_QUESTIONS = 5` at src/lib/interview.ts:11); each is settled with its reason under `## Research's open questions, settled` in specs/067-research-writes-the-first-draft/interview.md, R7-1 and R7-4 also as `assumption:` lines in specs/067-research-writes-the-first-draft/spec.md
- I6 pass: Q1 → spec.md US2 and `## Not building` (no web search key, screenshots best-effort); Q2 → US5 and `## Not building` (not every scan proposal); Q3 → US1 and `done_when:`; Q4 → US3; Q5 → US4; all in specs/067-research-writes-the-first-draft/spec.md, verifiable with `codeloop check file specs/067-research-writes-the-first-draft/spec.md --has 'US1' --has 'US5' --has 'screenshots: none' --has 'close? recommended yes'`
