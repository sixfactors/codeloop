---
title: Install writes five files and a map step learns the system before
scope:
  - CLAUDE.md
  - tsconfig.json
  - package.json
  - src/commands/wiki.ts
  - .codeloop/state/repo-facts.json
  - templates/skills/architecture/SKILL.md
  - src/lib/interview.ts
  - templates/lanes/build.yaml
  - workspace/app/setup/page.tsx
  - templates/protocol.md
  - .codeloop/config.yaml
  - src/commands/init.ts
  - src/lib/scaffold.ts
  - src/lib/detect.ts
  - src/lib/wiki-outline.ts
  - src/lib/render.ts
  - .codeloop/wiki/competitors/2026-10-20-user-feedback-research.md
  - .codeloop/wiki/competitors/2026-10-20-new-repo-workflow-research.md
freq: 1
severity: warning
cards:
  - c-381
updated: 2026-10-20
---

## Options

- Install writes five files and a map step learns the system before setup asks six questions. Install is `codeloop init` reduced to `.codeloop/config.yaml`, `.codeloop/process.yaml`, `.codeloop/rules.md`, the lead-agent block in `CLAUDE.md` or `AGENTS.md`, and `.mcp.json`; skills, lanes and role files stay in the package and reach the agent through `codeloop brief` and the MCP server. A new `map` skill joins `wiki init --from-repo`, `wiki build` and the `architecture` skill with three new scans: the build and test commands run under a time limit with exit code and duration recorded, git hot spots from file churn and reverts, and conventions inferred from the layering the scanner already finds. A new `setup` skill asks six questions with recommended answers drawn from the map, and the answers write the process preset, the rules and one decision each. Detection grows to Java and .NET beside TypeScript, Python and Go. Chosen. It touches `src/commands/init.ts`, `src/lib/scaffold.ts`, `src/lib/detect.ts`, `src/lib/wiki-outline.ts`, `src/lib/render.ts`, `templates/protocol.md`, `templates/skills/map/`, `templates/skills/setup/`, `starters/` and `workspace/app/setup/`. It is the only option that answers the user-feedback pains 1, 6 and 9 (process sized to the change, short always-on context, existing codebases first) in the first fifteen minutes.
- Keep `codeloop init` as it is and add the six questions after it as a second command. Rejected: the sixty-odd files land before the person has seen anything useful, which is the exact complaint the research records against Spec Kit and BMAD ("a sea of markdown"), and the questions would have no learned recommendations to offer because nothing has read the repo yet.
- Learn the system with a scanner only, no agent run, and skip the questions by applying the Standard preset. Rejected: the scanner cannot say what a module does or which conventions matter (`templates/skills/architecture/SKILL.md` exists because `wiki init` output read as tables with no judgment), and a preset applied without a question leaves the sensitive areas and the never-rules unset, so approvals have nothing to attach to. Kept as the fallback when no agent is configured: install and the scanner still run, and Getting started says the summary is waiting for an agent.

## Why

a founder or team lead (persona founder) trying an AI coding workflow on an existing service finds that the tool does not understand the system, writes a document trail before anything useful happens, and makes him learn its commands first. Source: `.codeloop/wiki/competitors/2026-10-20-user-feedback-research.md`, "The 10 pains Codeloop v2 must solve" items 1, 6 and 9, each tied to a per-tool complaint with a URL (BMAD "weak on legacy monoliths", Spec Kit "a sea of markdown", Kiro "sledgehammer to crack a nut"); and `.codeloop/wiki/competitors/2026-10-20-new-repo-workflow-research.md`, "Proposed first-run workflow", which counts the files `codeloop init` writes today and notes that `--ci` and the scaffold need two runs.

## Consequences

Install writes five files and a map step learns the system before setup asks six questions. Install is `codeloop init` reduced to `.codeloop/config.yaml`, `.codeloop/process.yaml`, `.codeloop/rules.md`, the lead-agent block in `CLAUDE.md` or `AGENTS.md`, and `.mcp.json`; skills, lanes and role files stay in the package and reach the agent through `codeloop brief` and the MCP server. A new `map` skill joins `wiki init --from-repo`, `wiki build` and the `architecture` skill with three new scans: the build and test commands run under a time limit with exit code and duration recorded, git hot spots from file churn and reverts, and conventions inferred from the layering the scanner already finds. A new `setup` skill asks six questions with recommended answers drawn from the map, and the answers write the process preset, the rules and one decision each. Detection grows to Java and .NET beside TypeScript, Python and Go. It touches `src/commands/init.ts`, `src/lib/scaffold.ts`, `src/lib/detect.ts`, `src/lib/wiki-outline.ts`, `src/lib/render.ts`, `templates/protocol.md`, `templates/skills/map/`, `templates/skills/setup/`, `starters/` and `workspace/app/setup/`. It is the only option that answers the user-feedback pains 1, 6 and 9 (process sized to the change, short always-on context, existing codebases first) in the first fifteen minutes. The other options are not built; reopening one is a new decision.
