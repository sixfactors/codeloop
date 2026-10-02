---
title: Adopt without --from overwrites the index
scope:
  - src/lib/skills.ts
freq: 1
severity: warning
cards:
  - CL-001
updated: 2026-10-02
---

`codeloop adopt` rewrites `.codeloop/skills.index.yaml` from the directories scanned in that run. It does not merge. Running it with `--from <dir>` and later without drops every entry that came from `<dir>`, and `codeloop lane lint` then rejects each lane stage that names one of those skills.

Pass the same `--from` directories on every run, or change `scanSkills` callers to merge with the existing index before changing this behaviour.
