# c-333 tasks: One check proves a v2 session left v1 untouched

<!--
One line per task, each owned by one layer and tied to an acceptance line:

    - [ ] T001 [P] [US1] [api] What to do, naming the file

Layer is one of api, sdk, ui, test, docs. [P] marks a task that can run in parallel.
`codeloop spec check` fails on a task with no task layer tag and on an acceptance line with no task.
-->

- [x] T001 [US1] [test] scripts/v1-untouched.sh snapshot: hash the v1 home's projects.json, hub.json's port and host, the global binary's resolved path and installed package, the codeloop-tagged crontab lines, and the production project's hook and MCP settings, into a snapshot file
- [x] T002 [US2] [test] For the production project's board, following its cards.json link: per card, the event count and the hash of its events, compared as a prefix on `compare`
- [x] T003 [US3] [test] vitest.setup.ts snapshots the real home's v1 files when a test file starts and fails that file when they changed by its end
- [x] T004 [US1] [test] Make the compare fail once on a fixture copy (an old event dropped, a link target changed) and keep the failure output in src/lib/__tests__/v1-untouched.test.ts and rubric-build.md

## Rubric

<!-- One line per attest row of the spec rubric. -->
- S3 pass: size S, no interview; what the snapshot covers and the prefix rule are set by the 10-18 plan S0.4 (docs/artifacts/codeloop/cloud/c-321-implementation-plan.html)
- S6 pass: not building: a comparison of the wiki or spec folders (v1 writes those as it works), a nightly schedule for the compare (E4's parity story), or a snapshot of the checkout itself
