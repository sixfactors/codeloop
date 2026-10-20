# c-331 tasks: The production project runs a frozen v1 that new builds cannot change

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no layer tag and on an acceptance line with no task.
-->

- [ ] T001 [US1] [docs] Set package.json to 1.0.0 and tag v1.0.0 at the freeze commit (the checked-out branch's HEAD after c-330 landed)
- [ ] T002 [US1] [api] scripts/release-pack.sh: git archive the tag into a scratch folder, set gitHead, npm ci, npm run build:all, npm pack into ~/.codeloop/releases, write the sha256 and a manifest
- [ ] T003 [US2] [api] scripts/release-install.sh: stop the hub and hook daemon, refuse a tarball outside ~/.codeloop/releases or without its sha256, npm i -g the tarball
- [ ] T004 [US4] [api] release-install.sh restarts the hub from the installed build on its old port and lists processes with codeloop ps
- [ ] T005 [US3] [test] scripts/check-frozen.sh: the readlink and real-directory checks, the version and gitHead against the tag, the cron line's binary resolving to the installed package, no process from the checkout
- [ ] T006 [US4] [test] In ops-ai: guard session exits 0 and card list --json counts the same cards as before the freeze (357)
- [ ] T007 [US4] [docs] Workers' instructions: board commands in the checkout use codeloop from now on, never node dist/index.js, in CLAUDE.md

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: size S, no interview; the freeze is set by the 10-18 plan S0.2 (docs/artifacts/codeloop/cloud/c-321-implementation-plan.html) and by the owner's brief of 2026-10-20: tag the checked-out branch's HEAD, replace the real global package (not a link) with the packed tarball, restart the hub and hook helper from it
- S6 pass: not building: a version bump of the checkout past 1.0.0 (c-332 decides the next version), a reinstall of ops-ai's crontab line (the owner's), a restart of the MCP process a running assistant session owns
