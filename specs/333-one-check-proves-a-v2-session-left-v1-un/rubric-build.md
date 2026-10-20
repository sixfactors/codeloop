# c-333 build rubric

## Rubric

- B2 pass: src/lib/__tests__/v1-untouched.test.ts run before scripts/v1-untouched.sh existed: `Tests 6 failed (6)`, each with `bash: /Users/deangrover/Projects/codeloop/scripts/v1-untouched.sh: No such file or directory`; after the script: `Tests 6 passed (6)`, including `✓ a v1 append (one new event on a card, a new card) passes: the snapshot events are a prefix`, `✓ dropping an old event fails even though the board grew`, `✓ changing the content behind the cards.json link fails, with the link itself unchanged`. The setup guard (T003) seen red with a throwaway test that wrote `projects.json` under a fixture HOME: `Error: a test in this file changed the real codeloop home (…/.codeloop); v1 files before and after: projects.json 1792475215619.7253 3 / projects.json 1792475219182.3528 16`, vitest exit 1 with the test itself green, so the failure is the guard's and names the file; the throwaway test was deleted.
- B5 pass: no critical wiki page applies to scripts/v1-untouched.sh, scripts/v1-untouched.mjs, vitest.setup.ts or the test (`codeloop check gotchas --files …` exit 0).

## The real snapshot

- `bash scripts/v1-untouched.sh snapshot` on 2026-10-20T05:46:22Z, after the freeze: registry 5011ef3126d1, hub 127.0.0.1:4050, binary /Users/deangrover/.nvm/versions/node/v26.4.0/lib/node_modules/@protoboxai/codeloop/bin/codeloop (1.0.0), crontab 1 line, ops-ai board 379 cards at version 3545; written to ~/.codeloop/v1-untouched.snapshot.json, which nothing hashes.
- `bash scripts/v1-untouched.sh compare` at once: `untouched since 2026-10-20T05:46:22.756Z`, exit 0. The compare after the full test suite is recorded in the hand-back.
