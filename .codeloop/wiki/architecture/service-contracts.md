---
title: Service contracts
---

# Routes

| Method | Path | Handler file |
|---|---|---|
| GET | /api/skills/:name | source: registry-api/app/api/skills/[name]/route.ts |
| POST | /api/skills/publish | source: registry-api/app/api/skills/publish/route.ts |
| GET | /api/skills | source: registry-api/app/api/skills/route.ts |
| GET | /api/cards | source: src/lib/server.ts |
| GET | /api/inbox | source: src/lib/server.ts |
| GET | /api/inbox/report | source: src/lib/server.ts |
| POST | /api/inbox/seen | source: src/lib/server.ts |
| POST | /api/cards/:id/approve | source: src/lib/server.ts |
| POST | /api/cards/:id/reject | source: src/lib/server.ts |
| POST | /api/cards/:id/advance | source: src/lib/server.ts |
| GET | /api/cards/:id/questions | source: src/lib/server.ts |
| POST | /api/cards/:id/questions | source: src/lib/server.ts |
| POST | /api/cards/:id/questions/:n/answer | source: src/lib/server.ts |
| GET | /api/cards/:id/brief | source: src/lib/server.ts |
| POST | /api/cards/:id/run | source: src/lib/server.ts |
| GET | /api/runs/:runId | source: src/lib/server.ts |
| GET | /api/runs/:runId/stream | source: src/lib/server.ts |
| GET | /api/cards/:id/output | source: src/lib/server.ts |
| PUT | /api/cards/:id/output | source: src/lib/server.ts |
| POST | /api/cards/:id/split | source: src/lib/server.ts |
| POST | /api/setup/detect | source: src/lib/server.ts |
| POST | /api/setup/adopt | source: src/lib/server.ts |
| GET | /api/setup/status | source: src/lib/server.ts |
| GET | /api/cards/:id/show | source: src/lib/server.ts |
| GET | /api/cards/:id/full | source: src/lib/server.ts |
| GET | /api/cards/:id | source: src/lib/server.ts |
| GET | /api/lanes | source: src/lib/server.ts |
| GET | /api/initiatives | source: src/lib/server.ts |
| GET | /api/initiatives/:id/tree | source: src/lib/server.ts |
| GET | /api/epics | source: src/lib/server.ts |
| GET | /api/epics/:id/tree | source: src/lib/server.ts |
| POST | /api/epics | source: src/lib/server.ts |
| GET | /api/features | source: src/lib/server.ts |
| GET | /api/features/:id | source: src/lib/server.ts |
| POST | /api/features | source: src/lib/server.ts |
| POST | /api/features/:id/score | source: src/lib/server.ts |
| GET | /api/pages | source: src/lib/server.ts |
| GET | /api/pages/* | source: src/lib/server.ts |
| PUT | /api/pages/* | source: src/lib/server.ts |
| DELETE | /api/pages/* | source: src/lib/server.ts |
| GET | /api/evidence/:nnn | source: src/lib/server.ts |
| GET | /api/artifacts | source: src/lib/server.ts |
| GET | /api/stats | source: src/lib/server.ts |
| GET | /api/config | source: src/lib/server.ts |
| GET | /api/wiki/entries | source: src/lib/server.ts |
| GET | /api/wiki/inject | source: src/lib/server.ts |
| GET | /api/wiki/lint | source: src/lib/server.ts |
| POST | /api/cards | source: src/lib/server.ts |
| GET | /mocks/* | source: src/lib/server.ts |
| GET | /mocks | source: src/lib/server.ts |
| GET | /api/board | source: src/lib/server.ts |
| POST | /api/tasks | source: src/lib/server.ts |
| PATCH | /api/tasks/:id | source: src/lib/server.ts |
| DELETE | /api/tasks/:id | source: src/lib/server.ts |
| GET | /api/events | source: src/lib/server.ts |
| GET | * | source: src/lib/server.ts |
