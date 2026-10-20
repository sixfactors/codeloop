---
title: BMAD
docs: https://github.com/bmad-code-org/BMAD-METHOD
changelog: https://github.com/bmad-code-org/BMAD-METHOD/releases
---

## Findings

- c-067 Research writes the first draft: An analyst agent runs brainstorming, market research and a project brief before the PM agent drafts the PRD; each is a separate chat turn the user starts, with no check on sources | https://github.com/bmad-code-org/BMAD-METHOD

- c-311 Every story opens with what is needed, what is done and what I must do: Each story file carries a Dev Agent Record the developer agent fills in as it works (completion notes, file list, change log), with the story's status at the top of the file | https://github.com/bmad-code-org/BMAD-METHOD

- c-314 Several small stories build together in one turn: The developer agent takes one story at a time from the sprint and implements it to done before the next; there is no batch of stories in one run | https://github.com/bmad-code-org/BMAD-METHOD

- c-323 Visitors can browse codeloop's own board and wiki read-only on a hosted demo: No hosted board or public view of its own work: its briefs, specifications and stories are files in the user's project, and the project's own planning is public only as GitHub issues and discussions | https://github.com/bmad-code-org/BMAD-METHOD

- c-367 The board moves a story when its work ships, so shipped work never looks unfinished: A story's status lives in its plan file; a build stops at `built` and the user or orchestrator marks it `done` by hand. Code review appends a block and never changes the status, and nothing reads git to move it | https://docs.bmad-method.org/plan/break-work-into-stories-and-track-it/

- c-362 I approve and answer from chat, and the page loads fast and lists every artifact: Gates are lettered menus in the chat ([A] Approve, [E] Edit), and the agent halts until the person picks one. Approval is recorded only as the spec file's status (ready-for-dev), with no record of who approved. No accept-all of recommended answers. Its index-docs skill that listed generated documents was removed from core | https://github.com/bmad-code-org/BMAD-METHOD/blob/49069b8b/src/bmm-skills/4-implementation/bmad-quick-dev/step-02-plan.md

- c-381 Install learns my existing service and asks six setup questions: `npx bmad-method install` asks which coding tools and which skills to install, writes `_bmad/` and `_bmad-output/`, then the person runs "bmad setup" and "bmad status" in chat; `bmad-project-context` is a separate skill recommended for existing codebases, which users call weak on legacy monoliths | https://docs.bmad-method.org/start/install-bmad/

- c-332 v2 runs beside v1 under its own name, home and port: Installed per project into `_bmad/` by `npx bmad-method install`; the version a project runs is the one in its folder, so two projects can run two versions, but one project cannot run two side by side | https://docs.bmad-method.org/start/install-bmad/

- c-329 A project on v1 keeps working untouched until v2 is proven: A project pins the version in its own `_bmad/` folder and upgrades with `npx bmad-method install`; there is no side-by-side run and no proof that an upgrade changed nothing | https://docs.bmad-method.org/start/install-bmad/
