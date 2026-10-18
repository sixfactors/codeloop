<!-- codeloop verify: start -->
# Verify c-368

result: pass
sha: 303640ce9f9c4bebdc299b3d3b19ac0fb4f7e7e2
env: local
workspace: export of 303640c
budget: 7 files, 49 lines, limit 20 files / 1200 lines (M), pass
health: before 88.19, after 88.4, delta +0.21, pass

| Use case | Accepts | Layers |
|---|---|---|
| uc-368-01 | US1 | cli pass |
| uc-368-02 | US2 | cli pass |
| uc-368-03 | US3 | cli pass |
| uc-368-04 | US4 | cli pass |
| uc-368-05 | US5 | cli pass |
<!-- codeloop verify: end -->

## Live walk
stack: a fresh git repo set up with `codeloop init -t claude -y`, the c-368 build of the CLI (`node dist/index.js`, built through scripts/build-safe.mjs), and the board served with `codeloop serve --standalone --port 4391 --owner` on the same files.
url: http://127.0.0.1:4391/home
steps:
- `codeloop card propose build "Founders can see parked work"` then `CLAUDE_CODE_SESSION_ID=walk-a codeloop start c-001`: "started c-001 at research, promoted from its proposal" and "active card: c-001 (this session only)"; the session file .codeloop/state/active/walk-a.json names c-001.
- With `CODELOOP_AGENT_RUN=claude`, `codeloop start c-002` on a proposal: "refused: c-002 is a proposal: starting it is the owner's promote, which an agent run cannot make"; c-002 stayed proposed.
- `codeloop bug "Founders see the right alias when they type cards"`: "filed c-003 in build at build, flagged as a bug", the session switched to c-003, last line "Card: c-003".
- `codeloop card show c-003`: "story: not written. codeloop card edit c-003 --story ..." and "description: none. codeloop card edit c-003 --description ..."; two `card edit --description` calls (one through the `cards` alias) left both lines "2026-10-18 owner: Ship after the alias fix." and "2026-10-18 owner: Second decision.".
- A session file for c-001 with a modification time 10 hours old showed no holder in `card show c-001 --json`; a fresh one showed "claude on walk, since 06:00"; after one `guard prompt` from another session c-001 gained the event "hold expired: ... (session dead-run) quiet for 597 min".
- `CODELOOP_AGENT_RUN=claude codeloop card release c-001` while another session held it: "refused: ... an agent run releases only its own hold"; without the agent variable it released both holds and c-001 gained a `release` event naming the owner.
- `codeloop card park c-001 later`, then `codeloop card list`: "c-001 ... parked (from research)" while c-002 still read "waiting for you: proposal"; `codeloop inbox --json` backlog was {count: 1, parked: 1, oldest: c-002}.
- Opened the served Home page and its inbox: both answered 200.
network:
- GET http://127.0.0.1:4391/home 200
- GET http://127.0.0.1:4391/api/home 200, needsYou, inProgress and agents lists present
- GET http://127.0.0.1:4391/api/inbox 200
- POST http://127.0.0.1:4391/api/cards/c-003/release 403 without the token (an owner server's routes need it); the 200 path is covered by "board routes" in card-one-command.test.ts
external: none: start, bug, release and the hold clock work on files under .codeloop and the git history in the repo, and call nothing outside the machine

## Rubric
- V4 pass: before any fix `npx vitest run src/commands/__tests__/card-one-command.test.ts` printed `Tests 15 failed | 7 passed (22)`. uc-368-01 (start <id>) failed 4 of 5 tests (a queued story stayed queued, the proposed one was not promoted), uc-368-02 failed both bug tests with "unknown command 'bug'", uc-368-03 failed the blank-field and append tests, uc-368-04 failed all but "a hold with recent activity keeps showing" (for example `expected 'back' to be undefined`), uc-368-05 failed the parked-list and move-past-a-gate tests (`refused: c-001 is stuck at spec`). The seven that passed first are over-fix guards; each was reverted after the fix and failed once (landed-code requirement removed, append replaced by overwrite, touch removed, dedupe removed, ownerOnly removed, backlog filter removed, parked label removed).
- V6 pass: evidence/368/uc-368-01.json to uc-368-05.json hold each use case's output; the walk above quotes each command's output and the three Home and inbox calls; `npx vitest run` printed `Test Files 130 passed, Tests 1036 passed` at the head the walk was run on, plus the one route test added since (23 of 23 in the card-one-command file).
