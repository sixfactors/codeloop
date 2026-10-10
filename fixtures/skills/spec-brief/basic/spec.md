# Spec: CSV export for the inbox

## Goal

Owners who triage the inbox in a spreadsheet today have no way to get the parked cards out of
codeloop. Add `codeloop inbox --csv` so the current inbox report can be opened in a spreadsheet.

## Scope

- One row per parked card: id, lane, stage, gate, awaiting, age.
- No new flags beyond `--csv`; it replaces the table output, not the JSON one.

## Out of scope

- Exporting anything other than the inbox (cards list, stats) — a later card if anyone asks.
