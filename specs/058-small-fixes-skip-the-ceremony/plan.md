# c-058 plan: Small fixes skip the ceremony

## Layers touched

api (cards, story, lane, engine, verify, stats, diff-budget), ui (size badge, gate note), docs, test.

## Files

src/lib/cards.ts, src/lib/story.ts, src/lib/lane.ts, src/lib/engine.ts, src/lib/verify.ts, src/lib/stats.ts, src/lib/diff-budget.ts, src/lib/spec.ts, src/lib/rubric.ts, src/commands/card.ts, src/commands/verify.ts, templates/lanes/build.yaml, docs/story-standard.md, ui/lib/types.ts, ui/components/lane-card.tsx, ui/components/card-detail.tsx, scripts/e2e-trivial-ceremony.sh, src/lib/__tests__/trivial-ceremony.test.ts, usecases/058/

## Risks

An installed build lane keeps its own stages until `codeloop lane refresh build`; the shipped template carries the `when:` lines.
