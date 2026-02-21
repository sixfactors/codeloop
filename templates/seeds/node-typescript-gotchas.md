
## Backend

### Async without await silently drops errors [freq:1]
Calling an async function without `await` returns a Promise that nobody listens to. If it throws, the error is swallowed. Always `await` or explicitly handle the returned Promise.

### `transform: true` converts missing params to NaN [freq:1]
In NestJS with `class-validator`, `@Query() n?: number` becomes `NaN` when omitted (because `Number(undefined) === NaN`). Always guard with `isNaN()` before using numeric query params.

### `.save()` has race conditions [freq:1]
Mongoose `doc.save()` overwrites the entire document. If two processes load the same doc and save, the last write wins. Use `findByIdAndUpdate()` with `$set` for atomic field updates.

### Import order matters with circular dependencies [freq:1]
TypeScript circular imports cause `undefined` at runtime when the execution order doesn't match expectations. Move shared types to a separate file that both modules import.

## Frontend

### Stale closures in React effects [freq:1]
`useEffect` closures capture variable values at render time. If a cleanup function or interval references state, it sees the stale value. Use refs or `useCallback` with proper deps.

### `key` prop on list items must be stable [freq:1]
Using array index as `key` causes incorrect renders when items are reordered or deleted. Use a unique, stable identifier from the data.

## Testing

### Mock cleanup between tests [freq:1]
Mocks that aren't restored between tests leak state. Use `afterEach(() => vi.restoreAllMocks())` or `jest.restoreAllMocks()` to prevent flaky cross-test contamination.

### Async test assertions need `await` [freq:1]
`expect(asyncFn()).rejects.toThrow()` without `await` passes even if the assertion fails — the test completes before the Promise resolves. Always `await expect(...)`.
