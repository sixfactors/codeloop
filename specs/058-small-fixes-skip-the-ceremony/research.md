# c-058 research: Small fixes skip the ceremony

## What exists

exists: build — `Size` is only `S|M|L` (`src/lib/cards.ts`), `Stage` has no `when` field (`src/lib/lane.ts`), and `.codeloop/lanes/build.yaml` runs research → interview → mock → spec (gate) → build → verify for every card. There is no `trivial` size, no stage predicate, and no `check diff` cap that would re-size an oversized "trivial" card back to S.

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. Outside the wiki: Spec Kit's community asks for a tiny/lean path because the full specify→plan→tasks pipeline is the same cost for a one-line fix as for a feature (spec-kit#75, #1174); Linear routes urgency via priority and triage, not by skipping workflow stages by size.

## Options

- Add `trivial` below S in the story standard; put `when: size >= S` on research, interview, mock and spec in `build.yaml` so trivial cards enter at build; enforce a 3-file / 50-line cap at verify via `check diff`, and on breach re-size to S and park at the spec gate. Chosen — matches the answered interview (Q1–Q5) and the Q3 dogfood path `create → build → verify`.
- Keep S/M/L and let S skip ceremony (`when: size >= M`). Rejected — interview Q5; S still means "hours" of real work and would hide research/spec from cards that need them.
- Ship a separate hotfix/fast lane. Rejected — duplicates gates and WIP; the initiative wants one lane that sizes its own ceremony.

## The pain, grounded

pain: a one-line fix still burns a full research → interview → mock → spec-gate day of markdown, so the founder avoids the board for trivial work. Source: `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (spec-kit#75, martinelli.ch, BMAD#1188) and the card story ("pipeline matches the size of the work"). Confirmed by `build.yaml` having no size predicates today.

## Risks

- Agents mis-size an M card as trivial to dodge the spec gate; the diff cap must actually refuse and re-park, or the gate is theatre.
- Early mocks showed S skipping (`when: size >= M`); building that instead of `trivial` would contradict the locked interview and the story standard's "S = hours".
- `check diff` is named in c-068's interview and is not implemented yet; this card either depends on it or must ship a minimal cap itself.
- Skipping research/spec means trivial cards leave no `research.md`/`spec.md`; stats and dogfood must assert absence, not look for empty files.
- Interview and mock are not named in Q1's skip list, but Q3's event path (`create → build → verify`) requires them skipped too; the lane `when:` must cover research through the spec gate, not only `research` and `spec`.

## Sources

- source: src/lib/cards.ts:24 — Size type is only S | M | L; no trivial
- source: src/lib/lane.ts:19 — Stage interface has no when predicate
- source: .codeloop/lanes/build.yaml — every card still runs research through live with no size gate
- source: specs/058-small-fixes-skip-the-ceremony/interview.md — locked answers: trivial size, skip through spec gate, diff cap, dogfood path
- source: .codeloop/wiki/initiatives/founder-ships-without-ceremony.md — pain: one-line fix costs a day of markdown
- source: https://github.com/github/spec-kit/issues/75 — Spec Kit overkill for small clearly-described fixes
- source: docs/story-standard.md:69 — size table is S/M/L only; Unlock-before-build needs an exists verdict

verdict: build
