# Build rubric: c-302

## Rubric
- B2 pass: trivial-ceremony.test.ts with src/lib/engine.ts at HEAD (52c86c9^): "Tests 2 failed | 6 passed (8)", the failing cases "a trivial card that outgrew the cap parks at the spec gate" (real template lane) and "is re-sized to the smallest size that runs the spec gate" (fixture lane now `size >= M`); with the fix "Tests 8 passed (8)"; tsc --noEmit clean.
- B5 pass: `codeloop wiki inject --files src/lib/engine.ts src/lib/verify.ts` returned "Lane checks need codeloop on PATH" (gotcha) and two decisions (releases service, research stage); read and acked: the change adds no spawnSync or done.cmd call site, so checkEnv() is not needed; the decisions do not touch resize.
