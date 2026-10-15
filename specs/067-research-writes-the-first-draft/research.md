# c-067 research: Research writes the first draft

## What exists

exists: unlock — the research half is built and runs today; the draft-spec half is not. The build lane's first stage in `.codeloop/lanes/build.yaml` (stage `research`, done cmd `codeloop check research {id} --min-sources 3 && codeloop check wiki-landed {id} --stage research && codeloop check rubric {id}`) starts a headless agent with a brief from `buildBrief` in `src/lib/agent.ts:146`; that brief inlines the research skill, the wiki folders it reads and, for the research stage only, every page under `.codeloop/wiki/competitors/` (`src/lib/agent.ts:219`). `checkResearch` in `src/lib/research.ts:24` already requires a `verdict:` line and three `- source:` lines, `--online` makes each URL answer, and `decisionFromResearch` in `src/lib/wiki-rules.ts:111` lands the compared options as a decision page. `codeloop card run <id>` (`src/commands/card.ts:275`) runs the current stage on demand, which is this card's "on demand" path for a card already in research. What the grep did not find: nothing writes spec.md before the spec stage (`newSpec` in `src/lib/spec.ts:44` copies the template and `templates/skills/spec/SKILL.md` is the first skill that fills it), `grep -rn -i "screenshot" src templates/skills` hits only `src/lib/artifact.ts` (mock artifacts, not research), nothing posts a "close?" question when `exists:` is `have` or `unlock` (`grep -rn "close?" src` is empty), and a proposed card cannot be researched: `inLane` in `src/lib/cards.ts:103` excludes `proposed`, so `active()` in `src/lib/run.ts` never starts an agent on a backlog card. The plan lane in `.codeloop/lanes/plan.yaml` has its own `research` stage (skill `design`, checked only by `--has 'verdict:'`) and nothing ties it to the top five backlog cards.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| Spec Kit | `/speckit.plan` writes a research.md per unknown as Decision, Rationale and Alternatives considered, then `/speckit.tasks` drafts tasks from it; the draft is read by a person before anything runs, and nothing fails when alternatives are missing | https://github.com/github/spec-kit/blob/main/spec-driven.md |
| BMAD | An analyst agent runs brainstorming, market research and a project brief before the PM agent drafts the PRD; each is a separate chat turn the user starts, with no check on sources | https://github.com/bmad-code-org/BMAD-METHOD |
| Kiro | From one prompt it drafts requirements.md (EARS acceptance), design.md and tasks.md in order, each a draft the user edits before the next is generated; the closest shape to "research writes the first draft", but it searches the codebase only, never the web, and cites nothing | https://kiro.dev/docs/specs/ |

## Options

- Extend the research stage that already runs, and expose it for backlog cards. The research skill in `templates/skills/research/SKILL.md` gains a second output, a draft `specs/{id}/spec.md` with the Story line, US1 to US3 and `## Not building` written from the `exists:`, `pain:` and `## Options` it just settled; `checkResearch` in `src/lib/research.ts` gains `--draft-spec`, which fails unless spec.md has a filled `Story:` line, one acceptance line and a non-empty `## Not building`, and it reads a `screenshots:` line that is either paths under the spec folder or `none`; `codeloop research <card>` in `src/commands/card.ts` is `card run` that first places a proposed card in the research stage through `placeCard` in `src/lib/engine.ts` so `inLane` in `src/lib/cards.ts` lets `src/lib/run.ts` start the agent; when the verdict is `have` or `unlock` the run posts one question through `addQuestions` in `src/lib/interview.ts` ("close? recommended yes") and parks the card the way `card park` does. Chosen. Every piece it needs is already there and tested: the brief, the competitor inlining, the source counter, the decision landing, `card run`, `park` and `addQuestions`; the check can fail on a named line (no Story, no US line, empty `## Not building`, a screenshot path that does not exist); and the founder opens the same two files at the spec gate that exist today, now already filled.
- A standalone `codeloop research <card>` written in TypeScript that fetches the competitor pages with `pageText` from `src/lib/scan.ts`, searches the web and writes research.md deterministically with no agent. Rejected: the `exists:` verdict is a judgement over this codebase and its siblings, which a fetcher cannot make, and there is no web search without an API key in `.codeloop/config.yaml`. Failure mode: three URLs that answer `--online` and settle nothing, which is the filler Q4 names as the riskiest assumption.
- A separate `draft` stage between research and interview with its own output `{spec}/draft.md` and check. Rejected: one more agent run on every card (`src/lib/run.ts` starts one agent per stage), and the interview then reads a third file; c-116 is already trying to cut stages for shaped stories. Failure mode: the draft passes while spec.md is still the template, so the spec stage rewrites from scratch and the draft was waste.

## The pain, grounded

pain: the founder spends the first hour of every card gathering, not deciding: search the repo for what exists, find the competitor's docs, copy the story into a spec. Source: the card's own story ("so that my time goes to deciding, not gathering"), `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (metric human turns per shipped card, median under 4 by 2026-12-01; a card that arrives at the spec gate with an empty spec costs a turn to send it back), and `.codeloop/wiki/features/agent-thinks-first.md`, which names "research reads the competitor pages and the web and writes the first draft of the spec" as the third story of the feature. The dogfood number: this card's first research run (`.codeloop/state/agent-runs/c-067-research-1.log`, 2026-10-13) exited 1 in 693 ms with the template untouched, so the founder got nothing to decide on.

## Risks

- Filler. Q4's bar says one source must be a competitor page already in the wiki. `.codeloop/wiki/competitors/` was empty until this stage added Spec Kit, BMAD and Kiro, so the check "one source is a competitor page" would have failed every card on this repo; the bar needs `codeloop wiki competitor add` to be part of `init` or the check to accept a `wiki/competitors/` path once one exists.
- Screenshots. No code path takes a screenshot (`grep -rn -i "screenshot" src templates/skills` hits only `src/lib/artifact.ts`). Q1 makes them best-effort through Chrome MCP when the agent has it; a `screenshots: none` line must satisfy the check or every headless run fails.
- The draft spec contradicts the interview. Research runs before the interview (`.codeloop/lanes/build.yaml` stage order), so a draft `## Not building` written here predates the founder's answers. The interview skill must treat the draft as proposals it can strike, and the spec stage must rewrite, not append.
- Two research stages. `.codeloop/lanes/plan.yaml` already has a `research` stage with the `design` skill and a weaker check. Q2's Monday top-five run either reuses the build stage's skill and check or the two drift.
- Promoting a backlog card to run research on it changes its lane position. `inLane` in `src/lib/cards.ts:103` means a researched card is no longer proposed; if the verdict is `build`, it sits in research waiting for the interview, which the board shows as in flight before the founder chose it.
- The `exists:` call here is `unlock`, so by the story standard the default move is expose, not rebuild. The draft-spec half and the backlog path are new code, so the card does not close on this verdict.

## Open questions for the interview

- When `codeloop research <card>` runs on a proposed card and the verdict is `build`, does the card stay in research (now in flight, counted against `wip: 10`) or return to proposed with the files written?
- Does `--draft-spec` live in `check research` (then every build-lane card must pass it) or in a flag only `codeloop research` sets?
- Which skill drafts spec.md: the research skill writing a second file, or the spec skill invoked once with `specs/{id}/interview.md` absent?
- Does the Monday run reuse the build lane's research stage on the top five backlog cards, or does the plan lane's own `research` stage in `.codeloop/lanes/plan.yaml` change to call it?
- Does the "close? recommended yes" question block the card at research (parked, lane slot freed) or at the spec gate the card was heading to anyway?

## Sources

- source: src/lib/agent.ts:219 — `buildBrief` inlines every competitor page for the research stage only; settled that competitor reading is built and needs no new mechanism
- source: src/lib/research.ts:24 — `checkResearch` counts `- source:` lines and the `verdict:` line, and `checkOnline` makes each URL answer; settled that the source bar exists and the draft-spec bar does not
- source: src/lib/cards.ts:103 — `inLane` excludes `proposed`, so no agent starts on a backlog card; settled that "before I spend a minute" needs a way into the research stage from the backlog
- source: src/lib/spec.ts:44 — `newSpec` writes spec.md from the template and nothing fills it before the spec stage; settled that the draft spec is the missing half
- source: src/commands/card.ts:275 — `card run <id>` runs the current stage on demand and streams the log; settled that the on-demand command exists for a card already in research
- source: src/lib/interview.ts:119 — `addQuestions` posts an inbox question with a recommended answer; settled that Q5's "close? recommended yes" is one call
- source: .codeloop/lanes/plan.yaml — the plan lane has its own `research` stage with the `design` skill and a `--has 'verdict:'` check; settled that Q2's Monday run has a stage to attach to and a weaker check to reconcile
- source: .codeloop/wiki/initiatives/founder-ships-without-ceremony.md — metric human turns per shipped card, median under 4; settled the pain's number
- source: .codeloop/wiki/competitors/kiro.md — the competitor page this stage added; the row above is copied here when the stage passes
- source: https://github.com/github/spec-kit/blob/main/spec-driven.md — Spec Kit's plan step writes research.md as Decision, Rationale, Alternatives; settled that the nearest competitor drafts research as prose a person reads, with nothing that fails when sources are missing
- source: https://github.com/bmad-code-org/BMAD-METHOD — BMAD's analyst agent does brainstorming, market research and a brief before the PRD, each a turn the user starts; settled that no competitor runs research unattended on a backlog item
- source: https://kiro.dev/docs/specs/ — Kiro drafts requirements, design and tasks from one prompt with codebase context only; settled that "writes the first draft" is the market's shape and the web sources are the difference

verdict: build

## Rubric

- R2 pass: `grep -rn -i "screenshot" src templates/skills` hits only src/lib/artifact.ts; `grep -rn "close?" src` returns nothing; `newSpec` at src/lib/spec.ts:44 copies the template and `grep -rln "spec.md" src/lib` names no writer before the spec stage; `inLane` at src/lib/cards.ts:103 excludes proposed
- R5 pass: three options under `## Options`; extending the research stage chosen because the brief (src/lib/agent.ts:219), the check (src/lib/research.ts:24), `card run` (src/commands/card.ts:275) and `addQuestions` (src/lib/interview.ts:119) already exist; a TypeScript fetcher rejected because `exists:` is a judgement and there is no web search key; a separate draft stage rejected for one more agent run per card in src/lib/run.ts
- R7 pass: `## Open questions for the interview` lists five, none answered here: where a researched backlog card sits, where `--draft-spec` lives, which skill drafts spec.md, which lane's research stage the Monday run uses, and where the close question parks the card
