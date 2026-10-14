<!-- codeloop verify: start -->
# Verify c-098

result: pass
sha: 6faf1221c6073c900ffd3a01743cfc2f7e2187ff
env: local
workspace: export of 6faf122

| Use case | Accepts | Layers |
|---|---|---|
| uc-098-01 | US1 | cli pass |
| uc-098-02 | US2 | cli pass |
| uc-098-03 | US3 | cli pass |
<!-- codeloop verify: end -->

# Verify c-098

result: pass
sha: e55ff3bf4879030a13f3bf7a7f3e8099bb56a0f5
env: local

| Use case | Accepts | Layers |
|---|---|---|
| uc-098-01 | US1 | cli pass |
| uc-098-02 | US2 | cli pass |
| uc-098-03 | US3 | cli pass |

## Live walk
stack: codeloop init on a fresh repo, then codeloop serve --standalone --port 4171 --owner (the board a user runs)
url: http://127.0.0.1:4171/home
steps:
- two shells, CLAUDE_CODE_SESSION_ID=sess-a and sess-b, ran codeloop card activate c-001 and c-002; each printed "active card ... (this session only)"
- session A's guard edit on src/import.ts (in c-002's plan) exited 2: "belongs to c-002 (Import a bank statement), which another session is working"
- session A's guard edit on its own src/export.ts exited 0
- Home showed Agents now with two rows, SESS-B on Import a bank statement and SESS-A on Export invoices as CSV
- guard release for sess-b exited 0, its active file was gone, and Home then listed only SESS-A
- seen but not this story's: Home shows the session id, not the "claude on Deans-M4" label the API returns
network:
- GET http://127.0.0.1:4171/home 200
- GET http://127.0.0.1:4171/api/home 200
external: none: sessions, leases and the guards are local files and the local board; nothing outside the machine is called
