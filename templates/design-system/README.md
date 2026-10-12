# Design system

The look every mock is built from. `codeloop init` copies it here and `codeloop update` never
overwrites it, so it is yours to change.

- `tokens.css`: colours, radius, spacing and fonts as CSS custom properties, light and dark.
  Change a value here and every new mock uses it; `codeloop check mock` holds each mock to the
  tokens in this file.
- `blocks.css`: the building blocks screens are composed from. A mock uses these class names and
  adds no colours of its own.

| Block | Classes | Use for |
|---|---|---|
| App frame | `app-frame`, `chrome`, `app`, `nav`, `main` | Any full screen: top bar, side navigation, content |
| Key | `key` | A story or page id |
| Status | `pill`, `pill agent`, `pill you`, `pill ok`, `pill warn`, `pill danger`, `live` | A state, a flag, who it waits on |
| Holder | `holder`, `holder agent` | Who has it: round for a person, square for an agent |
| Priority | `prio p1` to `prio p4` | P1 to P4 |
| Proof meter | `proof` with `i.pass`, `i.fail`, `i` | One segment per acceptance line |
| Buttons | `btn`, `btn primary` | Actions; one primary per row |
| Row | `list-row`, `grow`, `actions` | One item in a list |
| Board | `columns`, `column`, `column-head`, `tile`, `swimlane` | Work by state |
| Record | `record`, `props`, `prop`, `tabs`, `tab`, `callout`, `check-line` | One item in full |
| Tree | `tree-row depth-1`, `depth-2` | A ranked hierarchy |

To match your product, set the tokens to its colours and fonts, and add blocks your screens need
here, not inside a mock.
