# c-313 research: A small story runs its early stages in one agent turn

## What exists

exists: build. Parts exist; carrying stages in one turn does not. Every stage starts its own agent: `orchTurn` places, briefs and runs one builder for the story's current stage (src/lib/orch.ts:428), and settles it with one hand-back for that stage (src/lib/orch.ts:237). `codeloop orch run --until <gate>` already loops stage by stage (src/lib/orch.ts:617), but each pass of the loop is a new agent start with a new brief. A lane stage has no key that groups it with the next one (`Stage`, src/lib/lane.ts:20): only `when:` decides whether it runs, and `stageApplies` reads only size (src/lib/lane.ts:100). On the shipped lane (.codeloop/lanes/build.yaml) research, interview, mock, spec and data-model run for size M and up, while build, verify, review, staging and live carry no `when:`, so an S story takes five agent turns and an M story ten.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | The person runs specify, clarify, plan and tasks one after another in the same agent chat, so the early phases share one session; nothing checks a phase before the next starts | https://github.com/github/spec-kit |
| Kiro | Spec mode drafts requirements, then design, then tasks in one session, pausing for the person to approve each document before the next | https://kiro.dev/docs/specs/ |

## The pain, grounded

pain: the founder pays for an agent start per thin stage. On this repo's board, 88 agent runs went to research, interview, mock, spec and data-model across 26 stories, with median runs of 1.9 to 3.3 minutes against 25 minutes for build, and an S story needs five agent turns (build, verify, review, staging, live). Source: agent-run events in .codeloop/cards.json counted on 2026-10-17, and the card note on c-313.

## Options

- **Add a carry key to lane stages so one agent turn runs consecutive stages up to the next gate or open question.** Chosen: the brief lists every stage in the carry, the agent writes each stage's file and runs `codeloop next` after each, so the engine still runs every stage check, writes every event and keeps every rubric; the turn ends at a gate, at questions waiting on the owner, or at a failed check. Review gets `when: size >= M` and its triage runs inside verify for an S story. It touches `src/lib/lane.ts`, `src/lib/orch.ts`, `src/lib/run.ts` and `.codeloop/lanes/build.yaml`.
- **Merge the thin stages into one lane stage with one combined check.** Lost: one check loses the per-stage rubrics and events, and the interview's pause for answers has nowhere to sit.
- **Keep one stage per turn but resume the same agent session.** Lost: it still starts a process and writes a brief per stage, and session resume differs by host.

## Risks

- One long turn can blow the agent's time limit. Bounded by: the carry ends at the first gate, open question or failed check, and the turn's timeout is the sum of the carried stages' budgets, capped.
- An agent in a carry could skip a stage file and run `codeloop next` on the next one. Bounded by: the engine only advances one stage per `next`, and each stage check reads its own file.
- Folding review into verify for S removes a stage that holds the reviewer's PR gate. The gate must move to verify for S, not disappear.
- The orchestrator settles one hand-back per stage today (src/lib/orch.ts:241); a carried turn needs one hand-back that names every stage it moved.

## Open questions

- Which stages may be carried together, and does the carry always stop at the spec gate?
- When an S story folds review into verify, does it still wait for the reviewer at the pull request?
- Does a carried turn stop the moment the agent asks the owner a question, or finish the stages it can first?
- What proves it: fewer agent starts per story on this board, measured how?

## Sources

- source: src/lib/orch.ts:428 — orchTurn runs one builder for one stage; the carry changes what one turn covers
- source: src/lib/orch.ts:617 — orch run already loops stage by stage, one agent start per loop
- source: src/lib/lane.ts:20 — the Stage shape has no grouping key; `when:` is size only
- source: .codeloop/lanes/build.yaml — which stages run for S and which for M, and where the spec and pr gates sit
- source: https://github.com/github/spec-kit — early phases run back to back in one agent chat
- source: https://kiro.dev/docs/specs/ — one session drafts requirements, design and tasks with a person's approval between documents

## Rubric

- R2 pass: `grep -n "carry\|group" src/lib/lane.ts .codeloop/lanes/build.yaml` finds no stage-grouping key, and `grep -n "agent-start" src/lib/orch.ts` shows one start per turn at src/lib/orch.ts:465
- R5 pass: specs/313-a-small-story-runs-its-early-stages-in-o/research.md:18
- R7 pass: specs/313-a-small-story-runs-its-early-stages-in-o/research.md:31

verdict: build
