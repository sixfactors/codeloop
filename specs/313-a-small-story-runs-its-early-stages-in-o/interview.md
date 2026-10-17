## Q1 Which early steps should one agent carry in a single turn?
options:
- A: All of them (research, questions, drawing, plan, data), stopping at the first point where you approve something or answer a question
- B: Research and questions in one turn; drawing, plan and data in a second
recommended: A
answer: All of them (research, questions, drawing, plan, data), stopping at the first point where you approve something or answer a question

## Q2 When a small story folds its separate review step into its verify step, should it still wait for the reviewer before it merges?
recommended: Yes. The review work moves into the verify turn and the reviewer's approval moves with it, so nothing merges unreviewed.
answer: Yes. The review work moves into the verify turn and the reviewer's approval moves with it, so nothing merges unreviewed.

## Q3 When the agent asks you questions partway through a carried turn, should the turn stop there?
recommended: Yes, right after the questions are asked. The steps that depend on your answers wait, and the next turn starts from your answers.
answer: Yes, right after the questions are asked. The steps that depend on your answers wait, and the next turn starts from your answers.

## Q4 What would prove this works?
recommended: On this repo's own board, a new medium-sized story reaches the plan approval in one agent start instead of four or five, every step's check still shows on the story page, and a small story goes from build to merged in four starts instead of five.
answer: On this repo's own board, a new medium-sized story reaches the plan approval in one agent start instead of four or five, every step's check still shows on the story page, and a small story goes from build to merged in four starts instead of five.

## Rubric

- I2 pass: Q1 scope, Q2 risk, Q3 boundary, Q4 acceptance, the headings at specs/313-a-small-story-runs-its-early-stages-in-o/interview.md:1, :8, :12 and :16
- I4 pass: research open questions at specs/313-a-small-story-runs-its-early-stages-in-o/research.md:33 asked as Q1, research.md:34 as Q2, research.md:35 as Q3, research.md:36 as Q4
- I6 pass: Q1 in specs/313-a-small-story-runs-its-early-stages-in-o/spec.md:14 and spec.md:34; Q2 in spec.md:17; Q3 in spec.md:15; Q4 in spec.md:10 and spec.md:18; mapping at spec.md:27
