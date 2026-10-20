## Q1 Scope: when the orchestrator relays your decision from chat, who does the board say decided? (builds on research.md:40)
recommended: You decided, and the orchestrator relayed it. The event names you as the decider, the session as the relayer, and keeps your reply word for word. The board shows "relayed by <session>" next to it.
answer: Simpler: record a relayed decision as the owner's approval. No relayer name and no quoted words required. (owner, 10-18)

## Q2 Risk: must every relayed decision carry your own words, or can the orchestrator apply one earlier "yes" to several stories? (builds on research.md:41)
recommended: Every relayed decision carries your words, one reply per story. One "yes to all three" may be quoted on each of the three stories it names, but never applied to a story it does not name.
answer: Not needed: with the simpler record, one owner yes in chat is enough; the orchestrator still applies it only to the stories the owner named. (owner, 10-18)

## Q3 Boundary: does approve with conditions also waive open review findings, or only accept recommended answers to interview questions? (builds on research.md:42)
recommended: Interview questions only. Findings stay a separate decision, because waiving one means accepting a known defect.
answer: Findings too: approve with conditions may accept recommended answers and waive open findings in one action, and the waived findings are listed on the story. (owner, 10-18)

## Q4 Acceptance: what is fast enough for the story page opened cold, after the hub has been idle? (builds on research.md:43)
recommended: The page frame shows at once (under 0.1 s), and the story text within 1 s, cold or warm. Checked by a test that opens a story after the index has closed.
answer: Fast and usable: the page frame shows at once and the story text within 1 s, cold or warm, checked by a test. (owner prefers fast, usable info, 10-18)

## Q5 Scope: which pages should Artifacts list? (builds on research.md:44)
recommended: Every page under docs/artifacts at any depth (system designs, workflows, plans) and every story's mock, each with its kind and story. Plans under docs/plans stay out: that folder holds private notes in some projects.
answer: Every page under docs/artifacts at any depth plus every story's mock, each with its kind and story; private plans folders stay out. Show the most useful first. (owner: fast, usable info, 10-18)

## Rubric

- I2 pass: Q1 scope, Q2 risk, Q3 boundary, Q4 acceptance, Q5 scope, each named in its own `## Qn` heading in this file
- I4 pass: research.md R7 open questions (1) to (5) are Q1 to Q5, each heading saying which research line it builds on (specs/362-i-approve-and-answer-from-chat-and-the-p/research.md:40 to :44)
- I6 pass: each answer is a line under `## Decisions` in specs/362-i-approve-and-answer-from-chat-and-the-p/spec.md:26 (Q1 `decided by:`, Q2 `which stories:`, Q3 `conditions:`, Q4 `speed:`, Q5 `artifacts:`); Q3 is also US1 to US3, Q4 is US4 and Q5 is US5
