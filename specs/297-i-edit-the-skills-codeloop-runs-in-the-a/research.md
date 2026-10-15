# c-297 research: I edit the skills codeloop runs, in the app, and every lane uses the edit

## What exists

exists: unlock - the shipped skills, the index, the per-stage binding, the host render and `skill eval` all exist (`templates/skills/`, `src/lib/render.ts`, `src/lib/skill-eval.ts`); what is absent is an override path, a diff, a reset and any screen or SDK operation for skills. Skills are not on the SDK's public surface (`docs/architecture.md`).

## How others show it

| Source | How skills or rules are edited |
|---|---|
| Claude Code skills (`.claude/skills/<name>/SKILL.md`, user and project scope) | Plain files in the repo; project overrides user by name. No UI, no diff against a shipped default. Source: https://docs.claude.com/en/docs/claude-code/skills |
| Cursor rules (`.cursor/rules/*.mdc`) | Files in the repo with `alwaysApply` and globs; a settings screen lists them. No test run. Source: https://docs.cursor.com/context/rules |
| Codex `AGENTS.md` and `.agents/skills` | One file read by directory; nearest file wins. No versions beyond git. Source: https://developers.openai.com/codex/guides/agents-md |
| Spec Kit (`.specify/templates/`, `/speckit.*` commands) | Templates copied into the repo by init and edited by hand; upgrades overwrite or conflict. Closest to the template-plus-override problem. Source: https://github.com/github/spec-kit |
| BMAD (`bmad/` agents and tasks, customisable via `*.customize.yaml`) | A separate customise file survives upgrades while the shipped agent stays untouched. The override model proposed here. Source: https://github.com/bmad-code-org/BMAD-METHOD |

## Risks

- A bad edit stops every card at the stage; last-good and a failure banner are the answer.
- `render` today never reads skill text, so "every lane uses the edit" depends on the source path switch, which the spec must prove on all three hosts.

## Sources

- source: src/lib/render.ts:19 - step text names the skill and its source path
- source: src/lib/lane.ts:119 - lint requires the skill in the index
- source: src/lib/skill-eval.ts - fixtures replay a skill through a one-stage lane
- source: docs/architecture.md - adding a capability: service, API, SDK, CLI and UI in order

verdict: unlock
