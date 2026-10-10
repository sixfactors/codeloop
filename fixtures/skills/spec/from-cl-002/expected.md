# Expected grading: from-cl-002

Research and an answered interview for the README card exist; spec.md and tasks.md are the empty templates. The skill must produce a spec in the story standard and a tasks list, and `codeloop spec check` must exit 0.

Checklist lines that must be yes:
- story has all three parts: persona, "I can", "so that"
- `size:` is S, M, or L; an L is split before the spec gate
- `done_when:` is a command or a screen, never "all stories complete"
- `acceptance:` is 1-5 lines, each starting `Given`, containing `when` and `then`
- every acceptance line has at least one task in `tasks.md`
- `codeloop spec check {id}` exits 0
