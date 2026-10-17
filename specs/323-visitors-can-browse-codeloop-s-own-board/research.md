# c-323 research: Visitors can browse codeloop's own board and wiki read-only on a hosted demo

## What exists

exists: build. Parts exist; a public copy does not. `codeloop serve` without `--owner` already answers every card write with a 403 "read-only" (src/lib/server.ts:145), and `anyHost` lets it answer on a host other than localhost (src/lib/server.ts:97, src/commands/serve.ts:199). Every read route returns everything it holds, though: card notes, questions and answers, briefs, activity, hand-backs and stage output (src/lib/server.ts:301-436), so a read-only server is not a public one. `scrubOutput` replaces the home and temp folders and strips terminal codes (src/lib/scrub.ts:20), but only for tool output written into tracked files; nothing filters what the board serves. The hosted Protobox board exists as sync, not as a view: `codeloop cloud push` writes cards.json, config.yaml, lanes and wiki pages into one workspace folder (src/lib/cloud.ts:582), unfiltered, behind the workspace key. Protobox can already publish a knowledge folder as a public pack, readable by direct link and a public MCP, off by default and with gallery listing as a separate opt-in (confirmed in Protobox's code on 2026-10-17; not yet in its public docs). The Codeloop Cloud design places a filtered public view last, as step 6 on top of the cloud record in step 4 (docs/artifacts/codeloop/cloud/c-321-system-design.html, "Public publishing, later").

## How others show it

| Competitor | How they show it | Source |
|---|---|---|
| BMAD | No hosted board or public view of its own work: its briefs, specifications and stories are files in the user's project, and the project's own planning is public only as GitHub issues and discussions | https://github.com/bmad-code-org/BMAD-METHOD |
| Kiro | No public view of a team's specs: requirements, design and tasks are documents inside the editor's spec session; the docs describe no hosted or shared read-only copy | https://kiro.dev/docs/specs/ |
| Spec Kit | No hosted board: artifacts are files under the project's `.specify/` folder, visible to the public only when the repository itself is public | https://github.com/github/spec-kit |

## The pain, grounded

pain: assumption: a visitor (the founder or engineer evaluating codeloop) cannot see the loop working on real stories before installing it, because the board exists only on the owner's machine and none of BMAD, Kiro or Spec Kit offers a live example to point at. What would confirm it: ask three people who tried codeloop from docs/trial/trial-guide.md whether a live board would have changed their decision to install, and count site visits that reach the install command with and without a demo link.

## Who sees what

| Viewer | Sees | Writes |
|---|---|---|
| Public visitor, no sign-in | The published board (titles, stage, size, feature, lane, the event timeline without notes), approved specs and plans, wiki pages not marked private | Nothing |
| Viewer (Protobox viewer, per the c-321 roles) | Everything in the workspace except owner-only state | Propose, note |
| Member | Same | Build and review actions |
| Owner | Everything, plus the publish switch and a "view as visitor" preview | Everything |

The owner manages it in three places, following the platforms below: a per-project publish switch, a per-item private mark (a page, a card, or a whole wiki folder, as Mintlify sets `public` per page or per group), and members and roles in the Protobox workspace (as Mintlify, GitBook and GitHub Projects each keep roles on a members page). Concealment is never access control: Mintlify's hidden pages, Docusaurus's `unlisted` docs and GitHub's secret gists are all readable by anyone with the URL, so anything not meant to be public must be left out of the published copy, not hidden in it.

## What must never be public

- Machine paths: home and temp folders, but also any other absolute path in card notes, evidence and stage output. `scrubOutput` covers only the first two.
- Owner notes and questions: card notes ("Owner 10-17: ..."), interview questions and answers, review lines, reject notes.
- Specs, plans and research before the spec gate is approved; evidence files, verify output and hand-back proofs.
- Agent records and activity: sessions, leases, briefs, runs, `.codeloop/state/` in full.
- Private repository names, other projects in the hub registry, and anything from `.codeloop/local.yaml`, `.codeloop/cloud.json` or the sync record.
- Keys, tokens, members, email addresses.

The filter is an allow-list of fields and documents, so a field added later is private until someone adds it. One test feeds it a story built to leak each item above.

## How the public copy stays in sync

Docs platforms rebuild on push: Mintlify deploys when the configured branch receives a push and builds a preview for each pull request; Docusaurus builds a static site that redeploys on merge; GitBook syncs both ways with a branch. For a public board the safe direction is one way only: the public copy is rebuilt from the record, never edited, and shows "as of" the time and commit it was built from. A static snapshot rebuilds on each push to main; the Cloud public view (c-321 step 6) reads the record live through the same filter.

## Options

- **A static public snapshot, built by `codeloop publish` through an allow-list filter and served by a read-only host, rebuilt on each push to main.** Chosen: it ships without waiting for the cloud record, uses the existing read-only board (src/lib/server.ts:145) and `scrubOutput` (src/lib/scrub.ts:20), and its filter is the one the Cloud public view will reuse, so it is written once. The snapshot carries its build time and commit. It touches `src/lib/server.ts`, `src/lib/scrub.ts` and a new publish command.
- **Wait for the Codeloop Cloud public view (c-321 step 6) and publish from the cloud record.** Lost: it depends on steps 1 to 5 of the Cloud design, months of work, and the filter would be the same code either way.
- **Turn on Protobox's public pack for the folder `codeloop cloud push` writes.** Lost: the folder holds the raw cards.json with every note and the config, so it would publish what must stay private; a pack shows documents, not a board; and it would make Protobox's pack format the public face of codeloop.

## Risks

- A field slips through the filter. Bounded by: allow-list, not deny-list; the leak test; a "view as visitor" preview before the switch is turned on.
- The snapshot goes stale and misleads a visitor about the loop. Bounded by: the "as of" line and a rebuild on every push to main.
- A path the scrub does not know (a second disk, a CI runner's work folder) appears in a note. Bounded by: notes are private by default, and the publish step refuses a snapshot whose served text matches an absolute-path pattern.
- The demo shows codeloop's own board with unfinished or stalled work. The owner decides which stages are shown before turning it on.

## Open questions

- Which card fields are public: title, stage, size and feature only, or also the event timeline and the "so that" story line?
- Are specs and plans public once the spec gate is approved, or only once the story ships?
- Is any evidence public, for example a verify summary with the tool output removed?
- Should visitors see agents at work (who works which story, on which branch), the thing codeloop sells, or is that private on the demo?
- Where does the demo live: a page on the codeloop site, a hosted URL on Protobox, or both?
- How fresh must it be: rebuilt on each push to main, daily, or live once Cloud exists?
- The card names "storage step 3"; the current Cloud design numbers the cloud record step 4 and publishing step 6. Is the demo meant to wait for those, or ship ahead as the snapshot?

## Sources

- source: src/lib/server.ts:145 — a server without --owner already refuses every card write with read-only
- source: src/lib/server.ts:301 — read routes serve questions, activity, briefs, hand-backs and output in full, so read-only is not public
- source: src/lib/scrub.ts:20 — the scrub replaces home and temp folders only, and only for tracked tool output
- source: src/lib/cloud.ts:582 — cloud push writes the raw board, config, lanes and wiki into one workspace folder
- source: docs/artifacts/codeloop/cloud/c-321-system-design.html — the Cloud design's filtered public view comes last, after the cloud record
- source: https://www.mintlify.com/docs/deploy/github — deploys on push to a configured branch, previews per pull request
- source: https://www.mintlify.com/docs/deploy/authentication-setup — with auth on, pages are protected by default and set public per page or group, with group-restricted pages
- source: https://www.mintlify.com/docs/organize/hidden-pages — a hidden page is readable by anyone with the URL, so hiding is not privacy
- source: https://www.mintlify.com/docs/dashboard/roles — viewer, editor and admin roles managed on a members page
- source: https://gitbook.com/docs/publish/publish-a-docs-site — three audiences: public, private share links, or OAuth sign-in
- source: https://gitbook.com/docs/getting-started/git-sync — Git Sync is two-way between the editor and the repository
- source: https://gitbook.com/docs/collaborate/member-management/roles — a role ladder from guest and reader to admin, set on invite
- source: https://docusaurus.io/docs/deployment — a static build redeployed to a static host on merge
- source: https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs — draft is development only; unlisted is in production but reachable by direct link
- source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-visibility-of-your-projects — a public project shows items from private repositories only to people with access to them
- source: https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists — a secret gist is unlisted, not private
- source: https://github.com/bmad-code-org/BMAD-METHOD — no hosted board; outputs are project files
- source: https://kiro.dev/docs/specs/ — specs are documents in the editor session, with no shared read-only copy described
- source: https://github.com/github/spec-kit — artifacts are files under .specify/, no hosted view

## Rubric

- R2 pass: `grep -n "app\.\(get\|post\|put\|delete\)(\|public\|readOnly" src/lib/server.ts` lists every route and finds no public or filtered read route, only the read-only refusal at src/lib/server.ts:145; `grep -rln "publish\|public" src/lib/*.ts` finds no publish command or public filter
- R5 pass: specs/323-visitors-can-browse-codeloop-s-own-board/research.md:45
- R7 pass: specs/323-visitors-can-browse-codeloop-s-own-board/research.md:58

verdict: build
