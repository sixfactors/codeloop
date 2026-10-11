# Commands

There is no Makefile. Everything is an npm script or a file under `scripts/`.

## Build

| Command | What it does |
|---|---|
| `npm run build` | Compiles the source to `dist/` with tsc; the CLI and every e2e script run from there |
| `npm run dev` | tsc in watch mode while editing the source |
| `npm run build:ui` | Builds the static kanban in the ui folder into `dist/ui` |
| `npm run build:workspace` | Builds the board app in the workspace folder as a standalone Next server into `dist/workspace` (`scripts/build-workspace.mjs`) |
| `npm run build:all` | tsc, the ui build and the workspace build in order; CI and the first-user proof need this |
| `npm run prepublishOnly` | Runs the full build before publishing; do not call it by hand |

## Test

| Command | What it does |
|---|---|
| `npm test` | The vitest suite; needs `dist/` for the tests that spawn the CLI |
| `npm run test:watch` | vitest in watch mode while editing one area |
| `npm run test:coverage` | Suite with a coverage report |
| `bash scripts/e2e-founder-loop.sh` | The lane engine end to end against `dist/` in a temp project; run after touching engine, lanes, gates or runs |
| `bash scripts/first-user.sh` | Installs the packed tarball and runs every command from the Start docs; run before a release |
| `bash scripts/demo-founder-week.sh` | A whole week with a stand-in agent, every step asserted |
| `bash scripts/e2e-cloud.sh` | Cloud sync against a local Protobox; reports SKIP when none runs |
| `bash scripts/e2e-agent-real.sh` | One stage with a real `claude -p`; SKIP unless the CODELOOP_E2E_REAL_AGENT variable is 1 |

## Measure

| Command | What it does |
|---|---|
| `npm run bench` | Starts `codeloop serve` on a generated project and measures index build time, the cards route and page search (`scripts/bench.mjs`) |
| `node scripts/bench-fixture.mjs` | Writes the project the benchmark reads: 5k cards and 20k wiki pages by default |

Left out: nothing; every script and file under `scripts/` is named above except the helper modules `scripts/first-user/blocks.mjs` and `scripts/first-user/browser.mjs`, which `first-user.sh` loads.
