---
title: Data flows
---

# Top flows

assumption: these sequences are inferred from the routes and entities found elsewhere in this outline; no flow documentation exists for them yet.

## GET /api/skills/:name

```mermaid
sequenceDiagram
  Client->>API: GET /api/skills/:name
  API->>DB: query/update
  DB-->>API: result
  API-->>Client: response
```

## POST /api/skills/publish

```mermaid
sequenceDiagram
  Client->>API: POST /api/skills/publish
  API->>DB: query/update
  DB-->>API: result
  API-->>Client: response
```

## GET /api/skills

```mermaid
sequenceDiagram
  Client->>API: GET /api/skills
  API->>DB: query/update
  DB-->>API: result
  API-->>Client: response
```
