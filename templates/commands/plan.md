---
description: Plan a task — write spec to tasks/todo.md, enter plan mode
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, EnterPlanMode
---

<!-- codeloop-version: 0.1.0 -->

# /plan

Plan before building. Write specs to `tasks/todo.md`, get approval, then execute.

## Usage

```bash
/plan                    # Start planning (enter plan mode)
/plan <description>      # Plan a specific task
```

## Phase 1: Understand

1. Read the task description (from argument or ask the user)
2. Read `.codeloop/config.yaml` for project context (scopes, conventions)
3. Read `.codeloop/gotchas.md` — scan for relevant gotchas that could affect the plan
4. Read `.codeloop/patterns.md` — check for established patterns to follow

## Phase 2: Plan

Enter plan mode and explore the codebase:

1. Identify affected files and modules
2. Check for existing patterns that should be followed
3. Consider gotchas that apply to the planned changes
4. Write the plan to `tasks/todo.md`:

```markdown
# Task: <title>

## Context
<Why this task exists, what problem it solves>

## Plan
- [ ] Step 1: <specific, actionable step>
- [ ] Step 2: <specific, actionable step>
- [ ] ...

## Gotchas to Watch
- <relevant gotchas from .codeloop/gotchas.md>

## Files to Change
- `path/to/file.ts` — <what changes>
```

5. Exit plan mode for user approval

## Phase 3: Execute

After approval, work through the plan:

1. Mark each step as you complete it (update `tasks/todo.md`)
2. If the plan needs adjustment, update it and explain why
3. Verify each step works before moving to the next

## Rules

- **3+ steps = always plan first.** Don't wing it.
- **Stop and re-plan if things go sideways.** The plan is a living document.
- **Staff engineer bar.** Before marking complete: "Would a staff engineer approve this?"
- **Gotchas are warnings.** Check `.codeloop/gotchas.md` before each risky step.
