# c-066 research: The agent thinks before it builds

## What exists

exists: build — nothing reads `## Options` or `## Not building` out of a card's spec.md, and no stage asks the founder to pick between approaches. `grep -rn "Not building\|Failure modes\|## Options" src/ --include='*.ts'` hits only `src/lib/research.ts:60` and `src/lib/wiki-rules.ts` (lines 13, 58, 82, 122), all of which read research.md, never spec.md. `checkSpec` in `src/lib/spec.ts:114` checks the story line, size, metric, done_when, acceptance lines and task layers and nothing else; `codeloop spec check --help` lists one flag, `--verbose`, so the `--strict` that the template comment in `templates/spec/spec.md` promises does not exist. Stage `when:` is not a field yet: `grep -n "when" src/lib/lane.ts` returns no code lines, and c-058's T002 ("Add Stage `when` in src/lib/lane.ts") is unticked in `specs/058-small-fixes-skip-the-ceremony/tasks.md`. Three pieces are built and reusable: the `## Not building` and `## Failure modes` headings are already in `templates/spec/spec.md` (empty, unchecked); `optionLines` and `decisionFromResearch` in `src/lib/wiki-rules.ts:59` and `:111` already parse a list of options, pick the one marked Chosen and write a decision page; `addQuestions` in `src/lib/interview.ts:119` already posts an inbox question with two to four lettered options and a recommended letter (c-063, done).

## How others show it

| Competitor | How they show it | Source |
|---|---|---|

No competitor pages in `.codeloop/wiki/competitors/`. Outside the wiki: Spec Kit's plan step writes a research.md per unknown as Decision, Rationale and Alternatives considered, read by a person before tasks are generated; nothing fails if alternatives are missing. Architecture decision records (Nygard's format) carry Context, Decision, Consequences, and the common extension adds "Options considered"; again a convention, not a check. Shape Up's pitch has "Rabbit holes" and "No-gos" sections, which is the scope-cut written before the bet is made. None of the three gates the work on the sections being filled; the founder reads and trusts.

## Options

- Check spec.md's options and scope-cut at the spec stage. `codeloop check thinking <card>` reads spec.md and fails unless `## Options` has three list items, each naming in backticks a file under `src/`, `templates/` or a wiki page that exists, exactly one marked Rejected with a failure mode after it, and `## Not building` has at least two non-empty lines; the spec stage's done cmd in `templates/lanes/build.yaml` gains `&& codeloop check thinking {id}`; the spec skill posts one inbox question through `addQuestions` in `src/lib/interview.ts` ("A, B or C? recommended B") whose accepted answer marks the chosen option. Size gating uses `when: size >= M` on the stage once c-058 T002 lands; until then the check passes with a note for S and trivial cards by reading `card.size`. Chosen. It puts the four things the founder reads in the one file already open at the spec gate, reuses the inbox question mechanism and the option parser instead of adding a second one, and the check can fail: an option with no file path, a rejected option with no failure mode, or a one-line `## Not building` each produce a named error.
- Separate lane stages `options` and `scope-cut` between interview and spec, each with its own output file `{spec}/options.md` and `{spec}/scope-cut.md` and its own done check. Rejected — it doubles the agent runs on every M card (`src/lib/run.ts` starts one agent per stage), and the founder would open three files at the spec gate instead of one; the epic page says the answer is written "back into the spec section it affects". Failure mode: a stage passes with its file written while spec.md still says nothing, so the gate approves a spec that never mentions the rejected option.
- Extend the research stage instead: `checkResearch` in `src/lib/research.ts` already finds `## Options`, so raise it to three options and add `## Not building` to research.md. Rejected — research runs before the interview, so the options would predate the founder's answers and the scope-cut would be written by an agent that has not yet heard what is out of scope; and research runs on S cards too, so Q2's size table (S gets scope-cut only) cannot be met there. Failure mode: the founder answers Q3 "none of these" at the interview and the three options stay on the page, so the decision page carries a choice nobody made.

## The pain, grounded

pain: the founder approves a spec that shows one approach and no reasoning, so the approval is a guess and the mistake surfaces at verify. Source: the c-066 story ("so that I approve a decision and not a guess"), `.codeloop/wiki/initiatives/founder-ships-without-ceremony.md` (metric: human turns per shipped card, goal median under 4; a spec reopened after build costs two more turns), and the interview's Q4 on this card, which names the riskiest assumption as "the agent writes plausible but hollow options". The card's own metric is first-pass verify, and today's spec gate gives the founder nothing to catch a wrong approach before build.

## Risks

- Hollow options. An agent can write three options that each name a real file and still say nothing. The check counts shape, not sense; Q4's answer makes the premortem's failure modes into use case stubs under `usecases/` so at least that half is executable. The options half stays a reading task for the founder at the gate.
- Scope creep into whys and premortem. Q1 split them into a child card; this card writes `## Options` and `## Not building` only, and the check must not require `## Failure modes` or the child card has nothing to add.
- The `when:` dependency. `when: size >= M` is c-058's T002 and is not built. If c-058 slips, the size gate lives inside the check (read `card.size`, pass with a note below M), which is the second place size logic lives.
- The decision page. `decisionFromResearch` writes a decision from research.md's options. If spec.md gains its own `## Options`, a card can end with two option lists that disagree; the spec-stage options should replace the research ones on the decision page, or the research page should stop carrying options on M cards. Which one is for the interview.
- A rejected option named by its failure mode reads as a gotcha page. `wiki-landed` at review looks for repeat mistakes; a rejected option is not a mistake made, so it must not be captured as one.
- The inbox question costs a wait. Q5 says one question per card at the options stage; on a board with ten M cards that is ten questions. `MAX_QUESTIONS` in `src/lib/interview.ts` caps a card at five and the options question counts against it.

## Open questions for the interview

- When an option names a file that does not exist yet (the option is to create it), does the check accept the path, or must every option name at least one existing file it would change?
- Does the check go into `codeloop spec check` (then every M card already past spec fails it on the next run) or into a new `codeloop check thinking` added to the spec stage's done cmd only?
- Which card carries whys and premortem? c-067 is "Research writes the first draft", so the child card from Q1 does not exist yet.
- Research.md already lands an `## Options` decision page. On an M card, does the spec-stage options list replace it, merge into it, or does research keep its own?
- Until c-058 ships stage `when:`, does the check read `card.size` itself and pass below M, or does the stage wait for c-058?

## Sources

- source: src/lib/research.ts:60 — `researchSummary` already parses `## Options` out of research.md; settled that an options parser exists and reads one file only
- source: src/lib/wiki-rules.ts:111 — `decisionFromResearch` picks the option marked Chosen and writes a decision page; settled that spec-stage options would make a second list that the decision page must reconcile
- source: src/lib/spec.ts:114 — `checkSpec` reads story, size, metric, done_when, acceptance and tasks; settled that `## Not building` and `## Options` in spec.md are read by nothing
- source: templates/spec/spec.md — the `## Not building` and `## Failure modes` headings ship in every spec and the comment promises `spec check --strict`, which `codeloop spec check --help` does not list; settled that the headings exist and the check does not
- source: src/lib/interview.ts:119 — `addQuestions` takes two to four lettered options and a recommended letter; settled that the "A, B or C? recommended B" inbox question needs no new mechanism
- source: specs/058-small-fixes-skip-the-ceremony/tasks.md — T002 adds Stage `when` with size comparisons and is unticked; settled that `when: size >= M` is a dependency, not a thing to build here
- source: specs/066-the-agent-thinks-before-it-builds/interview.md — Q1 splits whys and premortem to a child card, Q3 sets three options with one rejected and two scope-cut lines, Q4 says each option names a file or wiki page, Q5 says one inbox question
- source: .codeloop/wiki/epics/thinking-stages.md — "writes the answer back into the spec section it affects"; settled that the output is spec.md, not a new file
- source: https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions — Nygard's ADR: Context, Decision, Consequences; settled the shape a decision page already follows and that ADRs are a convention with no check
- source: https://hbr.org/2007/09/performing-a-project-premortem — Klein's premortem: assume the project failed, write the reasons; settled that the premortem output is a list of failure causes, which Q4 turns into use case stubs
- source: https://basecamp.com/shapeup/1.3-chapter-04 — Shape Up's pitch carries "Rabbit holes" and "No-gos"; settled that scope-cut is a named section written before the bet, which is the `## Not building` list
- source: https://github.com/github/spec-kit — Spec Kit's plan step writes research.md entries as Decision, Rationale, Alternatives considered; settled that the nearest competitor shows options as prose a person reads, with nothing that fails when they are missing

verdict: build

## Rubric

- R2 pass: `grep -rn "Not building\|Failure modes\|## Options" src/ --include='*.ts'` hits only src/lib/research.ts:60 and src/lib/wiki-rules.ts (13, 58, 82, 122), all reading research.md; `codeloop spec check --help` lists only `--verbose`; `grep -n "when" src/lib/lane.ts` returns no code line
- R5 pass: three options under `## Options`; a spec-stage check plus one inbox question chosen per specs/066-the-agent-thinks-before-it-builds/interview.md Q1, Q3 and Q5; separate stages rejected for doubling agent runs per src/lib/run.ts and splitting the gate reading across files; extending research rejected because research runs before the interview and on S cards
- R7 pass: `## Open questions for the interview` lists five, none answered here: new-file paths in options, `spec check` versus `check thinking`, which card carries whys and premortem, how spec options reconcile with the research decision page, and what gates size before c-058 ships `when:`
