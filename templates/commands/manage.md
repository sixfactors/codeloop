---
description: Track task progress — read/update tasks/todo.md
allowed-tools: Read, Write, Edit, Glob, Grep
---

<!-- codeloop-version: 0.2.0 -->

# /manage

Track progress on the current task. Read and update `tasks/todo.md`.

## Usage

```bash
/manage              # Show current task status
/manage done <n>     # Mark step N as complete
/manage add <step>   # Add a new step
/manage close        # Mark task as done (moves to Done column)
/manage summary      # Generate progress summary
```

## How It Works

### Show Status (default)

1. Read `tasks/todo.md`
2. Show:
   - Task title and context
   - Checklist with completion status
   - Next uncompleted step highlighted

### Mark Complete (`done <n>`)

1. Read `tasks/todo.md`
2. Change step N from `- [ ]` to `- [x]`
3. **Board sync** — if `.codeloop/board.json` exists:
   - Read the board JSON
   - Find the matching task: search by exact title from `tasks/todo.md`'s `# Task:` heading. If no exact match, use the first task with status `planned`, `in_progress`, or `backlog` (in that priority order)
   - If no task found, warn: "Board sync skipped — no matching task found in board.json"
   - Update the corresponding step's `done` field to `true`
   - Update task status based on progress:
     - First step marked done → set status to `in_progress`
     - All steps marked done → set status to `review`
   - Write the updated board back to `.codeloop/board.json`
4. If all steps complete, show completion summary

### Close Task (`close`)

1. Read `tasks/todo.md` — verify all steps are `- [x]` (complete)
2. If steps remain incomplete, warn: "N steps still unchecked — close anyway?" (use AskUserQuestion)
3. **Board sync** — if `.codeloop/board.json` exists:
   - Find the matching task (same lookup as `done <n>`)
   - Set task status to `done`
   - Write the updated board back to `.codeloop/board.json`
4. Archive: rename `tasks/todo.md` to `tasks/done/<title-slug>.md` (create dir if needed)
5. Show: "Task closed. Board updated."

### Add Step (`add <step>`)

1. Read `tasks/todo.md`
2. Append new step to the plan
3. Show updated checklist

### Summary (`summary`)

Generate a concise summary of:
- What's done
- What's remaining
- Any blockers or gotchas encountered
- Time/effort estimate for remaining work

## Rules

- **tasks/todo.md is the source of truth.** All task state lives here.
- **Update as you go.** Don't wait until the end to mark things complete.
- **Be honest about blockers.** If stuck, say so in the summary.
- **Verify before marking done.** Each step should have evidence of completion.
