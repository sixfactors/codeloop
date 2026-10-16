<!-- codeloop verify: start -->
# Verify c-301

result: pass
sha: ebc8c2fc7be0198b8121037cac0b41f065eb622b
env: local
workspace: export of ebc8c2f
budget: 16 files, 239 lines, limit 20 files / 1200 lines (M), pass
health: before 88.19, after 88.19, delta 0, pass

| Use case | Accepts | Layers |
|---|---|---|
| uc-301-01 | US1 | cli pass |
| uc-301-02 | US2 | cli pass |
<!-- codeloop verify: end -->

## Live walk
stack: `codeloop init -s node-typescript -t claude` on a fresh git repo with the global 0.5.0 CLI (dist at c7e7add), hooks as installed into .claude/settings.json; two S stories started (c-001, c-002)
url: http://127.0.0.1:4172/home (`codeloop serve --standalone --port 4172 --owner` on the walk repo); the hooks themselves were driven by piping the host's hook JSON into `codeloop guard prompt` and `codeloop guard bash` as Claude Code does
steps:
- session walk-a, no active story, prompt "draw the architecture page": exit 0, printed "codeloop: no active story. Put this request on one before changing files:" with c-001 and c-002 and the `codeloop start "<title>" --size trivial --activate` line
- `codeloop start "Draw the architecture page" --size trivial --activate`: created c-003 at build, "active card: c-003 ... (this session only)", events show skip research, interview, mock, spec, data-model
- same session, prompt "now add the legend": exit 0, one line naming active card c-003
- `guard.prompt: block` in config, session walk-b, no active story: exit 2, "no active story, and these are open. Activate one before working:" with c-001..c-003
- PreToolUse for `codeloop card move c-003 live`: permissionDecision "ask", "is your decision. Allow to run it as you, or Deny."; `codeloop card move c-003 build` passed silently (exit 0)
- opened Home: "3 in progress · 1 agent working", Agents now shows "claude on Deans-M4" working on "c-003 Draw the architecture page · build", last "ran codeloop card move c-003 build"
- seen but not this story's: in step 3 the "looks outside the active card" heuristic fires on a follow-up prompt that shares no title words
network:
- GET http://127.0.0.1:4172/home 200
- GET http://127.0.0.1:4172/api/home 200
external: none: the hooks read local files under .codeloop/ and call nothing outside the machine

## Rubric
- V4 pass: uc-301-01 failed on the build before 3fb30b1 ("× lets the prompt through with no active story and names the top 3 open stories", Tests 1 failed | 5 passed, guard prompt exited 2; specs/301-i-keep-working-when-no-story-is-active-i/rubric-build.md:4). uc-301-02 on a private build of ebc8c2f with promptGuardMode forced to 'nudge': "× with guard.prompt: block, exits 2 and lists the open stories", 1 failed; green on dist.
- V6 pass: evidence/301/uc-301-01.json and evidence/301/uc-301-02.json hold each use case's output at ebc8c2f; the live walk above quotes each hook's output and the Home page text; no screenshot claimed
