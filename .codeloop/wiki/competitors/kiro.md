---
title: Kiro
docs: https://kiro.dev/docs/specs/
changelog: https://kiro.dev/changelog/
---

## Findings

- c-067 Research writes the first draft: From one prompt it drafts requirements.md (EARS acceptance), design.md and tasks.md in order, each a draft the user edits before the next is generated; the closest shape to "research writes the first draft", but it searches the codebase only, never the web, and cites nothing | https://kiro.dev/docs/specs/

- c-313 A small story runs its early stages in one agent turn: Spec mode drafts requirements, then design, then tasks in one session, pausing for the person to approve each document before the next | https://kiro.dev/docs/specs/

- c-323 Visitors can browse codeloop's own board and wiki read-only on a hosted demo: No public view of a team's specs: requirements, design and tasks are documents inside the editor's spec session; the docs describe no hosted or shared read-only copy | https://kiro.dev/docs/specs/

- c-367 The board moves a story when its work ships, so shipped work never looks unfinished: Tasks in a spec show in-progress and completed as the agent works them inside the editor; the docs name no link from a commit or a merge to a task's status | https://kiro.dev/docs/specs/

- c-362 I approve and answer from chat, and the page loads fast and lists every artifact: The person confirms each spec phase (requirements, design, tasks) in chat before the next. Analyze Requirements offers a suggested fix per question to select one at a time; there is no documented accept-all and no named approver. Specs are listed in a Specs pane and by #spec in chat | https://kiro.dev/docs/specs/

- c-381 Install learns my existing service and asks six setup questions: One click, "Generate Steering Docs", writes `product.md`, `tech.md` and `structure.md` under `.kiro/steering/`, loaded on every interaction; the person then clicks "Spec" and approves requirements, design and tasks in turn. No questions are asked at setup, nothing is run to check that the commands work, and the files carry no verified-at mark | https://kiro.dev/docs/getting-started/first-project/
