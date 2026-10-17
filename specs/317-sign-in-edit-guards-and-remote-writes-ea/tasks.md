# c-317 tasks: Sign-in, edit guards and remote writes each have a test that has failed once

- [x] T001 [US1] [test] A set hub password refuses the default and signs in with the new one, src/lib/__tests__/hub-password.test.ts
- [ ] T002 [US2] [api] A guard that throws blocks with exit 2 on the daemon and the CLI path, src/lib/hookd.ts and src/commands/guard-hooks.ts
- [ ] T003 [US3] [test] A second write from the same page version is a 409 and the first write stays, src/lib/__tests__/page-stale-write.test.ts
- [ ] T004 [US4] [test] A hub.json naming a closed port starts a new hub and rewrites the file, src/lib/hub-state.ts
- [ ] T005 [US5] [api] A critical gotcha outside the story's area leaves its health delta unchanged, src/lib/health.ts
