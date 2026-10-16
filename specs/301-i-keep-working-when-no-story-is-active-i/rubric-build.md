# Build rubric: c-301

## Rubric
- B2 pass: host-enforcement.test.ts on the build before the change: "× lets the prompt through with no active story and names the top 3 open stories in priority order", "Tests 1 failed | 5 passed" (guard prompt exited 2); after `npm run build`: "Tests 39 passed (39)"; the nudge text also came out of bin/codeloop-hook prompt in a sandbox repo with exit 0. `start --activate`: the new test against a private build of 3fb30b1 failed "expected 1 to be +0" (unknown option), and after `npm run build` the file is 40/40 and layering.test.ts 6/6.
- B5 pass: `codeloop wiki inject --files src/commands/guard-hooks.ts` returned "no wiki pages apply to these files"; read the hook daemon (src/lib/hookd.ts), which captures stdout and exit code, so a plain stdout nudge with exit 0 passes through it unchanged.
