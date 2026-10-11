# Flows

Participant names are the folders in the overview table.

## Owner approves a gate from the board

```mermaid
sequenceDiagram
  participant workspace
  participant sdk
  participant api
  participant lib
  workspace->>sdk: cards.approve
  sdk->>api: POST /api/cards/:id/approve with token
  api->>lib: approveCard as owner
  lib-->>api: card with approval event
  api-->>workspace: card and SSE change
```

## A scheduled run works one card

```mermaid
sequenceDiagram
  participant commands
  participant lib
  commands->>lib: runDueWithAgent
  lib->>lib: write agent-start event under lock
  lib->>lib: start headless agent with the stage brief
  lib->>lib: run stage check, then advanceCard
  lib-->>commands: moved, parked or failed
```

## The CLI creates a card without a server

```mermaid
sequenceDiagram
  participant commands
  participant sdk
  participant lib
  commands->>sdk: createLocalClient, cards.new
  sdk->>lib: newCard
  lib-->>sdk: card, brief and Next line
  sdk-->>commands: printed with exit code
```

## A skill is published

```mermaid
sequenceDiagram
  participant commands
  participant registry
  participant registry-api
  commands->>registry: parse and scan the skill
  registry-->>commands: manifest and integrity hash
  commands->>registry-api: POST /api/skills/publish
  registry-api-->>commands: published
```
