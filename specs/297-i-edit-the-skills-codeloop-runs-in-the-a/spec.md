# c-297 spec: I edit the skills codeloop runs, in the app, and every lane uses the edit

Story: As a dev, I can edit a skill in the workspace app or the CLI, see a diff against the shipped template, reset it, and test-run it on one card, so that a lane stops running a skill I cannot change.

feature: codeloop
initiative: wiki/initiatives/any-stack-same-loop.md
size: M
metric: no-data (count of skill edits per project per week; instrument first)
done_when: a person opens Knowledge > Skills, edits `spec`, runs it once on a card, and the next `codeloop render` writes the edited text

## What a skill is today

| Piece | Where | What it does |
|---|---|---|
| Shipped skill text | `templates/skills/<name>/SKILL.md`, frontmatter `name`, `stage`, `lane`, `inputs` (`templates/skills/spec/SKILL.md:1`) | The instructions an agent follows for one stage. Read-only in practice: `codeloop update` replaces it. |
| Index | `.codeloop/skills.index.yaml`, rows `name`, `source`, `kind`, `description` | What lanes may name. `lintLane` fails a stage whose skill is not in it (`src/lib/lane.ts:119`). `adopt` merges scans into it (`src/lib/skills.ts`). |
| Lane binding | `skill: spec` on a stage in `.codeloop/lanes/build.yaml` | One skill per stage per lane. A second agent can review it (`review: { agent, skill }`, `src/lib/lane.ts:29`). |
| Host files | `src/lib/render.ts` `files()` | `codeloop render` writes `.claude/agents/codeloop-<lane>-<stage>.md` (Claude Code), `.cursor/rules/codeloop-<lane>.mdc` (Cursor), `.agents/skills/codeloop-<lane>/SKILL.md` plus `AGENTS.md` (Codex). |
| Eval | `src/lib/skill-eval.ts`, fixtures in `fixtures/skills/<name>/` | `codeloop skill eval` replays a fixture through a one-stage lane in a temp project and grades the output. |

Render does not copy the skill text. The step text only names the skill and its `source` path (`stageSteps`, `src/lib/render.ts:19`), so the agent reads whatever file `source` points at. That file is the shipped template or a file under `.claude/skills`. Nothing in the app edits it.

## What editable means

- Edit in the workspace app and in `codeloop skill edit <name>`; both go through the SDK.
- An edit lives in the repo, under `.codeloop/skills/<name>/SKILL.md`, so it is committed and reviewed like code.
- A diff of the override against the shipped template, in the app and `codeloop skill diff <name>`.
- Reset to template deletes the override.
- Scope: project override (default) or a shared library under `~/.codeloop/skills/` that several projects use. Order: project, shared, template.
- A test run: run the skill once against one named card in a throwaway stage run, show the output and the stage check result, change nothing on the card.

## Screens

Reuse the app shell (`workspace/components/shared/app-shell.tsx`), one new item under the Knowledge group.

| Screen | Shows |
|---|---|
| Skills (list) | Name, stage, source (template, project, shared), edited flag, lanes bound |
| Skill page | The text in an editor, Diff tab against the template, Reset button, lane bindings (stage ids that name it, editable), last five runs with outcome and cost, Test run button with a card picker |

## Data model

- Override file: `.codeloop/skills/<name>/SKILL.md`; last-good copy: `.codeloop/skills/<name>/.last-good.md`; history is git.
- `skills.index.yaml` `source` points at the override when one exists, written by the write operation, not by hand.
- Render resolves `source` through one function: project override, then shared, then template. The step text is unchanged, so all three hosts pick up the edit with no per-host code.
- Runs: one JSON per run under `.codeloop/state/skill-runs/` (skill, card, outcome, check exit, started, ended), the same shape as `agent-runs`.

## API and SDK

`skills.list`, `skills.read`, `skills.write`, `skills.diff`, `skills.reset`, `skills.bind` (lane, stage, skill), `skills.run` (skill, card; `202 { runId }`, polled with `runs.get`). Routes under `/api/skills`; writes need the token, as every write does (`docs/architecture.md`, "Adding a capability").

## Acceptance

- US1 Given a project with the shipped `spec` skill, when I edit it in the app and save, then `.codeloop/skills/spec/SKILL.md` exists, the Diff tab shows my change, and Reset restores the template text.
- US2 Given an edited skill bound to the spec stage, when I run `codeloop render` and start the stage, then the Claude Code, Cursor and Codex files name the override path and the agent's brief contains my text.
- US3 Given a skill, when I press Test run on a card, then I see the output and the stage check result within the run and the card's stage and files are unchanged.

screens: skills-list, skill-page
mock: drop

## Not building

- A public skill marketplace (`registry/` is separate).

## Risks

- A broken skill blocks every card at that stage. Writes keep `.last-good.md`; a skill whose last three runs failed shows a banner with Reset and Restore last good.
- Override drifts from a newer shipped template. The diff shows both sides; `codeloop update` reports an override whose template changed, and never overwrites it.
