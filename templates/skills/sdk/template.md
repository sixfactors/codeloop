# SDK hook file skeleton: {entity}

<!-- One file (or one section of the SDK's hooks module) per entity touched by this card. -->

## Type

```
interface {Entity} {
  id: string
  // fields, matching the api stage's contract exactly
}
```

## Client / module method

```
{entity}: {
  list: (params?) => ...
  get: (id) => ...
  create: (data) => ...
  update: (id, data) => ...
  delete: (id) => ...
  // + any action-specific method the route exposes
}
```

## Query key factory

```
{entity}Keys = {
  all: ['{entity}s'],
  lists: () => [...all, 'list'],
  list: (filters?) => [...lists(), filters],
  details: () => [...all, 'detail'],
  detail: (id) => [...details(), id],
}
```

## Query hook

```
use{Entity}(id) -> query on {entity}Keys.detail(id), calling client.{entity}.get(id)
use{Entity}List(filters?) -> query on {entity}Keys.list(filters), calling client.{entity}.list(filters)
```

## Mutation hook

```
useCreate{Entity}() -> mutation calling client.{entity}.create, invalidates {entity}Keys.lists() on success
useUpdate{Entity}() -> mutation calling client.{entity}.update, invalidates {entity}Keys.detail(id) on success
```

## CLI command (if the project ships one)

```
<cli> {entity} <action> [args] [--json]
```

**Proof run:** the exact command used to demonstrate the gate, and its output.
