# c-119 research review

verdict: accept

## Summary

The research correctly finds that server-side state derivation and the failing flag already
ship in src/lib/states.ts and src/lib/services.ts, and scopes the remaining work to the blocked
flag, gated on c-118's links. It explicitly rejects rebuilding state logic in the UI, which is
the failure mode this review was watching for. One real gap: it does not surface the design's
rule that a blocked story never enters Up next, which the spec stage still has to decide.

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| Correctly identifies existing server-side derivation instead of proposing a rebuild | `storyState()` in src/lib/states.ts:33 and `boardView`/`homeView` in src/lib/services.ts:751/777 do exactly what the research claims: derive six states plus a failing flag, served on GET /api/board and GET /api/home (confirmed wired in src/lib/server.ts:367-368) | none, this is the main thing it had to get right |
| `blocked` flag claim verified against code | `StateFlag` in src/lib/states.ts:11 lists `blocked`; `storyState()` never pushes it, matching "typed but never set" | none |
| Design citations verified | docs/artifacts/codeloop-ui-design.html and .codeloop/wiki/architecture/ui.md both state six display states, failing/blocked flags, stage as sub-label, matching the research's quotes | none |
| c-118 dependency verified | c-118 (links: blocks, blocked_by, relates, duplicates) is still at interview stage, not built; cards.ts has no link fields yet, so "card links do not exist yet" is accurate | none |
| Misses a design requirement the blocked flag interacts with | codeloop-ui-design.html line 186: "Links... A blocked story never enters Up next." Research's options only cover setting the flag from `blocked_by`, not this gating rule, which the spec stage will need to decide | medium |
| Source line numbers are approximate | research.md cites html:195 and services.ts:751; actual content sits 1-9 lines from those anchors, still inside the correct section/function | low |
| No competitor row | `.codeloop/wiki/competitors/` has zero pages, so an empty "How others show it" table is correct per the checklist, not a gap | none |

## Sources, relevance, verdict

All four `- source:` lines are local repo paths, not URLs; no external citations to fetch with
WebFetch. I read each cited file directly instead: states.ts, services.ts, server.ts, the design
HTML, ui.md, and c-118's card history all say what the research claims. Nothing invented,
nothing mismatched.

Relevance: directly answers the three things this story must decide (server-side derivation,
failing/blocked flags, stage as sub-label), and correctly treats the first two as already done.

Supported, not merely asserted: every claim has a path:line a reviewer can open, and
`codeloop check research c-119 --min-sources 3` exits 0.

Gap for the spec stage: decide whether `blocked` should also exclude a story from Up next, per
the design table, or stay a display-only flag for this card.
