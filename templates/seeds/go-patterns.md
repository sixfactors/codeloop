
## Backend

### Accept interfaces, return structs [confidence:HIGH]
Function parameters should accept interfaces for flexibility. Return concrete types so callers know exactly what they get. This maximizes testability and minimizes coupling.

### Errors are values, handle them immediately [confidence:HIGH]
Check errors on the line after the call. Don't defer error handling or collect errors for later. Each error gets handled where it occurs.

### Context propagation through the call chain [confidence:HIGH]
Pass `context.Context` as the first parameter through every function that does I/O or could be cancelled. Never store contexts in structs.

### Functional options for configuration [confidence:MEDIUM]
Use `WithTimeout(5*time.Second)` style option functions instead of large config structs. Extensible without breaking existing callers.

## Testing

### Table-driven tests with subtests [confidence:HIGH]
Define test cases as a slice of structs. Run each with `t.Run(name, func(t *testing.T) {...})`. Clear, extensible, easy to add new cases.

### Test helpers return errors, don't t.Fatal [confidence:MEDIUM]
Helper functions return errors so the caller decides how to handle them. Only call `t.Fatal` at the test level, not in helpers — it makes helpers reusable.
