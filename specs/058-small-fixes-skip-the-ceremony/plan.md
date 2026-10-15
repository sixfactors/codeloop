# c-058 plan: Small fixes skip the ceremony

## Layers touched

api, docs, test, ui

## Files

- `src/lib/cards.ts`: `trivial` joins Size
- `src/lib/story.ts`: SIZES, `--size trivial` parsing, the size filter
- `src/lib/lane.ts`: Stage `when:` (size comparisons), lint, `stageApplies`
- `src/lib/engine.ts`: entry stage and next stage honour `when:`; the gate note names the skipped stages; `resizeCard`
- `src/lib/spec.ts`: a trivial card's spec folder has no research.md or spec.md; its story is its one acceptance line
- `src/lib/verify.ts`: trivial acceptance; the cap breach re-sizes to S and parks at the spec gate
- `src/lib/diff-budget.ts`: the trivial budget (3 files, 50 lines)
- `src/lib/rubric.ts`: S1 and V2 accept the trivial size
- `src/lib/stats.ts`: cycle time by size
- `src/commands/verify.ts`: `codeloop stats` prints cycle time per size
- `src/commands/card.ts`: `--size` help text
- `src/lib/__tests__/trivial-ceremony.test.ts`
- `templates/lanes/build.yaml`: `when: size >= S` on research, interview, mock and spec
- `docs/story-standard.md`: the trivial row
- `scripts/e2e-trivial-ceremony.sh`
- `ui/lib/types.ts`
- `ui/components/lane-card.tsx`: the trivial badge
- `ui/components/card-detail.tsx`: the gate note
- `workspace/components/shared/new-card-dialog.tsx`: trivial in the size picker

## Risks

- A stage skipped by `when:` is still a stage the lane has, so `lane refresh` and `laneDrift` see no change; the installed `.codeloop/lanes/build.yaml` picks the predicate up on the next `codeloop lane refresh build`.
- A card with no size is judged as M for `when:`, the same default the diff budget uses, so older cards keep the full ceremony.
- `verify` moves the card when the trivial cap is breached; `advanceCard` must read that as this card's own decision and not as a conflict.
