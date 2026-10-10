## Q1 Scope: which stages does a trivial card skip: research, spec and the spec gate only, or also the review/pr gate? And is anything about epics or splitting in here?
recommended: Skip research, spec and the spec gate; keep build, verify (local gate) and review (pr gate). Prod gate unchanged. Splitting and epics stay in c-060.
answer: Skip research, spec and the spec gate; keep build, verify (local gate) and review (pr gate). Prod gate unchanged. Splitting and epics stay in c-060.

## Q2 Who sets size: the agent's investigate stage alone, the founder at `card new`, or agent proposes and the founder's first gate confirms?
recommended: Agent proposes `size:` in the investigate stage; founder can override with `card new --size`; a trivial sizing is shown in the local gate note ("size: trivial, skipped research/spec") so Dean sees it once.
answer: 

## Q3 Acceptance: what proves it, and on which real card do we dogfood it?
recommended: Dogfood on a real one-line fix in codeloop. Given a card sized trivial, when `codeloop run`, then no research.md or spec.md exists, events show create -> build -> verify in one run, and `codeloop stats` shows trivial cycle time under one hour.
answer: 

## Q4 Riskiest assumption: the agent calls an M card trivial to dodge the spec gate. Diff cap, founder confirm, or trust?
recommended: Hard cap: trivial = at most 3 files and 50 changed lines, enforced by `check diff` at verify; over the cap the card is re-sized to S and parked at the spec gate.
answer: 

## Q5 Sizes: add `trivial` below S, or keep the story standard's S/M/L and let S skip?
recommended: Add `trivial` as a fourth size (one row in the story standard); stages carry `when: size >= S` in build.yaml.
answer: 
