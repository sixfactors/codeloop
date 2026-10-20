---
title: What users say about spec-driven and agent-workflow tools, 2025-2026
status: draft
updated: 2026-10-20
---

What real users report about BMAD, Spec Kit, Kiro, Tessl, Cline memory bank, Serena, Claude Code subagents, Cursor, Agent OS, Taskmaster, Superpowers, GSD and OpenSpec. The sources are Hacker News, Reddit (through snapshot mirrors, because old.reddit.com was unreachable), GitHub issues and discussions, the Cursor forum and dev blogs. No BMAD-specific Reddit thread could be opened, so the BMAD evidence comes from its GitHub repo, HN and comparison blogs. Companion page: `2026-10-20-new-repo-workflow-research.md`.

## Per tool

| Tool | What users praise | What users complain about |
|---|---|---|
| BMAD Method | The artifact trail doubles as audit evidence ([codemyspec](https://codemyspec.com/blog/best-spec-driven-development-tools)) | About 31,667 tokens per workflow run, $800 to $2,000+ a month per developer, and a dashboard that took 5.5 h against 12 min with OpenSpec ([reenbit](https://reenbit.com/bmad-vs-spec-kit-vs-openspec-choosing-your-spec-driven-ai-framework/)). About two months to master and weak on legacy monoliths (codemyspec). Re-delegation up to depth 5 at about 2.8x the tokens ([#2987](https://github.com/bmad-code-org/BMAD-METHOD/issues/2987)). The agent skips the gate ([discussion 1754](https://github.com/bmad-code-org/BMAD-METHOD/discussions/1754)). No single PRD or sprint file for a large org ([discussion 2297](https://github.com/bmad-code-org/BMAD-METHOD/discussions/2297)) |
| Spec Kit | Agent-agnostic, and more deterministic than raw prompting ([r/LocalLLaMA](https://reddit.sentinel-team.org/posts/1te3ehy/snapshots/2026-05-15T23%3A40%3A01.25497Z)). The constitution helps onboarding ([HN](https://news.ycombinator.com/item?id=45798473)) | "Drift is real"; under 50 LOC the 5-phase flow feels ceremonial (same thread). "A sea of markdown", with specs that stop governing after the first build (codemyspec). Tiny changes become hard later (HN 45798473). No merge into one ground truth ([HN](https://news.ycombinator.com/item?id=45610996)). GitHub's own author calls it an experiment ([den.dev](https://den.dev/blog/github-spec-kit/)) |
| Kiro | Forces clearer thinking ([InfoQ](https://infoq.com/news/2025/08/aws-kiro-spec-driven-agent)) | Over-engineered output, about 5,000 LOC for a tiny tool ([HN](https://news.ycombinator.com/item?id=44682381)). "Sledgehammer to crack a nut" (HN 45610996). Spec requests cost 5x vibe requests ([The Register](https://www.theregister.com/2025/08/18/aws_updated_kiro_pricing/)). Lock-in to its IDE |
| Tessl | A versioned, evaluated package registry with audit and policy features ([codemyspec](https://codemyspec.com/blog/tessl-review)) | Different code from the same spec; JS/TS only in practice; long closed beta (same review) |
| Cline memory bank | Clear rule: read all memory files at every task start ([docs](https://docs.cline.bot/prompting/cline-memory-bank)) | Files are updated by hand, and Cline drifts when they aren't; no automatic capture or versioning (vendor blog) |
| Serena | Cross-file renames and lookups in one call ([r/mcp](https://reddit.sentinel-team.org/posts/1slaykw/snapshots/2026-04-18T01%3A20%3A39.31167Z)) | Some users hit context limits faster; skip it under about 20k LOC; the dashboard auto-opens; Claude prefers built-in tools ([guide](https://mcp.directory/blog/serena-mcp-complete-guide-2026)) |
| Claude Code subagents, skills, hooks | Hooks that inject prompts on file access; LSP plugins ([r/ClaudeAI](https://reddit.sentinel-team.org/posts/1qlzxr1/snapshots/2026-01-25T12%3A39%3A50.237835Z)) | "166 agents, 5 layers deep" and $171.49 for a simple change ([r/ClaudeAI](https://reddit.sentinel-team.org/posts/1v1cbsf/snapshots/2026-07-20T20%3A24%3A21.6759Z)). Subagent knowledge vanishes on return ([Hindsight](https://hindsight.vectorize.io/blog/2026/05/06/claude-code-subagents-shared-memory)). Plan mode is rigid ([HN](https://news.ycombinator.com/item?id=47623101)) |
| Cursor | Rules scoped to files | Rules ignored; staff say "probabilistic" ([forum](https://forum.cursor.com/t/cursor-agent-not-following-rules/149542)). Background agents drained a plan in 10 minutes ([forum](https://forum.cursor.com/t/pro-plan-burned-in-10-minutes-by-background-agent-calls-completely-unacceptable/118368)) |
| Agent OS | Learns conventions from an existing codebase; plain files, no lock-in ([review](https://codemyspec.com/blog/agent-os-review)) | v3 removed specs, tasks and orchestration; standards are advisory (same review) |
| Taskmaster | Continuous, focused progress ([samelogic](https://samelogic.com/blog/claude-task-master-just-fixed-our-vibe-coding-workflow-heres-what-happened)) | MCP startup failures (issues); default telemetry captured full PRD text and code ([#1681](https://github.com/eyaltoledano/claude-task-master/issues/1681)) |
| Superpowers, GSD, OpenSpec | Brainstorming skill; clean context per phase ([mindstudio](https://www.mindstudio.ai/blog/gsd-framework-claude-code-clean-context-phases)); OpenSpec writes about 250 spec lines where Spec Kit writes 800 ([rywalker](https://rywalker.com/research/openspec)) | GSD is token-heavy for mid-size work ([HN](https://news.ycombinator.com/item?id=48231575)); OpenSpec specs are documentation, not verifiable contracts |

## Across tools

| Theme | What the evidence says |
|---|---|
| Opinionated versus extensible | Users keep a short constitution, one task at a time, fresh context per phase, and deny-lists. They rip out a mandatory PRD for every change, automatic subagent spawning and full gates on small fixes. Plain markdown any tool can read is praised ([HN](https://news.ycombinator.com/item?id=48221805)); BMAD's two diverging install tracks are called confusing ([developertoolkit](https://developertoolkit.ai/en/ecosystem/frameworks/spec-driven-frameworks/)) |
| Process size | The top complaint is a mismatch between the process and the change. Right-sizing is praised: Superpowers writes a design doc only for architectural work, and BMAD sizes ceremony to scope |
| Memory | "With 50 rules, each carries a fiftieth" ([dev.to](https://dev.to/johnonlee/how-to-keep-your-claudemd-light-and-why-more-rules-make-agents-worse-34fa)). Stale rule files mislead agents; the fix users report is a date and a one-line why on every rule ([mcp.directory](https://mcp.directory/blog/claude-md-agents-md-maintenance-2026)). Thoughtworks puts spec-driven development in Assess ([radar](https://www.thoughtworks.com/radar/techniques/spec-driven-development)) |
| Multi-agent | What works: a strong model plans and cheaper models implement, one task per isolated session. What fails: recursion, no shared memory between workers, and the orchestrator skipping the gate |
| Enterprise | Auditability, reproducibility, cost chargeback and every prompt for an auditor ([pluralsight](https://www.pluralsight.com/resources/blog/software-development/spec-driven-development-with-AI-SDD), [futureagi](https://futureagi.com/blog/enterprise-controls-cli-coding-agents-gateway-field-guide-2026/)) |

## The 10 pains Codeloop v2 must solve

1. Process sized to the change.
2. Token budget visible and capped per story and run.
3. Spec drift detected, with one living spec.
4. Gates the agent cannot skip, with evidence at each stop.
5. Memory that expires: a date and reason on every entry, with staleness shown.
6. Short always-on context, with deep context on demand.
7. Memory shared between workers and the orchestrator.
8. Recursion and fan-out limits by default.
9. Existing codebases first: learn their conventions and scope work to a feature.
10. An audit trail a team can use: who decided what, and the cost per story.

## Five traps

1. A mandatory PRD or story for everything.
2. Two diverging install tracks, or renamed skills.
3. Advisory-only standards.
4. Telemetry of prompts or specs on by default.
5. Treating the spec as the source, or lock-in to one IDE.
