
## Backend

### Goroutine leaks [freq:1]
Goroutines that block on channels or I/O without exit conditions leak memory. Always ensure goroutines can be cancelled via `context.Context` or channel close signals.

### Interface nil check is not what you expect [freq:1]
A typed nil pointer assigned to an `interface{}` variable is not `== nil`. The interface value has a non-nil type, so the nil check passes. Check the concrete value or use reflection.

### Slice append can mutate shared backing array [freq:1]
`append(slice, elem)` reuses the backing array if capacity allows. Two slices from the same source can interfere with each other. Use `copy()` or full-slice expressions (`s[:len(s):len(s)]`) for safety.

### `defer` evaluates arguments immediately [freq:1]
`defer fmt.Println(x)` captures the current value of `x`, not the value at function exit. Use a closure (`defer func() { fmt.Println(x) }()`) to capture the final value.

### Error wrapping needs `%w` for unwrapping [freq:1]
`fmt.Errorf("failed: %v", err)` creates a new error that breaks `errors.Is()` and `errors.As()`. Use `%w` instead: `fmt.Errorf("failed: %w", err)`.

### Forgetting to check `rows.Err()` after iteration [freq:1]
`database/sql` `rows.Next()` can stop due to an error, not just end-of-results. Always check `rows.Err()` after the loop.

## Testing

### Table-driven tests need subtests [freq:1]
Table-driven tests without `t.Run(name, ...)` report failures against the parent test — impossible to tell which case failed. Always use `t.Run`.

### Race conditions in tests [freq:1]
Tests that spawn goroutines without `-race` detection pass locally but fail in CI. Always run `go test -race ./...` in CI.
