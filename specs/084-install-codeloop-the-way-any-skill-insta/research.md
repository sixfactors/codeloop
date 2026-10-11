# c-084 research: Install codeloop the way any skill installs

## What exists

<!-- Unlock before build. One line: exists: have | unlock | port | build, with a path or URL when it is not build. have = shipped and exposed, close the card. unlock = built but not exposed, expose it. port = in a sibling repo. -->
exists: build

| Piece | State | Where |
|---|---|---|
| CLI install | `npm install -g @protoboxai/codeloop` is the only documented path | `README.md:12`, `package.json` name |
| Skill files | 16 stage skills with `SKILL.md`, none has a `description:` field | `templates/skills/*/SKILL.md` |
| Slash-command templates | 10 markdown commands copied by `init`/`update` | `templates/commands/*.md` |
| Host rendering | Lane stages rendered to Claude agents, Cursor rules, Codex skills | `src/lib/render.ts` |
| Repo-root skill | None. No `SKILL.md` at the root and no `skills/` directory | repo root |

Nothing in the repo is laid out for `npx skills add`, so this is a build, not an unlock.

## How others show it

<!-- One row per competitor that has a page in .codeloop/wiki/competitors/, its name in the first cell. The row is copied to that page when this stage passes. -->
| Competitor | How they show it | Source |
|---|---|---|

`.codeloop/wiki/competitors/` has no competitor pages, so the table is empty.

## Options

| Option | What it takes | Verdict |
|---|---|---|
| A. Root `skills/codeloop/SKILL.md` that runs setup through the agent | One skill dir with `name` + `description`, a setup section that checks `command -v codeloop`, asks before `npm i -g @protoboxai/codeloop`, then runs `codeloop init`. Bundled helper referenced via `${CLAUDE_SKILL_DIR}` | Recommended |
| B. Publish every stage skill under `skills/` | 16 skills land in the user's agent dir; most need a lane and a card to mean anything | Rejected: noise before `init` has run |
| C. Keep npm only, add a copy-paste line to the site | No layout work | Rejected: does not meet Q1 |

How `npx skills add` behaves (from the vercel-labs/skills README):

- Discovers `SKILL.md` at the repo root, under `skills/`, and under agent dirs such as `.claude/skills/` and `.agents/skills/`, up to three levels deep. A shallower `SKILL.md` shadows nested ones.
- Requires frontmatter `name` (lowercase) and `description`.
- Installs to `.claude/skills/` for Claude Code and `.agents/skills/` for Codex, symlinked by default, `--copy` to copy.
- Runs no install script. The CLI install has to happen inside the skill, when the agent first uses it, which fits Q2 (confirm, no silent global install).

## The pain, grounded

<!-- The user pain this card answers, with a source. No source: write assumption: instead and say what would confirm it. -->
assumption: a developer who already installs agent skills with one command will not stop to `npm install -g` a scoped package and then run `init`; two steps and a scope they have to remember lose them before first use. Confirm with time-to-first-`init` from the c-084 stopwatch, measured for `npx skills add` against the npm path.

## Risks

- **`npm i -g codeloop` installs a different product.** The unscoped `codeloop` name on npm belongs to another publisher (v0.1.57, "CLI tool for CodeLoop — automated verification for AI coding agents", repo `OrienjoJi/codeloop-internal`). Q2 and Q4 name `npm i -g codeloop`; the skill, the site and the fallback must say `@protoboxai/codeloop`. A fixture test should fail on any unscoped install line.
- **Discovery picks up the wrong skills.** `.claude/skills/architecture/` is in the repo and the CLI scans agent dirs, so `skills add` on this repo may offer it alongside `codeloop`. Add `skills/codeloop/` and check what `npx skills add sixfactors/codeloop --list` shows; move or exclude `.claude/skills/` if it appears.
- **Stage skills without `description:`.** If any of `templates/skills/*` ends up discoverable it will be rejected or listed blank. Keep them out of discovery paths (they live under `templates/`, which is not scanned).
- **Layout drift** (Q4). Pin with a fixture test on the `SKILL.md` frontmatter and path; npm stays the documented fallback.
- **Codex has no `${CLAUDE_SKILL_DIR}`.** Setup steps must work as plain shell commands from the project root, with the helper path only as a Claude Code convenience.

## Sources

<!-- At least three, one per line: a dash, the word source and a colon, the URL, a dash, a note. `codeloop check research` counts them. -->
- source: https://github.com/vercel-labs/skills - discovery paths, required `name`/`description`, per-agent install dirs, no install scripts
- source: https://code.claude.com/docs/en/skills - SKILL.md frontmatter, bundled scripts via `${CLAUDE_SKILL_DIR}`, `allowed-tools`
- source: https://www.npmjs.com/package/codeloop - unscoped `codeloop` is a different publisher's package
- source: https://www.npmjs.com/package/@protoboxai/codeloop - the package this repo publishes (`package.json` name, v0.4.3)

verdict: build
