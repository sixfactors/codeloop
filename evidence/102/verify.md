<!-- codeloop verify: start -->
# Verify c-102

result: pass
sha: dfc9aad00b5847d4c45c8448c5bc25183a38abb9
env: local
workspace: export of dfc9aad

| Use case | Accepts | Layers |
|---|---|---|
| uc-102-01 | US1 | cli pass |
| uc-102-02 | US2 | cli pass |
| uc-102-03 | US3 | cli pass |
<!-- codeloop verify: end -->

# Verify c-102

result: pass
sha: 8a9316b022d4ba2b8d7d342f73b31e2c93321110
env: local

| Use case | Accepts | Layers |
|---|---|---|
| uc-102-01 | US1 | cli pass |
| uc-102-02 | US2 | cli pass |
| uc-102-03 | US3 | cli pass |

## Live walk
stack: codeloop init on a fresh repo with wip: 2 in the build lane, then codeloop serve --standalone --port 4171 --owner
url: http://127.0.0.1:4171/
steps:
- with c-001 and c-002 in build, codeloop start "Email the export" was refused: "lane build works on 2 cards at a time and 2 hold the slots: c-001 ... c-002 ..."
- codeloop card done c-001 --as owner freed the slot ("its slot in build is free") and the same start created c-003
- codeloop card done c-003 --as agent was refused: "ending a card is the owner's decision"
- codeloop card park c-002 showed it waiting for the owner; codeloop approve c-002 put it back at build, the stage it left
- the board showed c-001 in the Done column and c-002, c-003 in progress
network:
- GET http://127.0.0.1:4171/ 200
- GET http://127.0.0.1:4171/home 200
external: none: slots and stages are the local cards.json and the local board; nothing outside the machine is called
