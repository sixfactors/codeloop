<!-- codeloop verify: start -->
# Verify c-302

result: pass
sha: a5d130d3101ff48c0cf116ec03e4ef77fc10e8a8
env: local
workspace: export of a5d130d
budget: 9 files, 87 lines, limit 20 files / 1200 lines (M), pass
health: before 88.19, after 88.19, delta 0, pass

| Use case | Accepts | Layers |
|---|---|---|
| uc-302-01 | US1 | cli pass |
<!-- codeloop verify: end -->

## Live walk
stack: `codeloop init -t claude -y` on a fresh git repo (/tmp/cl-walk302.k8ju) with the global CLI at the c-302 head; board served with `codeloop serve --standalone --port 4173 --owner`.
url: http://127.0.0.1:4173/home
steps:
- `codeloop start "Fix the CSV header" --size trivial`: created c-001 at stage build; events show skip research, interview, mock, spec, data-model, "size trivial: the stage runs only when size >= M".
- committed six files, 240 lines, with `Card: c-001`, moved the story to verify and ran `codeloop verify c-001`: "diff 6 files / 240 lines exceeds the trivial budget (3 files / 50 lines); split the story; c-001 is re-sized to M and parked at the spec gate".
- `codeloop card show c-001`: "waiting for you: spec", size M, events "resize verify: trivial to M" and "park spec: gate spec (the trivial diff cap was exceeded)".
- opened Home: tab title "1 thing needs you", the Needs you list shows "Fix the CSV header" at Spec (evidence/302/home-parked.png).
network:
- GET http://127.0.0.1:4173/home 200
- GET http://127.0.0.1:4173/api/home 200, needsYou[0] c-001 stage spec, waitingOn spec
- seen but not this story's: GET /mocks/?_rsc=... 404 from a link prefetch in standalone serve
external: none: the resize runs in the engine on local files under .codeloop and the git history, and calls nothing outside the machine

## Rubric
- V4 pass: the trivial-ceremony test failed with engine.ts at the earlier head (2 failed, 6 passed: a grown trivial card re-sized to S found no gate and never parked) and passed after 52c86c9 (8 of 8); `npx vitest run src/lib/__tests__/trivial-ceremony.test.ts`.
- V6 pass: evidence/302/uc-302-01.json holds the use case output; evidence/302/home-parked.png is the Home page with the parked story; the walk above quotes each command's output.
