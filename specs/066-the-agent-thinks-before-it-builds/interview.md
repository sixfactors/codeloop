## Q1 Scope: whys, options, premortem and scope-cut as one card reads as L. Which ship first?
recommended: Split: this card = options plus `## Not building` (scope-cut) written into spec.md; whys and premortem are a child card. Both reuse c-063's inbox mechanism.
answer: 

## Q2 Which sizes run which stages?
recommended: trivial none; S scope-cut; M options and scope-cut; L/epic all four. Set with `when: size >= M` on the stage.
answer: 

## Q3 Acceptance: what proves it?
recommended: Given an M card, when `run` reaches spec, then spec.md has `## Options` with three approaches and one explicitly rejected with a reason, and `## Not building` with at least two lines; `spec check` fails if either is missing.
answer: 

## Q4 Riskiest assumption: the agent writes plausible but hollow options. What makes the check non-vacuous?
recommended: Each option must name a file or wiki page it would touch; the rejected one must name its failure mode; premortem failure modes must become use case stubs under `usecases/` and that is what the check counts.
answer: 

## Q5 Does Dean read these at the spec gate, or answer them as inbox questions?
recommended: Read at the gate; only the options stage posts one inbox question ("A, B or C? recommended B").
answer: 
