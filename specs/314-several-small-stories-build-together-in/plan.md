# c-314 plan: Several small stories build together in one turn

## Layers touched

api (orchestrator, isolation, hand-back), test. No new screen: the batch shows as one activity line.

## Files

- src/lib/orch-isolation.ts
- src/lib/orch.ts
- src/lib/handback.ts
- src/lib/__tests__/orch-batch.test.ts

## Risks

- Batched stories that share a file mix their commits; only stories with no overlapping planned files are batched, and leases refuse the rest.
- One failure must not hold back the others; each story is gated alone.
- The orchestrator's turn record is per story today; each batched story keeps its own record, with the batch named on it.
