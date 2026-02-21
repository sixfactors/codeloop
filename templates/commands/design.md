---
description: Architecture before code — generate lightweight spec from codebase analysis
argument-hint: [description]
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, EnterPlanMode
---

<!-- codeloop-version: 0.2.0 -->

# /design

Understand a codebase and generate an architectural spec before planning implementation.

## Usage

```bash
/design                    # Analyze current project, prompt for focus area
/design <description>      # Generate spec for a specific feature or change
```

## Phase 1: Discover

1. Read `.codeloop/config.yaml` for project context (scopes, structure)
2. Scan the project structure — identify key directories, entry points, and config files:
   - Package managers: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`
   - Framework configs: `next.config.*`, `vite.config.*`, `tsconfig.json`, `Dockerfile`
   - Entry points: `src/index.*`, `src/main.*`, `cmd/`, `app/`
3. Identify the tech stack, dependencies, and architectural patterns already in use
4. Read `.codeloop/patterns.md` for established patterns
5. Read `.codeloop/gotchas.md` for known pitfalls

## Phase 2: Analyze

Based on the task description, deep-dive into the relevant parts of the codebase:

1. Map the modules and their boundaries (imports, exports, interfaces)
2. Identify data flow — how data moves through the system
3. Find integration points — where the new work connects to existing code
4. Check for existing abstractions that should be reused vs. new ones needed
5. Note any constraints (framework conventions, dependency versions, API contracts)

## Phase 3: Spec

Write the design spec to `tasks/design-<slug>.md`:

```markdown
# Design: <title>

## Goals
- <What this achieves for the user>
- <What this achieves technically>

## Approach
<High-level strategy — 2-3 sentences max>

## Architecture

### Current State
<Brief description of how the relevant parts work today>

### Proposed Changes
<What changes and why>

### Files to Change
| File | Change | Rationale |
|------|--------|-----------|
| `path/to/file.ts` | Add X | Because Y |

### New Files (if any)
| File | Purpose |
|------|---------|
| `path/to/new.ts` | Description |

## Risks
- <Risk 1 — and mitigation>
- <Risk 2 — and mitigation>

## Alternatives Considered
- <Alternative 1 — why rejected>

## Dependencies
- <External libs, APIs, or services needed>

## Open Questions
- <Anything that needs clarification before implementation>
```

## Phase 4: Board Sync

If `.codeloop/board.json` exists:
1. Read the board
2. Create a new task with `status: "planned"` and title matching the design
3. Add steps derived from the "Files to Change" section
4. Write the updated board back

## Rules

- **Don't write code.** This is analysis and specification only.
- **Keep it lightweight.** The spec should fit on one screen — if it's longer, the scope is too big.
- **Flag unknowns.** If you're not sure about something, put it in Open Questions rather than guessing.
- **Reuse patterns.** If `.codeloop/patterns.md` has a relevant pattern, reference it — don't reinvent.
- **One spec per feature.** Don't combine unrelated changes into one design doc.
- **Next step: `/plan`** — after the design is written, run `/plan` to create the implementation plan. `/plan` will read the design spec automatically.
