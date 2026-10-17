# c-311 research: Every story opens with what is needed, what is done and what I must do

## What exists

exists: build. Parts exist; the summary does not. The story page (workspace/components/shared/card-detail.tsx:163) stacks, in order, the step bar, the current-step panel with the raw check line and every rubric row, the orchestration turns, the task and commit list, and tabs for output, activity and spec, with a details rail; nothing above them says in a sentence what the story needs or what waits on the founder. A card carries a title, a story line and a description (src/lib/cards.ts:130) but no summary field. The closest thing an agent writes at the end of its turn is the hand-back's `left` and `blocked` lines (src/lib/handback.ts:37), which only orchestrated turns write and which the page shows deep inside the orchestration section (workspace/components/shared/orchestration-section.tsx:90). Whether the story waits on a person is already known (`holder` on the journey, src/lib/journey.ts:67), so the "what I must do" part can be checked against the board's own facts.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| BMAD | Each story file carries a Dev Agent Record the developer agent fills in as it works (completion notes, file list, change log), with the story's status at the top of the file | https://github.com/bmad-code-org/BMAD-METHOD |
| Spec Kit | No per-feature summary: the spec, plan and tasks files are read in full, and progress is the ticked task list | https://github.com/github/spec-kit |

## The pain, grounded

pain: the founder opens a story to find the one thing waiting on them and has to read past checks, rubric rows and logs to find it. The owner wrote on 2026-10-17 that the story page is overwhelming and that finding what to do in the noise is hard. Source: the card note on c-311 (`codeloop card show c-311`) and the page order in workspace/components/shared/card-detail.tsx:163.

## Options

- **Store a three-line summary on the story, written by the agent at the end of its turn.** Chosen: the agent that last worked the story writes or improves what the story needs, what is done and the one thing waiting on the founder, through the hand-back or a story command; the page shows it in one card above everything, and the step bar, rubric, events and raw check output fold under it. The "waiting on you" line is checked against the board's own facts, so a stale summary cannot hide a gate. It touches `src/lib/cards.ts`, `src/lib/handback.ts`, `src/lib/services.ts` and `workspace/components/shared/card-detail.tsx`.
- **Work the summary out from the board's facts, with no agent writing.** Lost: the facts say which step the story is on and whether a gate waits, but not what the story needs in plain words, and the owner asked for the agent that worked the story to write it. It survives as the fallback for a story no agent has summarised yet.
- **Fold the existing panels away and add nothing.** Lost: the page gets quieter, but there is still no sentence that says what to do.

## Risks

- A summary written once goes stale as the story moves. Bounded by: it carries who wrote it and at which step, and the "waiting on you" line comes from the board, not from the text.
- An agent can write a summary that hides a problem. Bounded by: a failing check or a gate is always shown in the summary card whatever the text says.
- Folding detail away can hide something a reviewer needs. Bounded by: every folded section keeps its heading and a count, so a red rubric row is still visible from the top.
- c-308's stuck explanation needs a place on the same card; the two stories must agree that it fills the "what I must do" line for a stuck story.

## Open questions

- Which parts stay visible under the summary and which fold away until opened?
- Can the founder edit the summary, and may the agent change a line the founder wrote?
- What shows at the top of a story no agent has summarised yet?
- How is a stale summary marked once the story has moved on?

## Sources

- source: workspace/components/shared/card-detail.tsx:163 — the page order today: step bar, check panel, orchestration, tasks, tabs; nothing above them summarises
- source: src/lib/handback.ts:37 — the hand-back already carries left and blocked lines from the agent, the natural place for an end-of-turn summary
- source: workspace/components/shared/orchestration-section.tsx:90 — where left and blocked show today, deep in the page
- source: https://www.nngroup.com/articles/progressive-disclosure/ — show the few things most people need first and move the rest to a secondary view, the rule for folding detail under the summary
- source: https://www.nngroup.com/articles/inverted-pyramid/ — lead with the conclusion and put supporting detail after it, the order for needed, done and what I must do
- source: https://github.com/bmad-code-org/BMAD-METHOD — the developer agent writes its own record into the story file as it finishes, prior art for the agent writing the summary

## Rubric

- R2 pass: `grep -c summary src/lib/cards.ts src/lib/handback.ts` returns 0 for both; the page in workspace/components/shared/card-detail.tsx:163 renders no summary block
- R5 pass: specs/311-every-story-opens-with-what-is-needed-wh/research.md:18
- R7 pass: specs/311-every-story-opens-with-what-is-needed-wh/research.md:31

verdict: build
