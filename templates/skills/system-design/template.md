# System-design row formats

## Context row

| Actor / external system | Relationship |
|---|---|
| `<name from scope:>` | reads via REST / writes events to / authenticates through / … |

## Deployment topology row

| Environment | Where each piece runs | Notes |
|---|---|---|
| `<name from environments:>` | Fly.io app `x`, Vercel project `y`, … | |

## Tech choices row

| Choice | Alternative considered | Why | Cost |
|---|---|---|---|
| `<technology>` | `<alternative>` | one sentence | hosting, licensing, or operational cost |

## data-model.md sections

```
## Entities
- <Entity>: <field>, <field>, ...

## Stores
- <Entity>: `<file, table or collection named on the architecture data-model page>`

## Indexes
none, or one line per index and the query it serves

## Migration
none, with why (for example: the file is created on first write), or the command that runs
```
