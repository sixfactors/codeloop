## Q1 Does the edit guard from c-306 (no source edits before build, mock folder exempt) go into this card or stay its own?
options:
- A: Stays its own card, c-306, so c-307 holds only the review pass and stays within eight tasks
- B: Folded into c-307, so one card covers prevent and clean up
recommended: A
answer: Stays its own card, c-306, so c-307 holds only the review pass and stays within eight tasks

## Q2 What may the orchestrator fix on its own, without asking you?
recommended: Move a card forward to the stage its merged work shows when no gate lies between; skip a stage that no longer applies, with the reason; write a missing stage file from its template; close a card whose work is merged and verified. Everything that crosses a gate, splits or drops a card becomes an inbox question with the recommended answer.
answer: Alone: move a story forward to the stage its merged work shows when no gate lies between; close a story that is merged and verified. Never mark a stage skipped: write reasonable content for it from the merged work and the code, then a review step checks whether anything the stage needed was missed and turns real gaps into inbox questions. Anything that crosses a gate, splits or drops a story becomes an inbox question with the recommended answer. (owner, 2026-10-17)

## Q3 How often does the review pass run?
recommended: Once at the start of each /orch pass and before each pick, reading only cards changed since the last pass; the overnight `codeloop orch run --review` reads them all, stopping at the run budget.
answer: Once at the start of each /orch pass and before each pick, reading only cards changed since the last pass; the overnight `codeloop orch run --review` reads them all, stopping at the run budget.

## Q4 What proves it works?
recommended: Its first run on this repo's own board: the 20 cards with merged code at research are placed or asked with the evidence named, the 5 never-started cards skip research with a reason, and the pass report lists fixed, asked and could-not-tell. Plus one test per failure mode.
answer: Its first run on this repo's own board: stories with merged code at an early stage are placed or asked with the evidence named; a stage with no real need gets reasonable content written plus a review for anything missed, never a bare skip; the pass report lists fixed, asked and could-not-tell. Plus one test per failure mode. (owner, 2026-10-17)

## Rubric

- I2 pass: Q1 boundary, Q2 scope, Q3 risk, Q4 acceptance, the headings at specs/307-the-orchestrator-reviews-every-story-and/interview.md:1, :8, :12 and :16
- I4 pass: research open questions at specs/307-the-orchestrator-reviews-every-story-and/research.md:31 (edit guard) asked as Q1, research.md:32 (how often) asked as Q3, research.md:33 (which verbs alone) asked as Q2
- I6 pass: Q1 in specs/307-the-orchestrator-reviews-every-story-and/spec.md:37; Q2 in spec.md:14, spec.md:15, spec.md:16 and spec.md:38; Q3 in spec.md:17; Q4 in spec.md:10 and spec.md:18
