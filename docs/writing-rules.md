# Writing Rules

Rules in `.codeloop/rules.md` are the highest-severity checks. They're always loaded as CRITICAL by `/commit`, regardless of scope.

## When to Add a Rule

Add a rule when:

1. **A gotcha reaches freq 10+** — `codeloop status` will suggest this automatically
2. **The team agrees on a non-negotiable standard** — coding conventions, security requirements
3. **A production incident was caused by something preventable** — encode the lesson

## Rule Format

Keep rules concise and actionable:

```markdown
## N. Rule Title

One-sentence description of what to do (or not do) and why.
```

Optional: include a code example showing the wrong way and the right way.

## Good Rules

Good rules are:

- **Specific** — "Use findByIdAndUpdate, not doc.save()" not "Write good code"
- **Actionable** — Clear what to do differently
- **Justified** — Brief explanation of why (race condition, security, etc.)
- **Universal** — Applies across the codebase, not to one specific file

## Graduating from Gotchas

The natural lifecycle of a lesson:

```
Discovered → gotcha [freq:1] → re-encountered → [freq:3] → CRITICAL in review
  → keeps recurring → [freq:10+] → promoted to rules.md → always CRITICAL
```

When promoting:
1. Write the rule in `rules.md`
2. Add `**Promoted to rules.md**` note to the original gotcha
3. The gotcha stays in `gotchas.md` as historical reference

## How Many Rules

Keep the list short. 5-15 rules is ideal. Too many rules dilute their impact. If everything is CRITICAL, nothing is.

Rules should represent genuine, recurring problems — not aspirational standards.
