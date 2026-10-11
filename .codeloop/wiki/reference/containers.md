---
title: Containers
---

# Containers and layers

C4 level 2: the deployable pieces, as layers from the user down to the data. Each box names its technology; a box with no technology is a gap to fill.

```mermaid
flowchart TB
  subgraph L0["runtime"]
    N0["Node.js"]
  end
  API["59 routes"]
  N0 -. calls .-> API
```

| Layer | Tech | Where | Source |
|---|---|---|---|
| runtime | Node.js | @protoboxai/codeloop | source: package.json |
| package manager | npm | - | source: lockfile |
| test framework | vitest | - | source: package.json dependencies |
