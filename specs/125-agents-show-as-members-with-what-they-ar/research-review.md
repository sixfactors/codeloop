verdict: redo

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| Misses c-140, an in-flight sibling card adding session labels (host, machine) and an activity stream, which bears directly on this card's own flagged risk ("session ids are unstable display names") | `node dist/index.js card show c-140`: "Activity stream per story ... session labels." `grep -n "c-140\|session label\|host, machine" specs/125-.../research.md` returns nothing | high |
| Misses existing prior art for session identity: `whoami` and `.codeloop/state/presence/*.json` already record `host`, `machine`, `sessionId`, `startedAt` per session, written by Cursor hooks | `src/commands/guard-hooks.ts:294-320` (`whoamiCommand`) and `:264-270` (`presenceCommand start`); `grep -n "whoami\|presence" research.md` finds only an unrelated use of the word "presence" | high |
| `exists: build` call for a members API is correct, verified independently | `grep -rn "member" src/lib/server.ts src/lib/services.ts` returns no hits; `homeView.agents` at `src/lib/services.ts:773,785` is `{session, card, title, since}` only, matching the research's quote | n/a (confirms research) |
| Cited sources are real and match their claims | `docs/artifacts/codeloop-ui-design.html:233/248/424`, `.codeloop/wiki/architecture/ui.md:10`, `.codeloop/wiki/features/ui-data-api.md:14`, and `specs/121-.../interview.md` Q4 ("members (c-125)" scoped out of c-121) all checked and match | n/a (confirms research) |
| `codeloop check research c-125 --min-sources 3` passes mechanically | ran it, exit 0, no output | low |
| Options/Risks are otherwise well-reasoned and the pain is grounded in a real source (card text + design artifact), not an assumption | research.md `## The pain, grounded` and `## Risks` sections | low |

## Summary

The file is mechanically sound: `exists:`, `pain:`, three Options, Risks, and 10 real sources all check out against the actual code and the design artifact. But it misses the one thing this review was asked to watch for: c-140 is adding session labels (host, machine) and an activity stream in parallel, and `whoami`/presence files already carry host+machine per session today. The research's own Risks section names "session ids are unstable display names" as a problem to solve, then proposes solving it with a new members/agents config without checking whether presence or c-140's session labels already solve it. Add a Risks line (or a Q to the owner) on reusing or coordinating with c-140 and presence before this goes to spec.
