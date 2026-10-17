## Q1 How many small stories may build together in one turn, and must they change different files?
options:
- A: Up to five, and only stories that change different files; the rest wait for the next batch
- B: Up to ten, with stories that change the same file allowed and merged carefully
recommended: A
answer: Up to five, and only stories that change different files; the rest wait for the next batch

## Q2 When one story in a batch fails, what happens to the others?
recommended: The failing story leaves the batch and gets its own next turn, with the failure named on its page; the others carry on and move forward on their own results.
answer: The failing story leaves the batch and gets its own next turn, with the failure named on its page; the others carry on and move forward on their own results.

## Q3 May stories from different features build together?
recommended: Yes, as long as they change different files. Each still counts toward its own feature, and its page says which batch built it.
answer: Yes, as long as they change different files. Each still counts toward its own feature, and its page says which batch built it.

## Q4 Does each story still get its own checks and its own approval, or one for the whole batch?
recommended: Each story keeps its own checks, its own verify and its own approvals, exactly as if built alone; only the agent turn is shared. Proof: three small fixes on this repo build in one agent start and each passes or fails on its own page.
answer: Each story keeps its own checks, its own verify and its own approvals, exactly as if built alone; only the agent turn is shared. Proof: three small fixes on this repo build in one agent start and each passes or fails on its own page.

## Rubric

- I2 pass: Q1 scope, Q2 risk, Q3 boundary, Q4 acceptance, the headings at specs/314-several-small-stories-build-together-in/interview.md:1, :8, :12 and :16
- I4 pass: research open questions at specs/314-several-small-stories-build-together-in/research.md:33 asked as Q1, research.md:34 as Q2, research.md:35 as Q3, research.md:36 as Q4
- I6 pass: Q1 in specs/314-several-small-stories-build-together-in/spec.md:14, spec.md:17 and spec.md:38; Q2 in spec.md:16; Q3 in spec.md:17 and spec.md:18; Q4 in spec.md:10, spec.md:15, spec.md:18 and spec.md:39; mapping at spec.md:27
