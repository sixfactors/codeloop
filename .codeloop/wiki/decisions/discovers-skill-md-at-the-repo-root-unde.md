---
title: Discovers SKILL.md at the repo root, under skills/, and under agent
scope:
  - package.json
  - src/lib/render.ts
freq: 1
severity: warning
cards:
  - c-084
updated: 2026-10-14
---

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

## Why

Verdict: build.

## Consequences

Discovers `SKILL.md` at the repo root, under `skills/`, and under agent dirs such as `.claude/skills/` and `.agents/skills/`, up to three levels deep. A shallower `SKILL.md` shadows nested ones. The other options are not built; reopening one is a new decision.
