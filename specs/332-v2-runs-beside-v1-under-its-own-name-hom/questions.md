## Q1 Scope: what version string does the checkout carry as v2, now that the frozen build and the tag both say 1.0.0? (builds on research.md:41)
recommended: `2.0.0-next.0`, bumped to `-next.1`, `-next.2` at each milestone, with `src/lib/version.ts` widened in this story to parse a prerelease suffix, so `codeloop-next --version` and `node dist/index.js --version` both say next and a lane check that prints the version can tell the two apart.

## Q2 Boundary: what does `codeloop-next` do when run inside a project that holds a v1 board (cards.json and no project.json)? (builds on research.md:40)
recommended: Exit 2 naming `codeloop-next import`, for reads and writes alike; the one exception is `import --shadow`, which reads a copy into the v2 home and writes nothing in the project. A plain read is refused too, because a read that worked would invite the next command to be a write.

## Q3 Risk: when a tree build with no channel file runs `init` or `update` in a v2 development project, which command name do the hook and MCP files it writes call? (builds on research.md:43)
recommended: `codeloop-next`, so a v2 development project never calls v1 through PATH; the release pack writes `dist/channel.json` as stable, and the same templates then render `codeloop`. The shim sets `CODELOOP_BIN` so `codeloop-hook`'s fallback goes to v2 as well.

## Q4 Acceptance: which default hub ports, given v1's default is 4040 and its live hub is on 4050? (builds on research.md:45)
recommended: The plan's 4060 for a stable v2 and 4070 for next, both away from 4040 and 4050; a v2 hub records `major: 2` and `channel` in its hub.json under `~/.codeloop-next/v2/state/` and refuses to adopt or stop a hub record without `major: 2`, so a v1 record on any port is never touched.

## Q5 Scope: where does the `codeloop-next` shim live and what does it set? (builds on research.md:44)
recommended: `scripts/next-install.sh` writes it beside the global `codeloop` in the active node's bin folder; it sets `CODELOOP_HOME=~/.codeloop-next`, `CODELOOP_BIN=codeloop-next` and `CODELOOP_CHANNEL=next`, prepends its own folder to PATH, refuses to start when `CODELOOP_HOME` equals the v1 home, and runs the checkout's `dist/index.js`. Removing it is one `rm`; nothing under `~/.codeloop` is written by installing or removing it.
