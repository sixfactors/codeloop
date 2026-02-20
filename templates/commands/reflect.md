---
description: Session-end reflection — capture what you learned
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, Bash
---

<!-- codeloop-version: 0.1.0 -->

# /reflect

Pause and think about what happened this session. Propose changes — but **nothing gets written without approval**.

> **Tip:** For lightweight inline reflection during commits, `/commit` Phase 2 handles it automatically. Use standalone `/reflect` for deeper multi-commit session reviews.

## Phase 1: Think

Look back at the session and identify:

1. **Gotchas** — Unexpected behavior, hidden dependencies, undocumented quirks
2. **Better approaches** — Wrong turns, wasted time, things you'd do differently
3. **Patterns** — Approaches that worked well, shortcuts discovered
4. **Frequency updates** — Gotchas re-encountered this session (increment freq)

Read `.codeloop/gotchas.md` and `.codeloop/patterns.md` to check for existing entries that were re-encountered.

## Phase 2: Propose

Present a **numbered list** of everything you want to do. Group by type:

```
## Proposed changes

### Gotchas
1. NEW: "<description>" → .codeloop/gotchas.md [freq:1]
2. INCREMENT: "<existing gotcha>" freq:2 → freq:3

### Patterns
3. NEW: "<description>" → .codeloop/patterns.md

### Rules
4. PROMOTE: "<gotcha at freq 10+>" → .codeloop/rules.md
```

Then use **AskUserQuestion** with multiSelect to let the user pick which items to apply. Include all items as options.

## Phase 3: Apply

Only apply the items the user selected. Skip everything else.

### Writing gotchas

New gotchas follow this format:

```markdown
### [freq:1] Short descriptive title
**Applies to:** <scope or context>
**Source:** Discovered <date>

<Description of the gotcha, what went wrong, and the fix>
```

Place in the appropriate section (create section if needed, matching config.yaml scope sections).

### Incrementing frequency

Find the existing entry, update `[freq:N]` to `[freq:N+1]`.

### Writing patterns

New patterns follow this format:

```markdown
### Pattern Title
**Confidence:** LOW/MEDIUM/HIGH
**Applies to:** <scope or context>

<Description of the pattern with code example if applicable>
```

### Promoting to rules

When a gotcha reaches freq >= 10, suggest promoting to `.codeloop/rules.md`:
1. Write a concise rule in rules.md
2. Add a note to the gotcha: `**Promoted to rules.md**`

After applying, one-line summary: what was saved and where.

## Rules

- If nothing worth saving, just say "Nothing new to capture" and stop
- No scoring rubrics, no ceremony
- Keep knowledge files concise — trim old low-freq entries if files get too long
- **Never write to any file without approval from Phase 2**
- Frequency = severity: the more a gotcha recurs, the more important it becomes
