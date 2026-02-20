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
   - Find the matching task on the board (by title match or first `in_progress`/`planned` task)
   - Update the corresponding step's `done` field to `true`
   - If this is the first step being marked done, set task status to `in_progress`
   - If all steps are now complete, set task status to `review`
   - Write the updated board back to `.codeloop/board.json`
4. If all steps complete, show completion summary

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
