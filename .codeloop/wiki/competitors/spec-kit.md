---
title: Spec Kit
docs: https://github.com/github/spec-kit
changelog: https://github.com/github/spec-kit/releases
---

## Findings

- c-067 Research writes the first draft: `/speckit.plan` writes a research.md per unknown as Decision, Rationale and Alternatives considered, then `/speckit.tasks` drafts tasks from it; the draft is read by a person before anything runs, and nothing fails when alternatives are missing | https://github.com/github/spec-kit/blob/main/spec-driven.md

- c-307 The orchestrator reviews every story and fixes what is wrong before it picks the next one: No board review: each feature's spec, plan and tasks are run in order by the person; nothing re-reads open features and fixes their state | https://github.com/github/spec-kit

- c-308 A stuck story says why in plain words and which action will move it: No stuck state: a command that fails reports in the agent chat, and the person decides whether to rerun it; nothing says whether work was tried | https://github.com/github/spec-kit

- c-311 Every story opens with what is needed, what is done and what I must do: No per-feature summary: the spec, plan and tasks files are read in full, and progress is the ticked task list | https://github.com/github/spec-kit

- c-313 A small story runs its early stages in one agent turn: The person runs specify, clarify, plan and tasks one after another in the same agent chat, so the early phases share one session; nothing checks a phase before the next starts | https://github.com/github/spec-kit

- c-314 Several small stories build together in one turn: One implement run works one feature's task list; several small features mean several runs | https://github.com/github/spec-kit
