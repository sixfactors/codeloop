# Store

The driver interface under the board. Today it wraps the files codeloop already keeps; later a
`protobox` or `sql` driver serves the same repos from somewhere else.

| File | What it holds |
|---|---|
| `driver.ts` | `Store`, `Repo<T>`, `Query<T>`, `KeyValue`, `Change`, `applyQuery`; re-exports the engine's `ConflictError` |
| `schema.ts` | zod schemas and types: `CardRecord` (the engine's `Card` plus `version`), `Lane`, `WikiPage`, `Initiative`, `Question`, `Evidence`, `Artifact` |
| `file.ts` | `FileDriver`: `.codeloop/`, `specs/`, `evidence/`, `docs/mocks`, `docs/artifacts` |
| `memory.ts` | `MemoryDriver`: tests, and an engine run with no disk |
| `index.ts` | `openStore(projectDir)` reads `store.driver` from config.yaml (default `file`); `registerDriver(name, factory)` for plugins |
| `migrations/` | `runMigrations` applies what `.codeloop/store.json` does not list yet; `001-story-fields` is the first |

## Versions

A version is what the driver saw when it read an item. `put(item, expectVersion)` is refused with
`ConflictError` when the stored version has moved. `FileDriver` uses the sha1 of the file the item
lives in, except lanes, which are versioned by the number they declare (bumped by `lane promote`).
`cards.put` goes through `writeCards`, so the file's own counter is still checked under its lock
even when no version was expected.

`evidence` and `artifacts` are read-only: `codeloop verify` and `codeloop mock new` write them.

## Who reads through it today

- `codeloop serve`: `/api/lanes`, `/api/initiatives`, `/api/pages`, `/api/evidence/:nnn`, `/api/artifacts`,
  `/api/config`, and the evidence and wiki page parts of `/api/cards/:id/full`.
- `codeloop card list --json`.

Everything else in `src/lib` still calls `readCards`, `writeCards`, `loadLane` and the wiki
functions directly. `FileDriver` wraps those same functions, so both paths see one set of files.

## Moving the engine over, repo by repo

1. Pick one repo. Replace its direct file reads in `src/lib` with `store.<repo>.list()` or `get()`;
   the result is the same data with a `version` on it.
2. Replace its writes with `store.<repo>.put(item, version)` inside `store.tx()` where a read and a
   write must land together. Catch `ConflictError` exactly where `writeCards`' conflict was caught
   before; it is the same class.
3. Run the contract test (`src/lib/store/__tests__/repo-contract.test.ts`) and the suite. The
   contract runs against both drivers, so a repo that passes it behaves the same on either.
4. Once no engine function reads the file directly, the file layout becomes the driver's business
   and a second driver can serve that repo.

Order worth following: lanes and initiatives (read-mostly), then pages, then questions, then cards last,
because `writeCards` also writes the cloud board and the lock around it is what the whole engine
relies on.

## Migrations

`codeloop store status` shows the driver and what has run; `codeloop store migrate` applies what
is pending. Nothing runs a migration on its own: `openStore` only picks a driver.
