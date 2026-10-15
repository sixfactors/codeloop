verdict: accept

## Findings

| Finding | Evidence | Severity |
|---|---|---|
| `exists: build` call is correct and actually searched | Verified `src/lib/states.ts:40` (`QUEUED` -> `up-next`), `src/lib/services.ts:755` (`boardView` reads `board.up_next.limit` for the chip only, no refill), `src/lib/engine.ts:512-542` (`promoteQueued` only moves `queued` into a lane's first stage under `lane.wip`, never touches `proposed`/Plan). `config.ts` has no schema validation at all (`loadConfig` returns raw `Values`), confirming "no validated config" for any key, not just this one. | low (confirmed accurate, no action needed) |
| Pain and prior decision are real, not invented | `specs/100/spec.md:46` literally says "6, refilled automatically... as board.up_next.limit / auto_refill in config. (owner)"; `docs/artifacts/codeloop-ui-design.html:314` says "Up next holds 6 and refills from the top of this list" and line 186 says "A blocked story never enters Up next." `c-109` card log confirms it was dropped as "superseded by c-120." | low |
| Good catch: this card's "skip blocked" conflicts with c-119's own deferral reasoning | `specs/119.../interview.md` recommends putting "Up next exclusion in Not building until c-128 can clear or edit a link; shipping the rule now would starve a card with no fix path" — the exact risk research.md raises and asks the builder to resolve. This is a real design tension surfaced correctly, not a gap missed. | medium (flagged, not blocking, builder must answer before/at spec) |
| Competitor table is empty | `codeloop wiki competitor list` returns "no competitor pages" — nothing to cite, so an empty table is correct per the research skill (only add a row for an existing competitor page). | low |
| Minor grammar slip | "Lane `wip`... only promote queued cards" should be "only promotes" | low |
| Sources all resolve to the exact lines cited | Checked all 5 `- source:` lines against the live files; every line number and quoted behavior matched on inspection. `codeloop check research c-120 --min-sources 3` exits 0 with no output. | low |

## Summary

Research correctly identifies the gap (no refill logic exists; `boardView`/`promoteQueued` only read/promote within existing stages) and grounds the pain in the owner's own prior clarification and the design doc, with accurate line-level citations I re-verified against the real files. Its strongest contribution is naming the real tension with c-119's deferred "skip blocked" rule, which a builder must resolve (document an unblock path) before shipping. No fabricated sources, no missed existing seam, no padding — accept as-is.
