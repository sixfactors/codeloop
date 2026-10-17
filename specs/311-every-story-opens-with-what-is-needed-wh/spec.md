# c-311 spec: Every story opens with what is needed, what is done and what I must do

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can open any story and read, above everything else, a short plain-English summary of what it needs, what is already done, and the one thing waiting on me, so that I don't dig through checks, rubric rows and logs to find my part.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: the story page at http://localhost:4040/p/codeloop/cards/c-311/ opens on the summary card, with the buttons and step bar under it and every other section folded, and `npm test -- src/lib/__tests__/story-summary.test.ts` exits 0

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given any story, when the founder opens its page, then a summary card above everything shows what the story needs, what is done and the one thing waiting on them, each line with who wrote it and when, and the action buttons and the step bar sit right under it.
- US2 Given the story page, when it opens, then check results and scores, the full history, raw output, the task and commit list and the details panel are folded under headings that each keep a count, and a failing check shows on its heading without opening it.
- US3 Given an agent ends its turn on a story, when it hands back, then it writes or improves the summary, adding to but never replacing a line the founder wrote, and the founder can edit any line from the page.
- US4 Given a story no agent has summarised yet, when its page opens, then the summary is worked out from the board's facts and marked as not yet written by an agent.
- US5 Given a summary written at an earlier step, when the story has moved past that step, then the summary is marked as written before the latest step, and the line saying what waits on the founder always comes from the board, so a gate or a stuck story is never hidden.

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens:
- story-page

<!-- App mocks only: `drop` deletes the mock page at review (`codeloop mock cleanup <card>`), `keep` leaves it in the app. Default drop. -->
mock: drop

## Answers folded in

- Q1 (summary, buttons and step bar in view; everything else folded): US1 and US2.
- Q2 (the founder can edit; the agent adds but never replaces the founder's lines; each line says who and when): US1 and US3.
- Q3 (before any agent writes, a summary from the board's facts, marked as such): US4.
- Q4 (who wrote it and at which step, marked once the story moves on; what waits on the founder always from the board): US5.

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- The summary on board cards or in the inbox; this story changes the story page only.
- Writing the summary with a separate model call; the agent that worked the story writes it at the end of its turn.
- The stuck explanation itself; it is built by its own story and shown here as the summary's "what you must do" line.
- Removing any section from the page; detail is folded, not deleted (Q1).

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- The summary text says nothing waits on the founder while a gate is waiting (uc-311-01).
- An agent's end-of-turn summary replaces a line the founder wrote (uc-311-02).
- A summary from an earlier step is shown as current after the story moved on (uc-311-03).
- A folded section hides a failing check with no sign on its heading (uc-311-04).
- A story with no summary shows an empty top of the page (uc-311-05).
- The founder's edit and an agent's hand-back land at the same time and one is lost (uc-311-06).
- On a phone the summary pushes the action buttons out of the first screen (uc-311-07).
