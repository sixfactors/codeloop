
## Backend

### Pydantic models at API boundaries [confidence:HIGH]
Use Pydantic `BaseModel` for request/response validation. Never pass raw dicts through API layers — models enforce schema, generate docs, and catch invalid data early.

### Context managers for resource cleanup [confidence:HIGH]
Database connections, file handles, temporary directories — use `with` statements to guarantee cleanup. Prevents resource leaks on exceptions.

### Type hints everywhere [confidence:MEDIUM]
All function signatures have type hints. Use `mypy` or `pyright` in CI. Catches bugs at static analysis time instead of runtime.

## Testing

### Factories over fixtures for test data [confidence:MEDIUM]
Use factory functions (or `factory_boy`) to create test data with sensible defaults. Override only the fields relevant to each test. More readable than complex fixture chains.

### Test behavior, not implementation [confidence:HIGH]
Verify what the function returns or what side effects occur — not which internal methods were called. Implementation-coupled tests break on every refactor.
