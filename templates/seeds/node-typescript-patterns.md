
## Backend

### DTOs at API boundaries [confidence:HIGH]
Never pass raw database objects to API responses. Use DTOs (Data Transfer Objects) to control exactly which fields are exposed. Prevents accidental data leaks and decouples internal schema from public API.

### Dependency injection over direct imports [confidence:HIGH]
Import the interface, inject the implementation. Makes testing trivial (swap with mocks) and keeps modules loosely coupled.

### Index files for module exports [confidence:MEDIUM]
Each module directory has an `index.ts` that re-exports its public API. Internal files stay private. Consumers import from the directory, not deep paths.

## Frontend

### Server components by default [confidence:MEDIUM]
Start with server components. Only add `'use client'` when you need interactivity (event handlers, state, effects). This keeps bundle size small and data fetching simple.

### Colocate state with its consumer [confidence:HIGH]
State lives in the closest common parent of the components that need it. Don't hoist to a global store unless multiple unrelated features need the same data.

## Testing

### Test behavior, not implementation [confidence:HIGH]
Tests should verify what the code does, not how it does it. Avoid asserting on internal method calls or implementation details — they break on refactors without catching real bugs.

### Arrange-Act-Assert structure [confidence:HIGH]
Every test has three clear sections: set up the data (Arrange), perform the action (Act), check the result (Assert). Keeps tests readable and focused.
