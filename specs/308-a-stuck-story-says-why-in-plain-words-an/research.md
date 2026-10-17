# c-308 research: A stuck story says why in plain words and which action will move it

## What exists

exists: build. Parts exist; the explanation does not. `stuckReason` (src/lib/cards.ts:44) returns one line: the stuck event's first note line, "nothing changed since the last agent start", "the check crashed", or "the check failed N times". The story page prints it as "Stuck because ..." and offers "Approve: unstick" (workspace/components/shared/current-step-panel.tsx:120), and approve on a stuck story only zeroes the stage's retries and writes `unstick` (src/lib/engine.ts:992), so on an unchanged file the same check fails again. The inbox's failing list shows the last line of the last fail note (`last_check`, src/lib/inbox.ts:182), which is how a crash's stderr tail ("Node.js v26.4.0") became c-098's reason. The facts an explanation needs are all computed elsewhere: whether work was tried (`workTried`, src/lib/engine.ts:730, from agent runs, work lines and story commits), what shipped under the id (the story's commits on the full card, shown by `TasksAndCommits`), and the moves that change the outcome (`placeCard`, `approve`, `reject`). Nothing joins them into one answer.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | No stuck state: a command that fails reports in the agent chat, and the person decides whether to rerun it; nothing says whether work was tried | https://github.com/github/spec-kit |

## The pain, grounded

pain: a founder opens a stuck story and is offered a retry that cannot work. c-136's page showed "research.md cites 0 sources" and "Approve: unstick", which reruns the same check on the same empty file, while the whole board it describes had shipped in 9ade47c; the inbox kept c-302's old failure after later passes, and c-098's reason read "Node.js v26.4.0". Source: .codeloop/wiki/gotchas/stuck-without-any-work.md and the card note on c-308.

## Options

- **Build one stuck explanation on the server from the story's events and commits.** Chosen: one function beside `stuckReason` answers three things in plain words (was any work tried since the story entered the stage, what already shipped under its id, and which action changes the outcome: place it forward, write the stage file, or let an agent run), and the story page, the inbox and the command line all print the same answer. It touches `src/lib/cards.ts`, `src/lib/journey.ts`, `src/lib/inbox.ts` and `workspace/components/shared/current-step-panel.tsx`, and keeps the join on the server as the repo's no-client-join rule asks.
- **Reword the panel copy on the story page only.** Lost: the inbox and the command line keep printing the raw last line, and the page would have to fetch commits and events and join them in the browser to name the right action.
- **Hide "Approve: unstick" when nothing changed.** Lost: it removes the one button without saying which action does work, so the founder is left with nothing.

## Risks

- Naming the wrong action is worse than naming none. Bounded by: the action is picked from a fixed list, each with the fact that chose it (no agent run since entry, three commits outside docs), and "let it run" is the default when nothing else applies.
- The explanation can drift from the retry model in src/lib/engine.ts:704. Bounded by: it reads the same `workTried` facts, not a second copy of the rule.
- c-307's review pass will fix many of the same stories alone. The two share facts but not ownership: c-307 moves stories, this story only explains and offers the move.
- The inbox failing list and the story page could still disagree if one reads the last fail and the other the stuck event. Both must read the one explanation.

## Open questions

- Which actions may the stuck explanation offer as buttons, and which only as instructions in words?
- Should the inbox drop a failure once a later check on the same stage has passed, or show it as history?
- What does a crashed check show instead of the last line of its error output?
- Where does this explanation sit on the story page now that c-311 puts a summary above everything?

## Sources

- source: .codeloop/wiki/gotchas/stuck-without-any-work.md — the c-136 timeline and the three answers a stuck explanation owes: work tried, what shipped, which action
- source: src/lib/cards.ts:44 — stuckReason returns one line from the stuck event, so the explanation is new work, not a rename
- source: workspace/components/shared/current-step-panel.tsx:120 — the page offers "Approve: unstick" for every stuck story, whatever caused it
- source: src/lib/inbox.ts:182 — last_check takes the last note line, which for a crash is stderr, the c-098 symptom
- source: https://www.nngroup.com/articles/error-message-guidelines/ — a good error message says what happened in plain words and offers a remedy the person can act on
- source: https://elm-lang.org/news/compiler-errors-for-humans — an error that names the likely fix beats one that restates the failure, the model for "which action moves it"
- source: https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/ — a condition carries a short machine reason and a human message side by side, the shape for one explanation read by page, inbox and command line

## Rubric

- R2 pass: `grep -rn "stuckReason" src/lib workspace/components` finds only src/lib/cards.ts:44, src/lib/journey.ts:109, src/lib/journey.ts:266 and current-step-panel.tsx:120, all passing the one-line reason; no function returns work tried, what shipped and an action together
- R5 pass: specs/308-a-stuck-story-says-why-in-plain-words-an/research.md:17
- R7 pass: specs/308-a-stuck-story-says-why-in-plain-words-an/research.md:30

verdict: build
