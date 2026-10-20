## Q1 Acceptance: what is the written bar v2 must meet before ops-ai switches? (builds on research.md:38)
recommended: Codeloop's own board runs on v2 for 7 consecutive days with no rollback; the nightly parity check between v1 and v2 (E4) is green for the last 5 nights; a dry run of ops-ai's migration passes with an import report that lists zero lost cards, events, pages or documents; and `scripts/v1-untouched.sh compare` has passed after every v2 session in that week. The bar is written into this card's spec and checked by the switch story, not judged on the day.

## Q2 Boundary: who flips the switch, who may roll back, and must a rollback be rehearsed first? (builds on research.md:39)
recommended: Only the owner runs the switch, from a terminal, never from an agent run. The owner or the orchestrator may roll back at any time with one script (E4). A rollback rehearsal on a copy of ops-ai's board, with its output kept, is required within 3 days before the switch; the switch script refuses without one on record.

## Q3 Scope: what is this parent card on the board: an epic record that closes with its last child, or a story to be split so each piece passes the spec gate? (builds on research.md:40)
recommended: An epic record. Keep c-329 as the parent of c-330 to c-333 and the E4 stories, let it hold the written bar and the cutover decision, and close it when the switch story is done; do not split it or try to pass it through the spec gate as a story. Mark that in its description so the size-L rule does not keep flagging it.

## Q4 Risk: may the frozen 1.0.0 take a hotfix before the switch, and how? (builds on research.md:41)
recommended: Yes, only for a defect that blocks ops-ai's daily work: a `v1.0.x` tag on a branch cut from `v1.0.0`, packed with `scripts/release-pack.sh v1.0.x`, installed with `scripts/release-install.sh`, proven with `scripts/check-frozen.sh v1.0.x`; no feature work lands on it. Everything else waits for v2.
