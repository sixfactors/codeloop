# c-332 research: v2 runs beside v1 under its own name, home and port

## What exists

<!-- Unlock before build. One line: exists: have | unlock | port | build, with a path or URL when it is not build. have = shipped and exposed, close the card. unlock = built but not exposed, expose it. port = in a sibling repo. -->
exists: build

Nothing in the checkout knows which channel it is. `codeloopHome()` in `src/lib/hub-registry.ts` is `CODELOOP_HOME` or `~/.codeloop`, with no default that differs for a development build, so `node dist/index.js` run from the checkout reads and writes the same `~/.codeloop/projects.json`, the same `~/.codeloop/state/hub.json` (`src/lib/hub-state.ts`) and the same `~/.codeloop/state/hookd.sock` (`src/lib/hookd.ts`) as the frozen global `codeloop`. The hub's default port is one number for every build (`DEFAULT_HUB_PORT` in `src/commands/hub.ts`); `src/lib/schedule.ts` tags every crontab line `# codeloop:<project>` with no channel in the tag, so a v2 `schedule install` would edit v1's lines; `.mcp.json` names the server `codeloop` and the command `codeloop`; and `bin/codeloop-hook` falls back to `${CODELOOP_BIN:-codeloop}`, which is v1 on PATH. The one piece that exists is the environment seam: `CODELOOP_HOME`, `CODELOOP_HOOKD_SOCK` and `CODELOOP_BIN` are already read, and the test setup uses them to keep a suite away from the real home (`vitest.setup.ts`). c-331 froze the global `codeloop` at 1.0.0 (`scripts/check-frozen.sh`) and c-330 gave v1 the moved-board refusal, so the remaining gap is on the v2 side: a build that knows it is "next" and keeps to its own home, port, socket, schedule tag and MCP name.

What the freeze check found on 2026-10-20, before the freeze: a `card handback` for ops-ai's board was running as `node /Users/deangrover/Projects/codeloop/dist/index.js` (pid 53217), and the hub on :4050 ran from the checkout's dist (pid 59107). Both are the failure this card removes: a development build acting on the production record because nothing told it not to.

## How others show it

<!-- One row per competitor that has a page in .codeloop/wiki/competitors/, its name in the first cell. The row is copied to that page when this stage passes. -->
| Competitor | How they show it | Source |
|---|---|---|
| BMAD | Installed per project into `_bmad/` by `npx bmad-method install`; the version a project runs is the one in its folder, so two projects can run two versions, but one project cannot run two side by side | https://docs.bmad-method.org/start/install-bmad/ |
| Spec Kit | `specify init` writes `.specify/` into the repository; the tool runs per invocation (`uvx`), so there is no global install to freeze and no second channel | https://github.github.io/spec-kit/ |
| Kiro | One IDE, one version, updated by the vendor; a user cannot keep an old version for one project and run a new one beside it | https://kiro.dev/docs/getting-started/first-project/ |

## Options

- Give the build a channel: `dist/channel.json` saying `stable` is written only by the release pack, so a tree build with no channel file is `next`; `next` defaults the home to `~/.codeloop-next`, refuses a `CODELOOP_HOME` equal to the v1 home, keeps every state path under `<home>/v2`, listens on its own default port, writes `major` and `channel` into its hub record and refuses to adopt one without `major: 2`, tags its crontab lines by channel and never edits a line with another tag, and is reached as `codeloop-next` through a shim written beside the global `codeloop`. Chosen. Every surface a v1 process shares with a v2 process (home, hub record, socket, crontab, PATH name, MCP name) gets a value that differs by channel, and the default for a tree build is the safe one, so forgetting to configure anything cannot reach v1.
- One binary and one home, told apart by an environment variable (`CODELOOP_CHANNEL=next`) with no second command name. Rejected: a hook line, a cron line or an MCP entry that forgets the variable runs against the v1 home without saying so, and the name on PATH is what a person types and what `.mcp.json` and the crontab record. The failure is silent exactly where it is most costly.
- Publish v2 as a second npm package (`@protoboxai/codeloop-next`) with its own bin. Rejected for v2.0: it doubles the package, the site and the install docs for a phase that ends when v2 becomes `codeloop`; a shim beside the global `codeloop` that points at the checkout's dist gives the same name with no second package, and the release pack later writes `channel.json` as `stable` and the shim goes away.

## The pain, grounded

<!-- The user pain this card answers, with a source. No source: write assumption: instead and say what would confirm it. -->
pain: a builder (persona builder) developing v2 in the checkout has no way to run or test the build that cannot also write the record, hub and schedule the production project runs on: `codeloopHome()` in `src/lib/hub-registry.ts` (line 23) resolves to `~/.codeloop` for every build, and `scripts/check-frozen.sh` run on 2026-10-20 found a checkout `dist/index.js` process writing a hand-back onto ops-ai's board and the shared hub running from the checkout. Source: `src/lib/hub-registry.ts`, `scripts/check-frozen.sh` and the 10-18 plan story S0.3 in `docs/artifacts/codeloop/cloud/c-321-implementation-plan.html`.

## Risks

- A lane check inside a v2 run calls `codeloop` through PATH and gets v1: the shim sets `CODELOOP_BIN` and prepends its own bin folder, and a lane check that prints `codeloop --version` under `codeloop-next` must print the next version (plan S0.3 failure mode).
- The hook script's fallback runs v1 when the v2 daemon is down: `bin/codeloop-hook` already honours `CODELOOP_BIN`; the shim sets it, and the test runs the hook with no daemon and checks the fallback's `--version`.
- `codeloop-next` pointed at a v1 project reads or writes its board: a project with `cards.json` and no `project.json` exits 2 naming import, except `import --shadow`, which reads a copy and writes only under the v2 home.
- The checkout's `--version` still says 1.0.0 after the freeze (c-331 left the version alone so the frozen build and the tag agree): v2 needs a next version string that `src/lib/version.ts` can parse, which today accepts digits and dots only. Carried to the interview.
- A v2 default port collides with a v1 hub a person moved (v1 runs on 4050 today, its default is 4040): the hub record carries `major`, and a port that answers with a record missing `major: 2` is refused, not adopted.

## Open questions

Carried to the interview, not guessed here:

1. The next version string for the checkout (`2.0.0-next.0`?) and whether `src/lib/version.ts` is widened to prerelease identifiers in this story.
2. What `codeloop-next` does when run inside a project that holds a v1 board: exit 2 naming `codeloop-next import`, with `import --shadow` the only read, as the plan says, or allow plain reads too.
3. What a tree build with no channel file does when `init` renders hook and MCP files: name `codeloop-next` (so a v2 development project never calls v1), or `codeloop`.
4. Whether to take the plan's default ports (4060 stable, 4070 next) while v1 keeps its own default and its live 4050.
5. Where the `codeloop-next` shim lives and what it sets: beside the global `codeloop` in the active node's bin folder, setting `CODELOOP_HOME`, `CODELOOP_BIN` and the channel, as the plan's `scripts/next-install.sh` says.

## Sources

<!-- At least three, one per line: a dash, the word source and a colon, a URL or a path in this repo (optionally path:line), a dash, a note. `codeloop check research` counts them; a path counts only when the file exists. -->
- source: docs/artifacts/codeloop/cloud/c-321-implementation-plan.html - the 10-18 plan, story S0.3: the acceptance lines, the tasks (channel.ts, hub-state major and ports, project-root refusal, schedule tags, next-install.sh) and the three failure modes this research keeps
- source: .codeloop/wiki/architecture/v2-context-layer.md - the approved v2 design: the server owns the record and nothing in the checkout may touch what ops-ai runs until v2 has proven itself
- source: src/lib/hub-registry.ts:23 - `codeloopHome()` is `CODELOOP_HOME` or `~/.codeloop` for every build; the seam the channel hangs on
- source: src/lib/hub-state.ts - the hub record under `<home>/state/hub.json` has no `major` or `channel`, so a v2 hub would adopt or overwrite a v1 record
- source: src/lib/schedule.ts - crontab lines are tagged `# codeloop:<project>` with no channel, so a v2 `schedule install` would edit v1's lines
- source: src/lib/hookd.ts - the hook socket is `CODELOOP_HOOKD_SOCK` or `<home>/state/hookd.sock`; a v2 daemon with the v1 home would answer v1 hooks
- source: bin/codeloop-hook - the fallback runs `${CODELOOP_BIN:-codeloop}`, which is v1 on PATH unless the shim sets it
- source: src/commands/hub.ts:15 - one `DEFAULT_HUB_PORT` for every build
- source: scripts/check-frozen.sh - the freeze check that found a checkout dist process on ops-ai's board and the hub running from the checkout on 2026-10-20
- source: src/lib/version.ts - `parseVersion` and `compareVersions` accept digits and dots only, so a prerelease next version needs them widened

## Rubric

- R2 pass: `grep -rln "codeloop-next\|CODELOOP_CHANNEL\|channel.json\|\.codeloop-next" src bin scripts templates` at 907db78 finds nothing; `ls ~/.codeloop-next` says no such file; `codeloop --help` at 1.0.0 lists no channel, home or `--next` option; `grep -n "major\|channel" src/lib/hub-state.ts` finds nothing
- R5 pass: three options under `## Options`; the channel with its own name, home, port, socket, schedule tag and MCP name is chosen because a tree build defaults to the safe channel; the environment-variable option loses because a forgotten variable fails silently against the v1 home, and the second-package option loses because it doubles the package and site for a phase that ends at cutover
- R7 pass: five open questions under `## Open questions` (next version string, v1 board refusal scope, what a tree build's `init` renders, default ports, the shim's home and variables), each to be asked in the interview with a recommended answer

verdict: build
