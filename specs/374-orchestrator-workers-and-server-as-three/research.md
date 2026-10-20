# c-374 research: Orchestrator, workers and server as three parts, with templates and workflows set in the UI

## What exists

<!-- Unlock before build. One line: exists: have | unlock | port | build, with a path or URL when it is not build. have = shipped and exposed, close the card. unlock = built but not exposed, expose it. port = in a sibling repo. -->
exists: build

The pieces v2 builds on are shipped: `codeloop init` scaffolds a repo (src/commands/init.ts), `wiki init` and `wiki build` seed and refresh the knowledge base (src/commands/wiki.ts), `orch run` briefs an agent and gates its hand-back (src/lib/orch.ts), lanes carry stages with skill, check and gate (templates/lanes/build.yaml), and the approve verb refuses an agent process (src/lib/gate.ts). What does not exist: learning an existing system in any language before the first work item, setup questions with recommended answers, a lead agent and task agents as separate roles with cost per item, a stage computed from documents, approvals, hand-backs and commits, and the seven first-day screens.

## Summary of the three sources

**The approved v2 design** (`.codeloop/wiki/architecture/v2-context-layer.md`). Orchestrators bypass Codeloop today and keep the real board in private notes: decisions are re-typed into cards (about 12 interview stalls in one day), builders commit code the board never sees, and both orchestrators type the same rules into every brief. Only 41 of 89 wiki pages were ever cited. The direction set by the owner on 2026-10-19: Codeloop is a context layer made of three parts, the server that holds the record, the orchestrator that decides what to do next, and the workers that do the work. Nothing on the server blocks a session except the existing role checks. One function decides where a story is, from its documents, gate decisions, hand-backs and commits. Monitor rules replayed on two weeks of both boards flag 19 of the 20 cards a person had to fix by hand, with a median lead of 13.8 hours.

**The research** (`.codeloop/wiki/competitors/2026-10-20-new-repo-workflow-research.md` and `.codeloop/wiki/competitors/2026-10-20-user-feedback-research.md`). Twelve tools compared on how they onboard a repository and what their users report. Codeloop already has the strongest controls of any tool compared: a gate is a role check the engine enforces and an event with a name and time, where Spec Kit's gate is a checkbox the agent reads, BMAD records approval as a status with no name, and Kiro has a Review button with no named approver. Nobody answers a question from a prior decision, and nobody links a commit to a story. Users of the other tools report five problems: weak on existing systems, too much process for small changes, agents skipping approvals, stale notes, no audit trail. Cost is the loudest complaint: about 31,000 tokens per BMAD run, one user spending $171 on one small change. What users keep: a short constitution, process sized to the change, fresh context per phase, plain markdown any tool can read.

**The operator's interview and playbook** (`~/Projects/chanl-v2/chanl-platform/docs/plans/codeloop/orchestration-playbook.md`, in the private platform repo). Two weeks of running Ops AI with one owner, one orchestrator and standing builders. The roles that worked: owner decides product, design and outward actions; orchestrator plans, routes, clears gates and reports in three lines; lane builders own files by service so two never edit the same files; a separate reviewer every two hours; a QA watcher that is a script. Every brief repeated the same rules, so they belong in a template the orchestrator fills. Builders invented interview answers until a check refused an answer no person gave. The board logged the owner's name on a move the orchestrator made, because the agent role was refused and the orchestrator reran it as owner. Status in many places cost the most time; the fix was one status surface, the board.

## How others show it

<!-- One row per competitor that has a page in .codeloop/wiki/competitors/, its name in the first cell. The row is copied to that page when this stage passes. -->
| Competitor | How they show it | Source |
|---|---|---|
| BMAD | Five named agents and three planning paths sized to the work; a plan approval and a result review in a lettered chat menu, recorded only as a status with no approver name; `bmad-project-context` for existing codebases, called weak on legacy monoliths | https://docs.bmad-method.org/build/build-a-change/ |
| Spec Kit | Ten slash commands in order from constitution to implement; a checklist the agent reads before implementing; clarify answers land in spec.md with no attribution; progress is what the agent ticked in tasks.md | https://github.github.io/spec-kit/reference/agentic-sdd.html |
| Kiro | One click writes three steering files (product, tech, structure) that load on every interaction; a three-phase spec per feature with a Review button between phases; no named approver and no link from a commit to a task | https://kiro.dev/docs/getting-started/first-project/ |

## Options

- Make the first day the product: install learns the system, asks six questions with recommended answers, sets up a process that fits, and then works through a lead agent, task agents and a separate reviewer, with the seven screens built as real pages in the app. Chosen. It answers all five reported problems and shows the controls Codeloop already has to a new user, who today never feels them.
- Keep the current setup (one question, about 60 files, the user learns the commands) and add the v2 entities underneath. Rejected: the research shows the first fifteen minutes decide whether a team lead continues, and Kiro, Claude Code and Serena already learn the repository in one step.
- Ship the four strong monitor rules as flags in the current version and stop there. Rejected as the whole answer, kept as the v1 slice under its own card: flags fix drift on our own board and do nothing for a new user on an existing system.

## The pain, grounded

<!-- The user pain this card answers, with a source. No source: write assumption: instead and say what would confirm it. -->
pain: a team lead (persona dev) trying AI coding tools on an existing service finds that the tools do not understand the system, impose a full document trail on a tiny fix, skip approvals, lose what they learned and leave no audit trail. Source: `.codeloop/wiki/competitors/2026-10-20-user-feedback-research.md` (the 10 pains and the per-tool complaints, each with a URL) and the orchestrator's playbook, which observed the same five on our own project.

## Risks

- The "nothing leaves the machine" claim is true of Codeloop and false of the AI tool's model calls; the public page has to say so.
- Learning a very large repository takes longer than ten minutes or a command hangs; each command runs with a time limit and the summary names what was skipped.
- The recommended answers are wrong for a team; every answer is editable on the Setup questions and Work process screens, and each change is a recorded decision.
- Building v2 disrupts our own production project; the current version is frozen for it first and every v2 install is checked against it.
- The head-to-head needs more AI calls than the usual limit of ten per experiment; the owner approves the budget first.

## Sources

<!-- At least three, one per line: a dash, the word source and a colon, a URL or a path in this repo (optionally path:line), a dash, a note. `codeloop check research` counts them; a path counts only when the file exists. -->
- source: .codeloop/wiki/architecture/v2-context-layer.md - the approved design: three parts, entities against screens, the one stage function, the replayed monitor rules
- source: .codeloop/wiki/competitors/2026-10-20-new-repo-workflow-research.md - how twelve tools onboard a repository; the trial moments and what to copy, avoid and beat
- source: .codeloop/wiki/competitors/2026-10-20-user-feedback-research.md - what users report of the other tools; the 10 pains and the five traps
- source: docs/artifacts/codeloop/v2/c-374-system-design.html - this card's system design, built from the plan
- source: docs/artifacts/codeloop/v2/c-374-workflow.html - this card's first-day workflow, built from the plan
- source: https://docs.bmad-method.org/build/build-a-change/ - BMAD's approval is a status field with no name, which settles that a named approval is a differentiator
- source: https://github.github.io/spec-kit/reference/agentic-sdd.html - Spec Kit's gate is a checklist the agent reads
- source: https://kiro.dev/docs/getting-started/first-project/ - Kiro's one-click steering docs set the bar for learning the repository in one step
- source: ~/Projects/chanl-v2/chanl-platform/docs/plans/codeloop/orchestration-playbook.md - the operator's playbook from two weeks of Ops AI, outside this repository so not counted by the check

## Rubric

- R2 pass: `grep -rln "lead agent\|task agent\|setup questions" src/ templates/skills/` finds nothing; `ls templates/skills/` lists no `setup` or `map` skill; `node dist/index.js --help` at trunk 0.5.0 lists `init`, `wiki`, `orch` and `approve` but no learn or setup command
- R5 pass: three options under `## Options`, the first-day product chosen; keeping the current setup loses because the first fifteen minutes decide the trial, and flags alone lose because they fix our board and not a new user's first day
- R7 pass: open questions carried for the owner from `## Open questions` in .codeloop/wiki/architecture/v2-context-layer.md, not guessed here: decision scope (story, feature and area first, paths later), template version pinned at each stage start, Protobox packs after v2.0, the v1 slice of four monitor rules under its own card

verdict: build
