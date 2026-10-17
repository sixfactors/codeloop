---
title: Spec Kit
docs: https://github.com/github/spec-kit
changelog: https://github.com/github/spec-kit/releases
---

## Findings

- c-067 Research writes the first draft: `/speckit.plan` writes a research.md per unknown as Decision, Rationale and Alternatives considered, then `/speckit.tasks` drafts tasks from it; the draft is read by a person before anything runs, and nothing fails when alternatives are missing | https://github.com/github/spec-kit/blob/main/spec-driven.md

- c-307 The orchestrator reviews every story and fixes what is wrong before it picks the next one: No board review: each feature's spec, plan and tasks are run in order by the person; nothing re-reads open features and fixes their state | https://github.com/github/spec-kit

- c-308 A stuck story says why in plain words and which action will move it: No stuck state: a command that fails reports in the agent chat, and the person decides whether to rerun it; nothing says whether work was tried | https://github.com/github/spec-kit
