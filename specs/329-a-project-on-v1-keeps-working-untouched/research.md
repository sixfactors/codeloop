# c-329 research: A project on v1 keeps working untouched until v2 is proven

## What exists

<!-- Unlock before build. One line: exists: have | unlock | port | build, with a path or URL when it is not build. have = shipped and exposed, close the card. unlock = built but not exposed, expose it. port = in a sibling repo. -->
exists: build

The production project, ops-ai, runs the global `codeloop` (its hooks in `.claude/settings.json` run `codeloop guard …`, its `.mcp.json` runs `codeloop mcp`, its crontab line names the global bin) and keeps its board under `~/.codeloop/projects/ops-ai/` through links in its `.codeloop/`. Until 2026-10-20 nothing kept the checkout away from it: the global was a tarball hand-built from a checkout at 0.5.0 with no record of its commit (`~/.codeloop/v1-freeze.md`, written 10-17), the hub on :4050 ran from the checkout's `dist/`, and `node dist/index.js` from the checkout wrote hand-backs onto ops-ai's board. The children of this epic build the missing pieces: c-330 (a board whose record moved refuses v1 writes, landed), c-331 (a frozen 1.0.0 packed from the tag `v1.0.0`, installed as the global, the hub restarted from it, proven by `scripts/check-frozen.sh`; landed), c-332 (v2 runs beside v1 under its own name, home and port), c-333 (one check that proves a v2 session left v1 untouched), and the E4 stories (nightly parity, a rehearsed rollback, codeloop's own board on v2, a dry run of ops-ai's migration, the switch). What does not exist is the written bar for "v2 is proven" and the rehearsed way back; both are this epic's to define and the E4 stories' to build.

## How others show it

<!-- One row per competitor that has a page in .codeloop/wiki/competitors/, its name in the first cell. The row is copied to that page when this stage passes. -->
| Competitor | How they show it | Source |
|---|---|---|
| BMAD | A project pins the version in its own `_bmad/` folder and upgrades with `npx bmad-method install`; there is no side-by-side run and no proof that an upgrade changed nothing | https://docs.bmad-method.org/start/install-bmad/ |
| Spec Kit | Runs per invocation from the repository's `.specify/` templates; a project is on whatever `specify init` wrote and upgrades by running it again, with no record of what changed | https://github.github.io/spec-kit/ |
| Kiro | The vendor updates the IDE; a team cannot hold one project on the old version while trying the new one | https://kiro.dev/docs/getting-started/first-project/ |

## Options

- Freeze v1 as a packed release the production project runs, build v2 beside it under its own name, home, port and schedule tag, prove after every v2 session that v1 was left alone, run codeloop's own board on v2 first, and switch the production project once, with a rehearsed rollback and a written bar it must meet before. Chosen. Each child story removes one way a development build can reach the production record, the bar makes "proven" a check and not a feeling, and the rollback is rehearsed before it is needed.
- Build v2 in place, on the same board and binary, behind feature flags. Rejected: every build of the checkout changes what the production project's hooks, cron run and MCP execute, a misread flag is a write to the production board, and v2 moves the record out of `cards.json` into a store only the hub writes, which no flag can hide from v1 readers.
- Fork the repository for v2 and keep this one as v1. Rejected: two histories for one product, every v1 fix landing twice, and the frozen build still has to be pinned and proven on the production machine, which is the work of c-331 and c-333 whichever repository holds the code.

## The pain, grounded

<!-- The user pain this card answers, with a source. No source: write assumption: instead and say what would confirm it. -->
pain: the founder (persona founder) runs ops-ai every day on codeloop, and building v2 in the same checkout changed what it ran: on 2026-10-20 `scripts/check-frozen.sh` found the hub on :4050 running from the checkout's `dist/` and a checkout `dist/index.js` process writing a hand-back onto ops-ai's board, while the global was a tarball with no commit recorded (`~/.codeloop/v1-freeze.md`). Source: `scripts/check-frozen.sh` (its first run, kept in specs/331-the-production-project-runs-a-frozen-v1/rubric-build.md) and the 10-18 plan P0 in `docs/artifacts/codeloop/cloud/c-321-implementation-plan.html`.

## Risks

- The freeze is undone by habit: a worker runs `node dist/index.js` on the board again. CLAUDE.md now says board commands use `codeloop`, and `scripts/check-frozen.sh` fails while any such process runs.
- The bar for "proven" is never written, so the switch is a judgement call under time pressure. The interview asks the owner for it; the E4 parity and dry-run stories are the checks.
- Rollback is a script nobody has run: the E4 rollback story rehearses it on a copy before the switch, and the switch story refuses without a rehearsal on record.
- This card is size L and cannot pass the spec gate unsplit (`docs/story-standard.md`): it is the epic's parent, with its work in c-330 to c-333 and the E4 stories; whether it stays as the parent or is marked as an epic record is the owner's call.

## Open questions

Carried to the interview, not guessed here:

1. The written bar v2 must meet before ops-ai switches: how many days codeloop's own board runs on v2, how many nightly parity runs green, and a passing dry run of ops-ai's migration.
2. Who flips the switch and who may roll back, and whether a rollback rehearsal on a copy is required within some number of days before the switch.
3. What this parent card is on the board: an epic record that closes when its last child does (and is never built itself), or a story that is split so each piece can pass the spec gate.
4. Whether the frozen 1.0.0 may take a hotfix before the switch, and how (a `v1.0.x` tag packed and installed the same way), or whether v1 is closed to changes.

## Sources

<!-- At least three, one per line: a dash, the word source and a colon, a URL or a path in this repo (optionally path:line), a dash, a note. `codeloop check research` counts them; a path counts only when the file exists. -->
- source: docs/artifacts/codeloop/cloud/c-321-implementation-plan.html - the 10-18 plan: story P0 and epics E0 (freeze and isolate) and E4 (parity, rollback, dogfood, cutover), the children this epic parents
- source: .codeloop/wiki/architecture/v2-context-layer.md - the approved v2 design and the direction that nothing on the production project changes until v2 has proven itself
- source: scripts/check-frozen.sh - the freeze check: the global binary, the installed gitHead against the tag, the cron line, and no process from the checkout
- source: scripts/release-pack.sh - the pack from `git archive` of the tag, never the working tree
- source: scripts/release-install.sh - the install that refuses a tarball outside the releases folder or without its sha256 and restarts the hub from the installed build
- source: src/lib/cards.ts - `assertBoardNotMoved` and the moved marker (c-330), the v1 side of the switch
- source: docs/story-standard.md - size L cannot pass the spec gate unsplit, which decides what this parent card can be
- source: CLAUDE.md - the workers' instruction that board commands in the checkout use the frozen `codeloop`

## Rubric

- R2 pass: before 2026-10-20 `git tag` listed only `v0.4.0` (no v1 tag); `ls scripts/` had no release-pack, release-install or check-frozen script; `~/.codeloop/v1-freeze.md` recorded a tarball built from a checkout with "package.json still says 0.5.0" and no gitHead; `ps` showed pid 59107 `node .../codeloop/dist/index.js hub --port 4050`
- R5 pass: three options under `## Options`; freeze-and-build-beside is chosen; flags lose because every checkout build still changes what the production project executes and v2's store cannot hide behind a flag; a fork loses because the freeze and the proof are needed on the production machine either way and every v1 fix would land twice
- R7 pass: four open questions under `## Open questions` (the written bar, who switches and rolls back, what this parent card is, hotfixes to the frozen v1), each for the interview with a recommended answer

verdict: build
