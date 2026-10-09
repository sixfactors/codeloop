# Mock row formats

## Component map row

| Component | Registry block / primitive | Net-new |
|---|---|---|
| `<name from components:>` | `sidebar-07` / `data-table-demo` / `sheet` / … | none \| minor \| new |

## State matrix row

One row per data-bearing component, one column per state named in `states:`.

| Component | Loading | Ready | Empty | Error |
|---|---|---|---|---|
| `<name>` | skeleton matching the layout | real content | what will fill it, and a CTA if one exists | kept input + retry, or the problem-surface used |

A blank cell is a gap the check will flag. Use `<td class="gap">n/a, why</td>` only when the state
genuinely does not apply to this component, and say why.
