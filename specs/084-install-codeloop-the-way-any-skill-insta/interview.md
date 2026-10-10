## Q1 Scope: Agent Skills layout so `npx skills add` works; picking plugins from a catalog is c-087?
recommended: Layout and `skills add` here; catalog browsing out.
answer: 

## Q2 Does the skill install the CLI, or only the skill files?
recommended: Skill files plus a setup step that prints or runs `npm i -g codeloop` with confirmation; no silent global install.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given a clean repo, when `npx skills add <org>/codeloop`, then `.claude/skills/codeloop/` exists, `codeloop init` runs from it, the stopwatch reads under one minute, and the site install page shows the same command.
answer: 

## Q4 Riskiest assumption: the skills.sh layout changes under us.
recommended: Pin to the current layout with a fixture test and keep `npm i -g codeloop` as the documented fallback.
answer: 

## Q5 Hosts: Claude Code only, or Codex and Cursor via `render`?
recommended: Claude Code and Codex (render exists); Cursor is advice only.
answer: 
