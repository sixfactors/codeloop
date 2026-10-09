# Screen state checklist: {screen name}

<!-- One of these per screen in spec.md's screens: list. Fill before ticking the [ui] task. -->

**Route:** `{path}`
**Acceptance line(s) served:** `US{n}`
**Data source:** `use{Entity}()` / `use{Entity}List()` from the sdk stage

| State | Built? | Notes |
|---|---|---|
| Default (data present) | | |
| Hover (on interactive elements) | | |
| Focus-visible | | |
| Active | | |
| Disabled | | |
| Loading | | matches content shape (skeleton), not a blank screen |
| Empty | | or: N/A, explain why (e.g. the entity always exists) |

**Registry components used:** list what was copied, from where.

**Divergence from the mock, if any:** what changed, and why the registry version won.

**Responsive check:** smallest supported width ___, largest ___. Horizontal scroll introduced?
Y/N, if Y, justify (e.g. data table).

**Tokens used:** confirm no hardcoded color or off-scale spacing. New token added? Name it, and
confirm it's defined in every theme mode.
