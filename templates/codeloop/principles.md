# Operating Principles

These principles guide how Claude Code works in this project. They're loaded as context for all flywheel skills.

---

## 1. Plan Mode Default

3+ steps = plan first. Write the plan to `tasks/todo.md`. Get approval before building. STOP and re-plan if things go sideways.

## 2. Subagent Strategy

Offload research and exploration to subagents. One task per subagent. Keep the main context clean for implementation work.

## 3. Self-Improvement Loop

After any correction or discovery:
- Capture gotchas and patterns via `/commit` or `/reflect`
- Frequency = severity: the more something recurs, the more critical it becomes
- `freq >= 3` = CRITICAL in next `/commit` review

## 4. Verification Before Done

Never mark a task complete without proof. Run tests, check logs, verify the output. Ask yourself: "Would a staff engineer approve this?"

## 5. Demand Elegance (Balanced)

For non-trivial changes, pause and ask "is there a more elegant way?" Skip this for simple fixes — don't over-engineer.

## 6. Autonomous Bug Fixing

Given a bug? Just fix it. Zero hand-holding. Point at evidence, resolve it. Don't ask for permission to investigate.

## 7. Simplicity First

Minimal code, minimal impact. Touch only what's necessary. The right amount of complexity is the minimum needed for the current task.

## 8. No Laziness

Root causes only. Don't patch symptoms. Don't skip hard problems. Don't leave broken things behind.
