---
title: New-repo workflow research, eleven tools against Codeloop v2
status: draft
updated: 2026-10-20
---

Scope: a team lead tries Codeloop on a repo. This page compares how eleven tools onboard a repo and run their workflow, then proposes Codeloop's first-run workflow against the v2 architecture page (`architecture/v2-context-layer.md`) and the v1 CLI (`node dist/index.js --help`, trunk 0.5.0). Every tool claim has a source URL that was opened for this page. Items marked **unconfirmed** came from a search summary or a third-party page and were not found on a primary page.

Earlier findings on Spec Kit, Kiro and BMAD live in `competitors/spec-kit.md`, `competitors/kiro.md` and `competitors/bmad.md`; this page does not repeat them except where a column needs them.

## Tools, one at a time

### Serena

| Question | Finding |
|---|---|
| First 15 minutes | `uv tool install -p 3.13 serena-agent`, then `serena init` for the language-server backend ([README](https://github.com/oraios/serena)). Add to Claude Code with `claude mcp add serena -- serena start-mcp-server --context claude-code --project-from-cwd` ([clients](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/030_clients.md)). `serena project create --index` writes `.serena/project.yml`; `project.local.yml` is the gitignored override ([workflow](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/040_workflow.md)). The person decides the context (`claude-code`, `codex`, `ide`, `agent`) and which modes to add ([configuration](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/050_configuration.md)). |
| Workflow model | None. Serena supplies tools (symbol search, edits, shell, memory) and modes such as `planning`, `editing`, `one-shot`; the agent and the person decide the sequence ([workflow](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/040_workflow.md)). |
| Context between sessions | On first activation with no memories, onboarding runs and writes memory files; it seeds a `memory_maintenance` memory describing conventions. Memories are markdown in `.serena/memories/` (global in `~/.serena/memories/global/`), read on demand through `read_memory`, `list_memories`, `write_memory`, `edit_memory`, `delete_memory`; `mem:NAME` links are checked by `serena memories check` ([memories](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/045_memories.md)). Nothing is loaded every turn except the tool list and the initial instructions. The onboarding file names `tech_stack_and_dependencies.md`, `code_style_and_conventions.md`, `task_completion_guidelines.md` are **unconfirmed** (search summary only). |
| Human control | No gates. The client's permission prompts are the only approvals. Read-only project setting refuses Serena's own edits but shell code can still write ([security](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/070_security.md)). |
| Enterprise fit | Runs locally; MCP server, dashboard and project server bind to localhost by default ([security](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/070_security.md)). Anonymous usage reporting at startup, opt out with `SERENA_USAGE_REPORTING=false` ([configuration](https://raw.githubusercontent.com/oraios/serena/main/docs/02-usage/050_configuration.md)). No SSO or audit. Licence: SolidLSP MIT, Serena application GPL-3.0-or-later; combined distributions fall under the GPL ([README](https://github.com/oraios/serena)). |

### GitHub Spec Kit

| Question | Finding |
|---|---|
| First 15 minutes | `uv tool install specify-cli`, `specify init my-project --integration copilot` (38 agent integrations); the README spells commands `/speckit-constitution` while the command reference uses `/speckit.constitution`, and this page follows the reference ([README](https://raw.githubusercontent.com/github/spec-kit/main/README.md)); writes `.specify/` with `memory/`, `scripts/`, `templates/` plus the agent's command folder such as `.claude/commands/`; `specify check` validates the setup ([getting started](https://github.github.io/spec-kit/)). The person decides the agent, then writes the constitution with `/speckit.constitution`. |
| Workflow model | Ten slash commands in order: constitution, specify, clarify (optional), plan, checklist (optional), tasks, analyze (optional), implement, converge, taskstoissues ([command reference](https://github.github.io/spec-kit/reference/agentic-sdd.html)). `/speckit.specify` creates `specs/<nnn>-<short-name>/spec.md` from `spec-template.md`, asks up to 3 clarifying questions, and runs hooks from `.specify/extensions.yml` ([specify.md](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/specify.md)). Roles are implicit; one agent runs every step. |
| Context between sessions | `.specify/memory/constitution.md` plus the per-feature `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `tasks.md`, `checklists/` ([command reference](https://github.github.io/spec-kit/reference/agentic-sdd.html)). Everything is read when a command runs; nothing is injected automatically between commands. |
| Human control | Before `/speckit.implement`, unchecked custom checklist items stop implementation and the agent must ask; `/speckit.converge` appends gaps as new tasks ([command reference](https://github.github.io/spec-kit/reference/agentic-sdd.html)). Clarify answers land in `spec.md` with no attribution; progress is what the agent ticked in `tasks.md` (see `competitors/spec-kit.md`). No audit trail beyond git. |
| Enterprise fit | Files in the repo; the agent's own data terms apply. No server, no SSO, no audit. MIT ([repo](https://github.com/github/spec-kit)). |

### BMAD Method

| Question | Finding |
|---|---|
| First 15 minutes | Stable v6.12: `npx bmad-method install`; v7 alpha: `npx skills add bmad-code-org/BMAD-METHOD --skill '*'`. The installer asks which coding tools and which skills. It writes `_bmad/` (config, `scripts/` run with `uv run`, `custom/`) and `_bmad-output/` for documents and tickets. First commands in the agent chat: "bmad setup", then "bmad status" ([install](https://docs.bmad-method.org/start/install-bmad/)). |
| Workflow model | Five named agents: Analyst `bmad-agent-analyst`, PM `bmad-agent-pm`, Product Owner `bmad-agent-po`, Architect `bmad-agent-architect`, Developer `bmad-agent-dev`, each with menu codes, plus eight core skills ([skills and agents](https://docs.bmad-method.org/reference/skills-and-agents/)). Three planning paths by size: one-session work goes straight to `bmad-agent-po` and build; epic-sized adds spec and stories; project-sized adds PRD, UX and architecture documents ([planning paths](https://docs.bmad-method.org/plan/choose-a-planning-path/)). `bmad-build` runs investigate, plan, implement, review, fix, with a plan file beside the epic's `tickets.toml` and a guideline of about 500 changed lines per session ([build a change](https://docs.bmad-method.org/build/build-a-change/)). |
| Context between sessions | Documents in `_bmad-output/` and initiative folders (`brief-<slug>.md`, `prd-<slug>.md`, `architecture-<slug>.md`, `tickets.toml`, `story-<slug>-plan.md`) ([planning paths](https://docs.bmad-method.org/plan/choose-a-planning-path/), [stories](https://docs.bmad-method.org/plan/break-work-into-stories-and-track-it/)). `bmad-project-context` is recommended for existing codebases ([docs home](https://docs.bmad-method.org/)). Read when a skill runs. |
| Human control | Plan approval before implementation and result review before a PR ([build a change](https://docs.bmad-method.org/build/build-a-change/)). The user or orchestrator marks a ticket `done` by hand; build status and ticket status are separate ([stories](https://docs.bmad-method.org/plan/break-work-into-stories-and-track-it/)). Approval is a lettered chat menu recorded only as a status field, with no approver name (see `competitors/bmad.md`). |
| Enterprise fit | Files in the repo; the agent's terms apply. No server, SSO or audit. MIT; "BMad" is a trademark of BMad Code, LLC ([README](https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/README.md)). |

### AWS Kiro

| Question | Finding |
|---|---|
| First 15 minutes | Desktop IDE or CLI (`curl -fsSL https://cli.kiro.dev/install | bash`, then `kiro .`) ([first project](https://kiro.dev/docs/getting-started/first-project/), [CLI](https://kiro.dev/docs/cli/)). Click "Generate Steering Docs" to write `.kiro/steering/product.md`, `tech.md`, `structure.md`; click "Spec", describe the feature, and approve requirements, design and tasks in turn ([first project](https://kiro.dev/docs/getting-started/first-project/)). The person decides Autopilot or Supervised and signs in with GitHub, Google, Builder ID or an IdP. |
| Workflow model | One three-phase spec per feature in `.kiro/specs/<name>/`: `requirements.md` (or `bugfix.md`), `design.md`, `tasks.md`; tasks run singly or in dependency "waves" ([specs](https://kiro.dev/docs/specs/)). Hooks in `.kiro/hooks/*.json` fire on `PostFileSave`, `PreToolUse`, `Stop` and similar ([hooks](https://kiro.dev/docs/hooks/)). No roles; one agent. |
| Context between sessions | Steering files with inclusion modes `always` (default), `fileMatch`, `manual` (`#name`), `auto`; the three generated files load on every interaction; global steering in `~/.kiro/steering/` can be pushed by MDM ([steering](https://kiro.dev/docs/steering/)). Specs are read when opened. |
| Human control | A Review button between phases lets the person comment on passages and send comments back ([specs](https://kiro.dev/docs/specs/)). Tool approvals: Allow, Always allow, Deny, Always deny; `permissions.yaml`; enterprise `administration` scope rules evaluated deny > ask > allow ([permissions](https://kiro.dev/docs/permissions/)). No named approver on a spec and no link from a commit to a task (see `competitors/kiro.md`). |
| Enterprise fit | Code is processed by AWS; Free and individual content "may be used for service improvement", stored in US East; enterprise content is not used, is stored in the profile's region, and supports customer-managed KMS keys; TLS 1.2+ ([data protection](https://kiro.dev/docs/privacy-and-security/data-protection/)). SAML/SCIM SSO through IAM Identity Center; tiers Free $0, Pro $20, Pro+ $40, Pro Max $100, Power $200 per user per month ([pricing](https://kiro.dev/pricing/)). Proprietary; "Kiro is an AWS application" ([privacy](https://kiro.dev/docs/privacy-and-security/)). No self-hosting. |

### Cursor

| Question | Finding |
|---|---|
| First 15 minutes | Install the editor, open the repo; rules are `.mdc` files in `.cursor/rules` (version-controlled) or an `AGENTS.md`; `/create-rule` in Agent writes one ([rules](https://cursor.com/docs/context/rules)). For cloud agents an account admin connects source control first and the repo gets `.cursor/environment.json` through agent-led setup, a snapshot or a Dockerfile ([cloud agents](https://cursor.com/docs/background-agent)). The person decides privacy mode and the environment definition. |
| Workflow model | None beyond chat. Cloud agents run in isolated VMs, clone the repo, work on a branch, push, and can be started from Desktop, Web, iOS, Slack `@cursor`, GitHub or Bitbucket comments, Linear or the API; a run has a shareable URL ([cloud agents](https://cursor.com/docs/background-agent)). |
| Context between sessions | Rules with four modes: Always, Apply Intelligently, Apply to Specific Files, Apply Manually; User Rules; Team Rules pushed from the dashboard ([rules](https://cursor.com/docs/context/rules)). The Memories feature was removed in 2.1 (Nov 2025): **unconfirmed** from a search summary; observed directly, `cursor.com/docs/context/memories` now serves the Rules page. |
| Human control | Tool approvals in the editor. "Compliance logging" is listed for enterprises ([security](https://cursor.com/security)). No gates on a plan or spec. |
| Enterprise fit | Requests go through Cursor's backend even with your own API keys; privacy mode means no training and zero-data-retention agreements with all model providers; outside privacy mode Cursor may store and train on code ([data use](https://cursor.com/data-use)). Indexing uploads chunks to compute embeddings and keeps embeddings and obfuscated paths, not plaintext: **unconfirmed** (search summary; the privacy docs page returned 404). SOC 2 Type II, ISO 27001, ISO 42001, AIUC-1; SSO and SCIM; no self-hosting mentioned ([security](https://cursor.com/security)). Proprietary. |

### Claude Code

| Question | Finding |
|---|---|
| First 15 minutes | Install, run `claude` in the repo, accept the workspace trust dialog, run `/init` to generate `CLAUDE.md` from the codebase; with `CLAUDE_CODE_NEW_INIT=1` it asks which artifacts to set up (CLAUDE.md, skills, hooks) and proposes before writing ([memory](https://code.claude.com/docs/en/memory)). The person decides permission mode (Auto with a classifier, or Manual) and provider ([security](https://code.claude.com/docs/en/security)). |
| Workflow model | No stages. Subagents in `.claude/agents/*.md` with `name`, `description`, `tools`, `model`, `permissionMode`, `memory`, `hooks`, `isolation: worktree` ([subagents](https://code.claude.com/docs/en/sub-agents)). Skills in `.claude/skills/<name>/SKILL.md`, invoked by description or `/name`, with `disable-model-invocation` for side-effect commands ([skills](https://code.claude.com/docs/en/skills)). Plugins bundle skills, agents, hooks and MCP servers from a marketplace ([plugins](https://code.claude.com/docs/en/plugins)). Who defines them: whoever commits the files; managed settings can force or block plugins. |
| Context between sessions | Every session loads the CLAUDE.md hierarchy (managed policy path, `~/.claude/CLAUDE.md`, `./CLAUDE.md`, `CLAUDE.local.md`), `.claude/rules/*.md` without `paths`, `@imports`, and auto memory (first 200 lines or 25 KB). Rules with `paths` and subdirectory CLAUDE.md files load on demand when a matching file is touched ([memory](https://code.claude.com/docs/en/memory)). |
| Human control | Permission prompts; hooks on `PreToolUse`, `UserPromptSubmit`, `Stop`, `TaskCompleted`, `ConfigChange` and others can block with exit 2; hooks live in user, project, local, managed, plugin, skill and subagent scopes ([hooks](https://code.claude.com/docs/en/hooks)). Managed settings override everything below them ([settings](https://code.claude.com/docs/en/settings)). Audit: OpenTelemetry metrics; cloud sessions log all operations ([security](https://code.claude.com/docs/en/security)). No gate on a plan beyond plan mode. |
| Enterprise fit | Inference through Claude for Teams or Enterprise, the Console, Amazon Bedrock, Google Cloud's Agent Platform, Microsoft Foundry, or Claude Platform on AWS, with an optional LLM gateway and `allowedProviders` lock ([enterprise deployment](https://code.claude.com/docs/en/third-party-integrations)). Commercial terms: no training, 30-day retention, zero data retention per organisation on request; transcripts cached locally under `~/.claude/projects/` for 30 days ([data usage](https://code.claude.com/docs/en/data-usage)). Cloud sessions can run in self-hosted environments ([security](https://code.claude.com/docs/en/security)). Proprietary. |

### Cline memory bank

| Question | Finding |
|---|---|
| First 15 minutes | Install the extension or CLI, bring your own model key ([repo](https://github.com/cline/cline)). Paste the memory-bank instructions into `.clinerules/memory-bank.md`, then say "follow your custom instructions"; the agent creates `memory-bank/` with `projectbrief.md`, `productContext.md`, `activeContext.md`, `systemPatterns.md`, `techContext.md`, `progress.md` ([memory bank](https://docs.cline.bot/prompting/cline-memory-bank)). The person decides what goes in `projectbrief.md`. |
| Workflow model | None. The memory bank is a documentation pattern inside a rules file; the tool does not check that the files were read or updated ([memory bank](https://docs.cline.bot/prompting/cline-memory-bank)). |
| Context between sessions | The instructions say the agent "MUST read ALL memory bank files at the start of EVERY task"; "update memory bank" rewrites them ([memory bank](https://docs.cline.bot/prompting/cline-memory-bank)). Rules in `.clinerules/` or `.cline/rules/`, global in `~/Documents/Cline/Rules`, with per-rule toggles and `paths` frontmatter ([rules](https://docs.cline.bot/features/cline-rules)). |
| Human control | Every edit and command needs approval unless auto-approve is on ([repo](https://github.com/cline/cline)). No gates, no audit. |
| Enterprise fit | Apache 2.0 ([repo](https://github.com/cline/cline)). Enterprise page lists VPC, on-prem and air-gapped deployment, inference through Bedrock, Vertex, Azure or local models, SSO, org dashboards ([enterprise](https://cline.bot/enterprise)). |

### Augment Code

| Question | Finding |
|---|---|
| First 15 minutes | `npm install -g @augmentcode/auggie`, `auggie login`, run `auggie` in the repo; the workspace is indexed automatically ([CLI overview](https://docs.augmentcode.com/cli/overview)). Add `.augmentignore` for anything `.gitignore` misses ([indexing](https://docs.augmentcode.com/cli/setup-auggie/workspace-indexing.md)). The person decides what to exclude from the index. |
| Workflow model | None in the CLI. Cosmos "Experts" are memory-enabled agents organised in teams ([experts memory](https://docs.augmentcode.com/cosmos/experts-memory.md)). |
| Context between sessions | Rules precedence: `--rules`, `CLAUDE.md`, `AGENTS.md`, `.augment-guidelines`, `.augment/rules/`, `~/.augment/rules/`; types `always_apply`, `agent_requested`, `manual` (IDE only) ([rules](https://docs.augmentcode.com/cli/rules.md)). The context engine index is server-side: "Augment stores your code securely and privately to enable our powerful context engine" ([indexing](https://docs.augmentcode.com/cli/setup-auggie/workspace-indexing.md)). Expert memory is markdown in a shared virtual filesystem, one scope per repository ([experts memory](https://docs.augmentcode.com/cosmos/experts-memory.md)). |
| Human control | Tool approvals. Audit logs are marked under development in the admin checklist; SCIM "coming soon" ([admin checklist](https://docs.augmentcode.com/cosmos/guides/admin-checklist.md)). |
| Enterprise fit | SOC 2 Type II, ISO 42001, no training on customer code, customer-managed keys, proof-of-possession API ([security](https://www.augmentcode.com/security)). Standard $20 and Business $100 flat per month; Enterprise adds SSO, OIDC, SCIM, CMEK, multi-region compute, data residency; no self-hosted option listed ([pricing](https://www.augmentcode.com/pricing)). EU-inference-only toggle ([admin checklist](https://docs.augmentcode.com/cosmos/guides/admin-checklist.md)). Proprietary. |

### Factory droids

| Question | Finding |
|---|---|
| First 15 minutes | `curl -fsSL https://app.factory.ai/cli | sh` (or `brew install --cask droid`, `npm install -g droid`), run `droid`, sign in; first task follows propose, show diff, wait for approval ([quickstart](https://docs.factory.com/droid-cli/quickstart.md)). Droid reads `AGENTS.md` (also `.factory/AGENTS.md`, `CLAUDE.md`) with an initial budget of about 80,000 characters ([AGENTS.md](https://docs.factory.com/cli/configuration/agents-md)). The person decides the autonomy level. |
| Workflow model | Modes Normal, Spec, Mission. Spec mode investigates, proposes a plan, waits for approval and can save it to `.factory/docs/YYYY-MM-DD-slug.md`; Mission mode runs an orchestrator with worker agents ([interaction modes](https://docs.factory.com/autonomy-and-safety/specification-mode.md)). Custom droids in `.factory/droids/*.md` with `name`, `description`, `model`, `tools`, `mcpServers` ([custom droids](https://docs.factory.com/harness/subagents.md)). Hooks in `.factory/hooks.json` with exit-2 blocking ([hooks](https://docs.factory.com/harness/hooks.md)). |
| Context between sessions | `AGENTS.md` every session; skills and droids on demand ([AGENTS.md](https://docs.factory.com/cli/configuration/agents-md)). No memory feature found. |
| Human control | Autonomy Off, Low, Medium, High; org controls override user autonomy ([interaction modes](https://docs.factory.com/autonomy-and-safety/specification-mode.md), [identity](https://docs.factory.com/enterprise/identity-and-access.md)). OpenTelemetry metrics and an analytics API for audit workflows ([enterprise](https://docs.factory.com/enterprise/index.md)). |
| Enterprise fit | Cloud, hybrid or air-gapped deployment; SOC 2 Type II, ISO 27001, ISO 42001 ([enterprise](https://docs.factory.com/enterprise/index.md)). SSO for Okta, Entra, Google, OneLogin, Ping, JumpCloud, SAML, OIDC; SCIM; roles Owner, Manager, User; service accounts ([identity](https://docs.factory.com/enterprise/identity-and-access.md)). Proprietary. |

### Amp

| Question | Finding |
|---|---|
| First 15 minutes | `curl -fsSL https://ampcode.com/install.sh | bash`, `amp login` ([CLI](https://ampcode.com/docs/cli)). Amp offers to generate `AGENTS.md` when none exists; it reads `AGENTS.md` from the cwd up to `$HOME`, `$HOME/.config/amp/AGENTS.md`, and system paths such as `/etc/ampcode/AGENTS.md`, with `@path` includes ([AGENTS.md](https://ampcode.com/docs/customize/agents-md)). The person decides workspace membership and thread visibility. |
| Workflow model | None; threads of chat. A workspace holds members, threads, projects and one bill, and workspace-level plugins, skills, agents and MCP servers apply to every member ([workspaces](https://ampcode.com/docs/collaborate/workspaces)). |
| Context between sessions | `AGENTS.md` every thread; threads are saved and searchable by the workspace by default ([workspaces](https://ampcode.com/docs/collaborate/workspaces)). |
| Human control | Permission controls exist (`amp permissions`) ([manual](https://ampcode.com/manual)). Admins can force private-by-default threads and disable sharing outside the workspace ([thread visibility](https://ampcode.com/docs/enterprise/workspace-thread-visibility-controls)). Audit logging for Enterprise admins ([security](https://ampcode.com/security)). |
| Enterprise fit | Threads, user data and telemetry live in a multi-tenant Google Cloud project; Amp does not index the whole codebase; SOC 2 Type II; SSO; training can never be enabled on an Enterprise workspace ([security](https://ampcode.com/security)). SAML or OIDC SSO, SCIM on Enterprise, pooled credits ([workspaces](https://ampcode.com/docs/collaborate/workspaces)). Minimal data retention with model providers; no training ([MDR](https://ampcode.com/docs/enterprise/minimal-data-retention)). Independent of Sourcegraph since 2 December 2025 ([announcement](https://ampcode.com/news/amp-inc)). Proprietary; no self-hosting found. |

### Devin

| Question | Finding |
|---|---|
| First 15 minutes | Connect the repo in the web app; ask "Set up your environment for this repo" and Devin proposes a blueprint and builds a snapshot (clone, dependencies, lint, tests), or write YAML blueprints ([repo setup](https://docs.devin.ai/onboard-devin/repo-setup)). Knowledge is generated from READMEs and repo contents ([knowledge onboarding](https://docs.devin.ai/onboard-devin/knowledge-onboarding.md)); DeepWiki is generated when repos are connected ([DeepWiki](https://docs.devin.ai/work-with-devin/deepwiki)). The person decides secrets and the blueprint. |
| Workflow model | Sessions with Playbooks, reusable prompts with Procedure, Specifications, Advice, Forbidden Actions, invoked by `!macro` ([playbooks](https://docs.devin.ai/product-guides/creating-playbooks)). No stages or gates. |
| Context between sessions | Knowledge entries pinned to a repo or retrieved by trigger description, "when relevant, not all at once" ([knowledge](https://docs.devin.ai/product-guides/knowledge)); Knowledge is deprecated in favour of Skills in Plugins ([knowledge onboarding](https://docs.devin.ai/onboard-devin/knowledge-onboarding.md)). DeepWiki steered by `.devin/wiki.json` ([DeepWiki](https://docs.devin.ai/work-with-devin/deepwiki)). |
| Human control | PR review by people. SSO through Okta, Entra ID, SAML 2.0, OIDC ([deployment](https://docs.devin.ai/enterprise/deployment/overview)). Audit logs: **unconfirmed**; the docs index has no audit-log page. |
| Enterprise fit | The "Brain" always runs in Cognition's cloud; the Devbox runs in Cognition's multi-tenant cloud or a single-tenant VPC reached by PrivateLink or IPSec ([deployment](https://docs.devin.ai/enterprise/deployment/overview)). SOC 2 Type II since September 2024; paid plans train on data by default with opt-out, Enterprise never without written consent ([security](https://docs.devin.ai/admin/security.md)). Free, Pro $20, Max $200, Teams $80 per month minimum with up to 200 members ([billing](https://docs.devin.ai/admin/billing/self-serve.md)). Proprietary; no customer-run deployment. |

### Tessl

| Question | Finding |
|---|---|
| First 15 minutes | `curl -fsSL https://get.tessl.io | sh`, `tessl login` ([installation](https://docs.tessl.io/introduction-to-tessl/set-up-tessl/installation.md)), `tessl init` in the repo, MCP server `tessl mcp start`, and an `AGENTS.md` line referencing `@.tessl/RULES.md`; Cursor, Claude, Gemini, Copilot and Codex are auto-detected ([custom agent setup](https://docs.tessl.io/reference/custom-agent-setup.md)). `tessl search`, `tessl install <workspace>/<skill>` record into `tessl.json` ([package manager](https://docs.tessl.io/tutorials/using-tessl-as-a-package-manager.md)). |
| Workflow model | None. Tessl manages skills (procedural) and rules (always applied), a registry, evals, and org-level Context and Findings from SCM scans ([core concepts](https://docs.tessl.io/introduction-to-tessl/core-concepts.md), [skill estate](https://docs.tessl.io/use/understand-your-skill-estate.md)). |
| Context between sessions | Installed skills and `.tessl/RULES.md` in the repo; the registry holds versions ([custom agent setup](https://docs.tessl.io/reference/custom-agent-setup.md)). |
| Human control | Workspace roles Consumer, Member, Publisher, Manager, Owner; publishing needs Publisher or above ([roles](https://docs.tessl.io/administrators/roles.md)). |
| Enterprise fit | Free 1,000 credits, Team $100 per month, Enterprise with SAML SSO, audit logs, install and publish policies, BYO LLM, single-tenant self-hosted ([pricing](https://tessl.io/pricing)). Proprietary. |

### Dropped or narrowed

| Tool | Decision | Why |
|---|---|---|
| Tessl | Kept, short | It distributes and governs skills; it has no board, stages or gates. It matters as the model for v2 packs and skill versioning, and as a possible channel, so it stays in the table but not in the trial moments. |
| Cline memory bank | Kept, short | It is a prompt pattern, so it has no onboarding commands or enforcement. It stays because it is the clearest statement of "read everything every session", which is the approach Codeloop should avoid. |
| Cursor Memories | Dropped | Removed in 2.1 per a search summary (**unconfirmed**); the docs URL now serves the Rules page. Rules are covered. |
| Devin Knowledge | Narrowed | Marked deprecated in favour of Skills in Plugins on the onboarding page; cited for the pin and trigger model only. |

## Comparison table

### Onboarding, workflow and context

| Tool | Install to first useful action | Files written in the repo | Workflow stages and roles | Loaded every session | Loaded on demand |
|---|---|---|---|---|---|
| Serena | 3 commands, then onboarding runs on first activation | `.serena/project.yml`, `.serena/memories/*.md` | None; modes only | Tool list, initial instructions | Memories via tools |
| Spec Kit | 2 commands, then `/speckit.constitution` | `.specify/{memory,scripts,templates}`, agent commands, `specs/<nnn>/` | 10 commands in order; one agent | Nothing automatic | Constitution, spec, plan, tasks when a command runs |
| BMAD | 1 install, 2 chat commands | `_bmad/`, `_bmad-output/`, tickets.toml, plan files | 5 named agents, 3 planning paths, build loop | Nothing automatic | Documents when a skill runs |
| Kiro | Open folder, click Generate Steering, click Spec | `.kiro/steering/*.md`, `.kiro/specs/<name>/{requirements,design,tasks}.md`, `.kiro/hooks/*.json` | 3 phases per spec; one agent | Steering with `always` | Steering `fileMatch`, `manual`, `auto`; specs |
| Cursor | Open repo; admin connects SCM for cloud agents | `.cursor/rules/*.mdc`, `AGENTS.md`, `.cursor/environment.json` | None | Always rules | File-matched, agent-requested, manual rules |
| Claude Code | `claude`, trust, `/init` | `CLAUDE.md`, `.claude/{rules,skills,agents,settings.json}` | None; subagents, skills, hooks, plugins | CLAUDE.md hierarchy, unscoped rules, auto memory | Path rules, subdir CLAUDE.md, skills, subagents |
| Cline | Install, paste rules, "follow your custom instructions" | `.clinerules/`, `memory-bank/*.md` | None | All six memory files, every task | Nothing |
| Augment | 3 commands; index builds server-side | `.augment/rules/`, `.augmentignore` | None (Experts in Cosmos) | `always_apply` rules | `agent_requested` rules; server index |
| Factory | 2 commands, sign in | `AGENTS.md`, `.factory/{droids,hooks.json,docs}` | Normal, Spec, Mission; custom droids; autonomy levels | `AGENTS.md` | Droids, skills, saved specs |
| Amp | 2 commands, sign in | `AGENTS.md` | None; workspace threads | `AGENTS.md` hierarchy | Threads, skills |
| Devin | Connect repo in web app, blueprint, snapshot | `.devin/wiki.json`, YAML blueprints (optional) | Sessions and Playbooks | Pinned Knowledge | Triggered Knowledge, DeepWiki |
| Tessl | 2 commands, `tessl init`, install skills | `tessl.json`, `.tessl/RULES.md`, skills in agent folders | None | `RULES.md` | Skills |
| Codeloop v1 (0.5.0) | `npm i -g`, `codeloop init --tools claude`, `codeloop serve --open` | `.codeloop/` (ten lanes, config, wiki, board store), `.claude/commands/` (10), `.claude/skills/` (15), `specs/`, `usecases/`, `evidence/` | Lanes of stages with skill, output, check, gate; owner, reviewer, agent roles | `guard session` prints the active story and brief | `codeloop brief`: skill, check, feedback, wiki pages matched by file scope, rules |

Sources for the Codeloop row: `~/Projects/codeloop/README.md` and `node dist/index.js --help` at trunk 0.5.0 on 2026-10-20 (repository `github.com/sixfactors/codeloop` per `package.json`; not opened on the web).

### Control and enterprise

| Tool | Gates on plan or spec | Who approved, and where it is recorded | Code and data location | Self-host | SSO | Licence |
|---|---|---|---|---|---|---|
| Serena | None | n/a | Local; localhost services; anonymous usage ping (opt-out) | Yes (it is local) | No | MIT + GPL-3.0-or-later |
| Spec Kit | Checklist checkboxes before implement | Not recorded | Repo files; the agent's terms | n/a | No | MIT |
| BMAD | Plan approval, result review | Status field only, no name | Repo files; the agent's terms | n/a | No | MIT |
| Kiro | Review button per phase | Not named | AWS; individuals' content may improve the service; enterprise opted out, regional, CMK | No | SAML/SCIM via IAM Identity Center | Proprietary |
| Cursor | None | Compliance logging (enterprise) | Cursor backend; ZDR with providers in privacy mode | No | SSO, SCIM | Proprietary |
| Claude Code | Plan mode, hooks exit 2 | Hooks can log; OpenTelemetry; cloud sessions logged | Anthropic, Bedrock, Agent Platform, Foundry; ZDR on request; self-hosted cloud environments | Inference via your cloud; local CLI | Teams/Enterprise SSO | Proprietary |
| Cline | None | n/a | Local extension; your provider | VPC, on-prem, air-gapped (enterprise page) | Enterprise | Apache 2.0 |
| Augment | None | Audit logs under development | Server-side index; CMEK; EU inference | No | SSO, OIDC, SCIM (enterprise) | Proprietary |
| Factory | Spec mode approval | OpenTelemetry, analytics API | Cloud, hybrid or air-gapped | Air-gapped | Many IdPs, SAML, OIDC, SCIM | Proprietary |
| Amp | None | Enterprise audit logging | Threads on multi-tenant GCP; snippets only | No | SAML/OIDC, SCIM | Proprietary |
| Devin | None | Unconfirmed | Brain in Cognition cloud; Devbox multi-tenant or single-tenant VPC | VPC only (Cognition-hosted) | Okta, Entra, SAML, OIDC | Proprietary |
| Tessl | None | Audit logs (enterprise) | Registry cloud; single-tenant self-hosted on enterprise | Enterprise | SAML (enterprise) | Proprietary |
| Codeloop v1 | spec (owner), local (owner), pr (reviewer), prod outward | Event on the card with role and time; `card activity`; agent processes are refused approve | Repo files and a localhost board; optional Protobox cloud copy (`codeloop cloud`) | Yes (local hub) | None; board login is a shared token | MIT |

## What a CIO trial must show in 30 minutes

| # | Moment | What the person sees | Which competitor sets the bar |
|---|---|---|---|
| 1 | Install to board in under five minutes, with the repo diff open beside it | `git status` lists `.codeloop/`, `.claude/commands/`, `.claude/skills/`; nothing else in the repo changed; the board is on localhost | Spec Kit and BMAD also write only repo files, so this is table stakes. Devin, Augment and Cursor cloud agents need an account and an admin before a repo is usable, which is the contrast to show. |
| 2 | The repo explains itself without a prompt | `codeloop wiki init` seeds pages from the repo's own files, `codeloop wiki build` starts an "Explain the architecture" card, and facts (ports, test command, CLI version) appear from probes (facts are v2) | Kiro's "Generate Steering Docs" writes three files in one click; Claude Code `/init` writes one; Serena's onboarding writes memories; Devin's DeepWiki is generated on connect. Codeloop has to match one click and then show what none of them do: the page carries a verified-at sha and a served count. |
| 3 | A story stops at a gate the agent cannot pass | `codeloop orch run c-001` ends with "waiting for you at spec"; the Inbox shows it; Approve on the board; `card activity` shows the rejection note, the approval, the role and the time | Spec Kit's gate is an unchecked checkbox the agent reads; BMAD records approval as a status with no name; Kiro has a Review button with no named approver. Codeloop's event with role and time is the differentiator and must be on screen. |
| 4 | A question is answered from a prior decision instead of asked again (v2) | `codeloop ask` returns "decided on 10-16 in chat" with the source link; Today, Decide shows no new question | Nobody does this. Serena memories and Cline's memory bank are the nearest, and both depend on the model choosing to read the file. Show the decision record with source and scope. |
| 5 | A commit moves the story | A commit with `Card: c-001` appears in the story's activity; `codeloop card handback` records the proof command and exit code; `stories.where` explains the derived stage (v2) | Spec Kit ticks `[X]` in tasks.md; Kiro marks tasks Done inside the editor; BMAD leaves `built` until a person writes `done`. None link a commit or a merge to a story. |
| 6 | The brief shows exactly what the agent was given | `codeloop brief c-001` prints the skill, the check command, the feedback, the wiki pages matched to the files, and the rules | Claude Code `.claude/rules` with `paths`, Kiro `fileMatch`, Cursor file-matched rules and Augment `agent_requested` do the same selection, but none print the served list or count citations. Show the list and the counts on the Knowledge page (counts are v2). |
| 7 | Nothing leaves the laptop | Board on 127.0.0.1, no account, `codeloop cloud status` says not connected, MIT in the repo | Cursor routes requests through its backend even with your keys; Amp keeps threads on GCP; Augment indexes server-side; Devin's Brain is always in Cognition's cloud. Serena and Spec Kit are the only peers here. |
| 8 | Any agent vendor | `codeloop render --host all` writes the same lane stages for Claude, Cursor and Codex; `agents:` in `config.yaml` lists `claude`, `claude-sonnet`, `cursor` | Spec Kit supports 38 integrations and Tessl auto-detects five, so vendor neutrality is expected; Kiro, Cursor, Amp and Devin each tie the workflow to their own agent. |

## Copy, avoid, beat

| From | Copy | Avoid | Beat |
|---|---|---|---|
| Serena | One command adds the server to Claude Code; onboarding runs itself on first activation and seeds a conventions page (`memory_maintenance`); `serena memories check` finds broken links, which `codeloop wiki lint` already does | The GPL on the application, which blocks bundling | Serena's memories are read only when the model asks. Codeloop serves pages by file scope and records served and cited counts, so stale pages are visible. |
| Spec Kit | The ten-command vocabulary with a constitution first; `specify check`; `.specify/extensions.yml` hooks per command; 38 agent integrations as the neutrality bar | Gates as checkboxes the agent reads; answers with no attribution | A gate is a role check the engine enforces and an event with a name and time. |
| BMAD | Three planning paths by size, which matches `when: size >= M`; the 500-line session guideline; named agents with menus a person can read | Status written by hand after a build; approvals recorded as a status value; `uv run` scripts the person did not ask for | The stage is derived from documents, gate decisions, hand-backs and commits, so "built but shows research" cannot happen. |
| Kiro | Generate Steering Docs as one click producing product, tech and structure pages; `fileMatch`, `manual`, `auto` inclusion modes; MDM-pushed global steering; `administration` scope rules with deny > ask > allow | Spec progress that lives only in the editor; individual-tier content used to improve the service | Steering files have no verified-at. Codeloop marks a page "needs check" when its scope files change after its sha. |
| Cursor | Team Rules pushed from a dashboard; cloud agent runs with a shareable URL and a branch pushed for hand-off | Routing through a vendor backend; a memory feature that was removed and whose docs URL now shows something else | Codeloop's hand-back carries the commit range, proof command and exit code, so the story page shows what was run and whether it passed. |
| Claude Code | `/init` that proposes before writing (`CLAUDE_CODE_NEW_INIT`); `.claude/rules` with `paths`; subagent frontmatter (`tools`, `model`, `permissionMode`, `isolation: worktree`) as the shape for v2 agent templates; hooks with exit 2 at every scope, which `codeloop guard` already uses; managed settings as the model for owner-only verbs | Auto memory that loads 25 KB every session regardless of task | Templates are versioned, forked and pinned per stage start, with a `diff`; Claude's agents are files with no version. |
| Cline memory bank | The six-file split (brief, product, active, patterns, tech, progress) as a seed layout for `wiki init` | "Read ALL files at the start of EVERY task"; the model is the only enforcement | A brief assembled from pinned pages, decisions in scope, gotchas by file and the stage check. |
| Augment | `.augmentignore`; a precedence list that reads `CLAUDE.md` and `AGENTS.md` before its own rules, so a repo with either needs no extra file | A server-side index as the entry price; audit logs still under development | Codeloop reads the repo in place; no index leaves the machine. |
| Factory | Autonomy levels Off, Low, Medium, High with org controls above them; Spec mode saving `.factory/docs/YYYY-MM-DD-slug.md`; roles Owner, Manager, User; service accounts for CI | n/a | Codeloop's delegation lists allowed verbs and an expiry (v2), finer than four levels. |
| Amp | AGENTS.md read from cwd up to `$HOME` plus system paths for organisation guidance; "offer to generate AGENTS.md when none exists"; threads visible to the workspace by default with admin override | Threads stored on a vendor cloud as the only record | Codeloop's record is files in the repo plus a local board; the cloud copy is optional. |
| Devin | "Set up your environment for this repo" producing a reproducible snapshot; Playbook sections (Procedure, Specifications, Advice, Forbidden Actions); trigger descriptions on knowledge | Training on paid-plan data by default; a Brain that always runs in the vendor cloud | Facts from probes replace guessed environment state and are never written by an agent. |
| Tessl | A registry with versions, `tessl outdated`, `tessl update`; workspace roles that separate install from publish; scenario evals with and without the context | n/a | v2 packs install templates, skills and workflows together, and a template's served pages are measured in use. |

## Proposed first-run workflow on a new repo

Everything below is marked **v1** (works in the 0.5.0 trunk today, checked against `--help`) or **v2** (on the v2 page only). Two trial risks first, because they decide whether the person reaches step 1: the npm package is 0.4.3 while the trunk is 0.5.0 (`README.md`, "What is unreleased"), so `npm install -g` gives an older CLI than this page describes; and `docs/trial/trial-guide.md` is pinned to a 0.3.0 tarball. Publish 0.5.0 or ship a tarball with the guide updated before any CIO trial.

### Step 0, install (v1)

```sh
npm install -g @protoboxai/codeloop   # or the 0.5.0 tarball
cd new-repo && git init               # a git repository is required
codeloop init --tools claude          # scaffold, commands, skills, hooks
codeloop init --ci github             # separate run: --ci writes only the CI workflow and exits
```

`--ci` and `--hooks` are exclusive modes: with `--ci` the command writes the workflow and returns before scaffolding (`src/commands/init.ts:72-80`), so the scaffold needs its own run. Plain `init` installs the hooks itself (`src/commands/init.ts:168`). Files created: `.codeloop/config.yaml`, `.codeloop/lanes/*.yaml` (ten lanes), `.codeloop/wiki/`, `.codeloop/board.json` and `cards.json`, `.codeloop/skills.index.yaml`; `.claude/commands/` (ten) and `.claude/skills/<name>/SKILL.md` (fifteen); the commit-msg trailer hook and the pre-commit and pre-push guards; then a GitHub workflow for `codeloop gate` from the second run. `scripts.lint` and `scripts.build` from `package.json` become `quality_checks` (`docs/trial/trial-guide.md`). Decisions: tools (`claude,cursor,codex`), starter (`generic`, `node-typescript`, `python`, `go`), and whether to let `init` write into an existing `.claude/commands/` (`--yes`).

### Step 1, let the repo explain itself (v1, facts v2)

```sh
codeloop wiki init          # seed pages from the repo's own files
codeloop wiki build         # refresh reference/ and repo-facts.json, run "Explain the architecture" in the wiki lane
codeloop adopt --gaps       # index existing skills and commands; list stages with no mechanical check
```

v1 produces `.codeloop/wiki/reference/`, `repo-facts.json` and an architecture page. v2 adds **facts** (ports, running services, CLI version, board location, migration heads) refreshed by probes and served as `codeloop://fact/{key}`, and gives each wiki page a `verified at` sha, a state, and served and cited counts. Decision: confirm the test command in `.codeloop/lanes/build.yaml` (`npm test` by default) and the trunk in `config.yaml` (`git.trunk: main`).

### Step 2, open the board and set who approves (v1; delegation v2)

```sh
codeloop serve --open       # http://localhost:4040/p/<project>/
```

Default sign-in is `owner` / `codeloop`; change it before anyone else sees the board (`README.md`, "Run it"). Roles today are owner, reviewer and agent, chosen with `--as` outside a terminal; an agent process is refused at `approve`. v2 adds **delegation** (owner to an orchestrator: allowed verbs and expiry) and the Settings place that lists them. Decision: who is owner and who is reviewer for the `pr` gate.

### Step 3, agent templates (v1 presets; templates v2)

v1: `agents:` in `.codeloop/config.yaml` holds presets (`claude`, `claude-sonnet`, `cursor`) with a command, a timeout and a daily run cap; `codeloop render --host all` writes each lane stage as an agent, rule or skill for Claude, Cursor and Codex and, with `--hooks`, installs the hooks.

v2 default pack, one built-in plus team forks (open question 3 on the v2 page):

| Template | Kind | Owned paths | Pinned pages | Proof rules | Question policy |
|---|---|---|---|---|---|
| orchestrator | orchestrator | none | start-here, decisions index, shared-tree rules | none | asks the owner only after `questions.ask` finds no decision |
| builder | worker | the story's plan files | shared-tree rules, build-and-test-without-breaking-the-live-CLI, gotchas by scope | `npm test` exit 0, hand-back with commit range | may ask up to 5 with a recommended answer |
| reviewer | worker | none, read-only | review rubric, repeat-mistake gotchas | `verdict: approve` in review.md | none |

Templates are versioned and forkable in Agents, Templates; the version is pinned at each stage start (open question 2).

### Step 4, the default workflow (v1 lane; versioned workflow v2)

The build lane as shipped (`templates/lanes/build.yaml`):

| Stage | Runs for | Skill | Output | Check | Gate |
|---|---|---|---|---|---|
| research | size ≥ M | research | `{spec}/research.md` | 3 sources, verdict, wiki landed, rubric | |
| interview | size ≥ M | interview | `{spec}/interview.md` | 3 questions answered | |
| mock | size ≥ M | mock | mock file or `screens: none` | mock check | |
| spec | size ≥ M | spec | `{spec}/tasks.md` | `spec check`, rubric | spec, owner |
| data-model | size ≥ M | system-design | `{spec}/data-model.md` | passes with no `[data]` tasks | |
| build | all | api, sdk, ui | code | all tasks done, `npm test`, rubric | |
| verify | all | verify | `{evidence}/verify.md` | `codeloop verify`, rubric | local, owner |
| review | size ≥ M | review | `{evidence}/review.md` | `verdict: approve`, scope, wiki landed | pr, reviewer |
| staging, live | all | release | | | prod, outward |

A trivial or S story enters at build and the skipped stages are recorded with the reason. v2 renames lane to **workflow** (the CLI keeps `lane`), versions it, and gives each stage a template, skill, check, gate, check time limit, and the documents it needs and produces; the stage a story is in is computed by one function from its documents, gate decisions, hand-backs and commits.

### Step 5, the first story end to end (v1, with v2 additions marked)

```sh
codeloop start "Download every invoice as one CSV" \
  --persona dev --can "download every invoice as one CSV" --so "I stop exporting by hand" --size S
codeloop brief c-001                 # what the builder will be given
codeloop orch run c-001              # builder in the main tree under a file lease; gates the hand-back
codeloop inbox                       # "c-001 is waiting for you at verify (gate local, owner approves)"
codeloop approve c-001               # or: codeloop reject c-001 "<what to change>"
codeloop card activity c-001         # edits, commands, checks, commits, gates, with role and time
```

What happens, in order: `start` creates `specs/001-download-every-invoice-as-one-csv/`; size S skips research, interview, mock, spec and data-model with a recorded reason; `orch run` briefs a builder with the api skill, the build check and the wiki pages matching the planned files; the builder commits with `Card: c-001` (the commit-msg hook adds it; `guard commit` records the commit on the card); the hand-back runs `npm test` and records the exit code (`card handback`); `card gate` reruns the proof and the stage check; the story waits at `local`; the owner approves on the board or in the terminal and the engine refuses the same call from an agent process; for an S story the `pr` gate is asked here and the story moves to staging, where `live` and `prod` are outward gates that stop before the stage runs.

v2 additions on this path, in the day-one order the v2 page gives: `decisions.record` on the approval with source and scope, and `questions.ask` returning a prior decision before reaching the owner; `stories.handback` claiming untagged commits and `stories.where` explaining the derived stage; `monitor.flags` ("code ahead of stage", "check killed by time limit") with a suggested command on Today, Decide; `sessions.who` on Agents, Live showing instance, template, story, stage, idle minutes and host.

### What the person decides, in total

| Decision | When | Default |
|---|---|---|
| Agent tools and starter | `init` | prompt; `generic` |
| Test and build commands | after `init` | `npm test`; `scripts.lint`, `scripts.build` |
| Trunk branch | after `init` | `main` |
| Board password and who is owner and reviewer | `serve` | `owner` / `codeloop`; terminal user is owner |
| First story size | `start` | none; S is the right first choice |
| Each gate: spec, local, pr, prod | when the inbox says so | none; approve or reject with a note |
| Delegation to the orchestrator (v2) | Settings | none |
| Template and workflow forks (v2) | Agents | the built-in pack |

### What each layer reads

| Read every time | Read on demand | Never read by an agent |
|---|---|---|
| `guard session`: the active story and its brief (v1); the template's pinned pages (v2) | wiki pages matched by `wiki inject` to the files in the plan (v1); decisions in scope, gotchas by file, the stage check, named facts (v2) | the board store, `cards.json`, event history, facts (written only by probes) |

## Sources

Every URL above was opened on 2026-10-20. Pages that returned 404 or a sign-in wall and were therefore not used: `oraios.github.io/serena/01-about/010_overview.html`, `docs.bmad-method.org/explanation/the-bmad-method/`, `cursor.com/docs/account/privacy`, `cursor.com/docs/enterprise/privacy-and-data-governance.md`, `ampcode.com/manual/*` sub-paths, `ampcode.com/docs/enterprise`, `docs.devin.ai/enterprise/deployment/vpc`, `devin.ai/pricing`, `cognition.com/pricing`, `docs.augmentcode.com/setup-augment/rules`, `tessl.io` loops pages. Codeloop facts are from `~/Projects/codeloop/README.md`, `templates/lanes/build.yaml`, `docs/trial/trial-guide.md`, `.codeloop/wiki/architecture/v2-context-layer.md` and `node dist/index.js <cmd> --help` at trunk 0.5.0.
