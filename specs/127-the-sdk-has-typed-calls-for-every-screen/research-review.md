verdict: accept

| Finding | Evidence | Severity |
|---|---|---|
| Existing SDK seam correctly identified, not duplicated | `src/sdk/client.ts:257` and `:260` confirm `board.get`/`home.get` exist and no plan/releases/story/wiki screen methods do; research says exactly this | low (confirms correctness, not a problem) |
| Hooks/QK-live-in-workspace claim is accurate | `workspace/lib/queries.ts:32` is `export const QK = {`; `workspace/hooks/use-api.ts` defines `useBoard`/`useHome` over it; none of this is in `src/sdk/` | low |
| No `@tanstack/react-query` in root `package.json` confirmed | `grep -n "tanstack\|react" package.json` returned nothing | low |
| c-122 decision page and "no query/bulk ops" claim check out | `.codeloop/wiki/decisions/i-can-find-any-story-with-a-query-and-ch.md` verdict is build, scoped to API only, SDK left to c-127 | low |
| No competitor pages, correctly left blank | `ls .codeloop/wiki/competitors/` is empty | low |
| Sequencing risk on c-121/c-122 is real and correctly flagged | `codeloop card show c-121` confirms it owns `/home /board /plan /releases /stories/:id /wiki/:path`; c-122 owns query/bulk — both still mid-build, so SDK methods risk stubbing against unfinished contracts | medium (flagged, not blocking) |
| `docs/architecture.md:12` citation points at the SDK-layer line, not the "thin peers" quote attributed to it (that's line 14) | Read file: line 12 = `SDK (src/sdk/) CodeloopClient over a Transport...`; line 14 = `CLI + UI ... thin peers on the SDK` | low |
| `check research c-127 --min-sources 3` passes | ran it directly: exit 0, no output | — |

Research correctly names the real seam (`CodeloopClient`/`Transport` in `src/sdk/`, both transports, `sdk.test.ts` contract pattern) and does not propose rebuilding anything that exists. Every checked claim about the code matched what's on disk; the one citation slip is two lines off and harmless. The sequencing risk against c-121/c-122 is the one substantive issue and is already called out in the research itself, not missed.
