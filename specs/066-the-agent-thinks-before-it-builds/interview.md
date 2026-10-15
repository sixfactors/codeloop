# c-066 interview: The agent thinks before it builds

Q1 to Q5 were answered by the owner in the first round and are kept as written. Research came
after the answers and built on them (research.md:49), so none of its five open questions is a
fork the owner has not already decided; each is settled under `## Settled from research` with the
answer it follows from. Each question names the research line it builds on.

## Q1 Scope: whys, options, premortem and scope-cut as one card reads as L. Which ship first?
builds on: research.md:27 (this card writes `## Options` and `## Not building` only; whys and premortem are the child card) and research.md:17 (separate stages rejected)
recommended: Split: this card = options plus `## Not building` (scope-cut) written into spec.md; whys and premortem are a child card. Both reuse c-063's inbox mechanism.
answer: Split: this card = options plus `## Not building` (scope-cut) written into spec.md; whys and premortem are a child card. Both reuse c-063's inbox mechanism.

## Q2 Boundary: which sizes run which stages?
builds on: research.md:18 (research runs on S cards too, so the per-size table cannot live there) and research.md:28 (`when: size >= M` is c-058's unbuilt T002)
recommended: trivial none; S scope-cut; M options and scope-cut; L/epic all four. Set with `when: size >= M` on the stage.
answer: trivial none; S scope-cut; M options and scope-cut; L/epic all four. Set with `when: size >= M` on the stage.

## Q3 Acceptance: what proves it?
builds on: research.md:15 (chosen option: a spec-stage check over `## Options` and `## Not building`) and research.md:45 (`checkSpec` reads neither section today)
recommended: Given an M card, when `run` reaches spec, then spec.md has `## Options` with three approaches and one explicitly rejected with a reason, and `## Not building` with at least two lines; `spec check` fails if either is missing.
answer: Given an M card, when `run` reaches spec, then spec.md has `## Options` with three approaches and one explicitly rejected with a reason, and `## Not building` with at least two lines; `spec check` fails if either is missing.

## Q4 Risk: the agent writes plausible but hollow options. What makes the check non-vacuous?
builds on: research.md:26 (the check counts shape, not sense; the options half stays a reading task at the gate) and research.md:30 (a rejected option's failure mode must not be captured as a gotcha)
recommended: Each option must name a file or wiki page it would touch; the rejected one must name its failure mode; premortem failure modes must become use case stubs under `usecases/` and that is what the check counts.
answer: Each option must name a file or wiki page it would touch; the rejected one must name its failure mode; premortem failure modes must become use case stubs under `usecases/` and that is what the check counts.

## Q5 Boundary: does Dean read these at the spec gate, or answer them as inbox questions?
builds on: research.md:47 (`addQuestions` already posts a lettered question with a recommended letter) and research.md:31 (one question per M card counts against `MAX_QUESTIONS`)
recommended: Read at the gate; only the options stage posts one inbox question ("A, B or C? recommended B").
answer: Read at the gate; only the options stage posts one inbox question ("A, B or C? recommended B").

## Settled from research

Each item is a research.md:33 open question. None is re-asked: the owner's round-one answer
fixes it, and the five-question cap in src/lib/interview.ts:11 is full. Each lands in spec.md as
an `assumption:` the owner can strike at the spec gate.

- research.md:35, an option that names a file not yet created: settled by Q4. "A file it would touch" is checked by existence, so every option names at least one path that exists today under `src/`, `templates/` or `.codeloop/wiki/`; a path to be created may be named beside it. Nothing under `src/` is created without registering it in an existing file (`src/index.ts`, a lane, a template), so the rule costs a real option nothing, and an option naming only new files is the hollow option Q4 guards against. Lands in spec.md US2 and `## Not building`.
- research.md:36, `spec check` or a new `check thinking`: settled by Q3, which says `spec check`. The research reason for a separate command (every M card past spec fails on the next run) does not hold: `codeloop spec check` runs only as the spec stage's done cmd (.codeloop/lanes/build.yaml:34) and from rubric row S4, which is judged at the spec stage only. The rules go into `checkSpec` in src/lib/spec.ts:114 as named errors; no new command, no change to build.yaml. The decision page's `codeloop check thinking` wording is superseded by this line. Lands in spec.md US1 and `## Not building`.
- research.md:37, which card carries whys and premortem: settled by Q1 (a child card). c-067 is "Research writes the first draft" and no other card fits, so the spec stage creates it with `codeloop card new build "The agent names the root cause and how it fails" --feature agent-thinks-first --size M` as its first task and records the id in `## Not building`. Lands in spec.md `## Not building`.
- research.md:38, two option lists on an M card: settled by Q5 and the epic page (.codeloop/wiki/epics/thinking-stages.md: the answer is written back into the spec section it affects). The founder reads and picks from spec.md, so spec.md's `## Options` is the list the decision page is written from: the spec stage rewrites the card's decision page from spec.md when the card leaves spec, replacing the one the research advance wrote. Research.md keeps its options as the pre-interview draft the spec stage starts from. Lands in spec.md US4 and `## Failure modes`.
- research.md:39, what gates size before c-058 ships `when:`: settled by Q1 and Q2 together. The check lives inside the spec stage, which runs on S and M alike, and Q2 wants S to carry scope-cut only. A stage `when:` cannot say that, so the per-size table is the check's own rule: it reads `card.size` and requires `## Not building` from S up and `## Options` from M up. This card has no dependency on c-058 T002, and `when:` is not a thing it waits for. Lands in spec.md US3.

## Folded into spec.md

| Question | spec.md field | State |
|---|---|---|
| Q1 | `## Not building` (whys and premortem, child card) | folded |
| Q2 | `acceptance:` US3 (S cards need `## Not building` only) | folded |
| Q3 | `acceptance:` US1 and `done_when` | folded |
| Q4 | `acceptance:` US2 and `## Failure modes` first item; the use-case stubs line goes to `## Not building` with the child card | folded |
| Q5 | `acceptance:` US4 and `screens: none` | folded |
| research.md:35 to 39 | `## Not building` and `## Failure modes`, each marked `assumption:` | folded |

## Rubric

- I2 pass: `grep -c '^## Q[0-9] \(Scope\|Acceptance\|Risk\|Boundary\):' specs/066-the-agent-thinks-before-it-builds/interview.md` prints 5; one tag per question, none from outside the four
- I4 pass: research.md:35 to 39 are the five items under `## Settled from research`, each naming the round-one answer that settles it; none is re-asked because `grep -c '^## Q' specs/066-the-agent-thinks-before-it-builds/interview.md` prints 5, the cap in src/lib/interview.ts:11
- I6 pass: specs/066-the-agent-thinks-before-it-builds/spec.md carries Q3 as US1, Q4 as US2, Q2 as US3, Q5 as US4 and `screens: none`, Q1 and the five settled items under `## Not building` and `## Failure modes`, each line ending in the question or research line it came from
