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
