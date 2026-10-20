# c-362 research: I approve and answer from chat, and the page loads fast and lists every artifact

## What exists

exists: build. The pieces exist one at a time, and nothing joins them.

- Answering and approving work from a chat session today, but nothing records that the owner said it in chat. `resolveRole` makes any process that is not an agent run the owner (src/lib/engine.ts:60). Commit e21c0ac removed the assistant-session variables that used to make Claude Code and Cursor sessions act as agent. So an orchestrator that runs `codeloop approve` acts as the owner with no record that it relayed the owner's words. A card event carries `actor`, `human` and `gate`, and `approvalId` is reserved for an authenticated store (src/lib/cards.ts:8-30). There is no field for "on behalf of", "relayed by" or the owner's quoted reply.
- Approve and accept-all are separate calls. `codeloop approve` takes `--as` and `--note` only (src/commands/card.ts:488). `codeloop answer --accept-all` is its own command (src/commands/ask.ts:43). Their services (src/lib/services.ts:233, :531), API routes (src/lib/server.ts:220, :311) and SDK calls (src/sdk/client.ts:162, :221) are separate too. On the board, the Accept all button (workspace/components/shared/questions.tsx:81) and Approve (workspace/hooks/use-api.ts:310) are separate. Approving with open questions rolls back, because the stage check `check questions` fails on unanswered questions (src/commands/check.ts:183).
- The story page paints nothing while the server renders. There is no loading.tsx anywhere under workspace/app. The layout awaits the card list and config before sending HTML (workspace/app/layout.tsx:33). Server fetches give up after 2 seconds (workspace/lib/api.ts:61), and every API read awaits the project index (src/lib/server.ts:155). The hub closes an idle project's index after 30 minutes (src/lib/hub.ts:21) and rebuilds it on the next request. So the first story opened after a quiet spell waits up to the 2-second timeout, then the client fetches again. Measured warm on 17 October, a full load showed the story text in 43 to 54 ms over three runs, which matches the owner's 0.03 s API timing.
- Artifacts lists only mocks and two top-level pages. `ArtifactsRepo.list` reads only the top level of docs/artifacts (src/lib/store/file.ts:540). Every page under docs/artifacts/<project>/<topic>/ is skipped, including the c-320, c-321 and c-058 system designs, the c-058 workflow and c-321-implementation-plan.html. The walker that does see them, `allArtifactFiles` (src/lib/artifact.ts:46), is not exported. It also labels any file without a kind suffix a mock (src/lib/artifact.ts:278).

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| BMAD | Gates are lettered menus in the chat ([A] Approve, [E] Edit), and the agent halts until the person picks one. Approval is recorded only as the spec file's status (ready-for-dev), with no record of who approved. No accept-all of recommended answers. Its index-docs skill that listed generated documents was removed from core | https://github.com/bmad-code-org/BMAD-METHOD/blob/49069b8b/src/bmm-skills/4-implementation/bmad-quick-dev/step-02-plan.md |
| Kiro | The person confirms each spec phase (requirements, design, tasks) in chat before the next. Analyze Requirements offers a suggested fix per question to select one at a time; there is no documented accept-all and no named approver. Specs are listed in a Specs pane and by #spec in chat | https://kiro.dev/docs/specs/ |
| Spec Kit | /speckit.clarify asks up to five questions one at a time, each with "Recommended: Option X"; replying "yes" or "recommended" accepts that one, never all at once. Answers go into spec.md under Clarifications with no attribution. No catalog of documents beyond the specs/ folders | https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md |

None of the three records that an approval was given in chat, by whom, or in the person's own words. None accepts every recommendation in one step. Codeloop can do both, because its questions already carry a recommended answer (src/lib/interview.ts:98) and every answer is an event.

## The pain, grounded

pain: the founder clears decisions in chat with the orchestrator and away from the keyboard. Each decision takes one command per question plus an approve, and none of it shows that the owner made the call. The owner's notes of 10-18 on c-361 and c-362 (.codeloop/cards.json) ask to "answer an owner decision in chat when the orchestrator asks it, with Codeloop recording the approval as given on my behalf". They also record that the story page "shows a blank state for about 2s though its data returns in 0.03s" and that the "Artifacts page lists only mocks, not system designs or plans". A response over 1 second breaks the user's flow of thought (Nielsen Norman Group), and a page should show its structure at once rather than a blank screen (MDN, perceived performance).

## Options

- **Relayed chat decisions, one-step approval, a fast page, every artifact.** Chosen. An owner action run from a session that is not the owner's terminal takes `--relayed "<the owner's reply, quoted>"`, and the event records the owner as decider, the session as relayer and the quote; without it, the command prints the decision as a plain-words question with the recommended answer for the orchestrator to put to the owner. `codeloop approve <card> --accept-recommended`, one API route and one board button record every recommended answer as the owner's and approve in one step, refused with nothing recorded when a question has no recommendation. A loading.tsx skeleton lets the story route paint its shell at once, and the card reads the page needs stop waiting on the index rebuild. Artifacts lists every page under docs/artifacts at any depth with its kind, plus every mock. It reuses acceptAll (src/lib/services.ts:531), the approve flow (src/lib/flow.ts:39) and allArtifactFiles (src/lib/artifact.ts:46), and touches `src/lib/engine.ts`, `src/lib/cards.ts`, `src/lib/services.ts`, `src/lib/server.ts`, `src/commands/card.ts`, `src/sdk/client.ts`, `src/lib/store/file.ts`, `src/lib/artifact.ts`, `workspace/app/layout.tsx` and `workspace/components/shared/questions.tsx`.
- **Owner actions only on the board or in the owner's terminal, with the orchestrator sending a link.** Lost: the owner asked to answer in chat, and a link per decision is the same number of steps as today.
- **Keep the index open forever, so it is never cold.** Lost: it fixes only the cold-index half. The page would still be blank while the server renders, and the hub keeps every project's index in memory.

## Risks

- A relayed decision is only as honest as the relayer. Bounded by: the quote is stored on the event, and the board shows "relayed by <session>" on every such decision. An agent run (`CODELOOP_AGENT_RUN`) still cannot act as owner at all (src/lib/engine.ts:66).
- Approve with conditions accepts an answer the owner did not read. Bounded by: the board button and the command list each answer they will accept before acting.
- Listing every nested page shows half-written artifacts. Bounded by: the list shows each page's kind and card, sorted newest first, as the generated index already does (src/lib/artifact.ts:273).

## Open questions

- Should a relayed decision record the owner as the decider, with the orchestrator as relayer, or the orchestrator as decider on the owner's behalf?
- Must every relayed decision carry the owner's quoted words, or may the orchestrator relay a decision the owner gave earlier in the same chat for several stories?
- Should approve with conditions also waive open review findings, or cover interview questions only?
- What is the bar for the story page opened cold: the shell within 0.1 s and the story within 1 s?
- Should Artifacts also list the plans under docs/plans and docs/mocks, or only docs/artifacts and the cards' mocks?

## Sources

- source: src/lib/engine.ts:60 — resolveRole makes every non-agent process the owner, so a chat session acts as owner with no record
- source: src/lib/cards.ts:8 — card events have actor, human and gate, and no field for a relayed decision or the owner's words
- source: src/lib/services.ts:531 — acceptAll exists apart from approve, so approve with conditions joins two existing services
- source: src/commands/check.ts:183 — the questions check fails on unanswered questions, which is why approving first rolls back
- source: workspace/lib/api.ts:61 — server fetches time out at 2 seconds, matching the 2-second blank state
- source: src/lib/hub.ts:21 — the hub closes an idle project's index after 30 minutes and rebuilds it on the next read
- source: src/lib/store/file.ts:540 — the artifacts list reads only the top level of docs/artifacts
- source: src/lib/artifact.ts:46 — allArtifactFiles already walks project and topic folders, unexported
- source: https://github.com/bmad-code-org/BMAD-METHOD/blob/49069b8b/src/bmm-skills/4-implementation/bmad-quick-dev/step-02-plan.md — BMAD gates are chat menus, approval recorded as file status with no approver
- source: https://kiro.dev/docs/specs/ — Kiro confirms each phase in chat; the Specs pane lists specs
- source: https://kiro.dev/docs/specs/analyze-requirements/ — suggested fixes are chosen per question, no accept-all
- source: https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md — one question at a time with a recommended option, accepted one by one, recorded without attribution
- source: https://github.com/bmad-code-org/BMAD-METHOD/blob/819d373e/src/core-skills/bmad-index-docs/SKILL.md — BMAD's former document index skill
- source: https://www.nngroup.com/articles/response-times-3-important-limits/ — 0.1 s feels instant, 1 s keeps the flow of thought, 10 s keeps attention
- source: https://web.dev/articles/rail — about 100 ms feels immediate; load goals for first and later visits
- source: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Performance/Perceived_performance — show the page's structure at once instead of a blank state

## Rubric

- R2 pass: `grep -rn "onBehalf\|on behalf\|approvedBy\|delegat\|answeredBy\|relayed" src` finds no relayed-decision field; `grep -n "accept" src/commands/card.ts` shows approve has no accept option; `find workspace/app -name loading.tsx` finds none; src/lib/store/file.ts:540 reads only the top level of docs/artifacts
- R5 pass: specs/362-i-approve-and-answer-from-chat-and-the-p/research.md:26
- R7 pass: specs/362-i-approve-and-answer-from-chat-and-the-p/research.md:38

verdict: build
