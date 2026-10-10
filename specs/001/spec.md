# CL-001 spec: lane engine with enforced gates

Story: as an owner I can trust a card's stage, because no agent can move it without passing its check.

acceptance:
- US1 Given a stage whose check fails, when `codeloop card advance` runs, then the card stays and retries count up; at the lane's limit the card parks as stuck.
- US2 Given two writers who read the same version, when both write, then the second gets a conflict and no write is lost.
- US3 Given a parked card, when an agent role approves, then it is refused; an owner approval releases it.
- US4 Given `gates.mode: trusted`, when a gate is marked outward, then it still stops.
- US5 Given three rejections of one gate, when `codeloop lane propose` runs, then a proposal citing those cards exists and cannot be promoted without a green eval.

Proof: `src/lib/__tests__/lane-engine.test.ts` (11 tests) and `scripts/e2e-founder-loop.sh` (52 steps).
