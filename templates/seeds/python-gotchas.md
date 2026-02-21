
## Backend

### Mutable default arguments are shared [freq:1]
`def foo(items=[])` — the default list is created once and shared across all calls. Mutations persist between invocations. Use `items=None` and create inside the function.

### `is` vs `==` for comparisons [freq:1]
`is` checks identity (same object in memory), `==` checks equality (same value). Use `is` only for `None`, `True`, `False`. For everything else, use `==`.

### Silent exception swallowing [freq:1]
Bare `except:` or `except Exception:` with just `pass` hides real bugs. Always log the exception or re-raise. If you must catch broadly, at least log at warning level.

### Circular imports cause ImportError at runtime [freq:1]
Two modules importing each other works in some cases but fails unpredictably depending on import order. Move shared types/interfaces to a third module.

### `datetime.now()` uses local timezone [freq:1]
`datetime.now()` returns naive local time. For servers, always use `datetime.now(timezone.utc)` or `datetime.utcnow()` to avoid timezone confusion.

## Database

### SQLAlchemy session not committed [freq:1]
Forgetting `session.commit()` after inserts/updates — changes exist in memory but never reach the database. Use context managers or explicit commit calls.

## Testing

### Fixtures that share mutable state [freq:1]
`@pytest.fixture(scope="module")` with mutable objects (dicts, lists) causes test pollution. Use `scope="function"` (default) for isolation, or return fresh copies.

### Async test functions need pytest-asyncio [freq:1]
`async def test_something()` silently passes without actually running unless `pytest-asyncio` is installed and `@pytest.mark.asyncio` is applied.
