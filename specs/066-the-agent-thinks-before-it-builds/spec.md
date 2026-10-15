# c-066 spec: The agent thinks before it builds

<!-- The standard: docs/story-standard.md. Title = what the user can now do. Persona from config personas:. The "so that" is required. -->
Story: As a founder, I can read three approaches with one rejected and a list of what is not being built before I approve a spec, so that I approve a decision and not a guess.

feature: the agent asks and thinks before it builds
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: first-pass verify
<!-- the card's own metric (research.md "The pain, grounded"): a spec approved with a wrong approach fails at verify, not at the gate. The lane's cycle_time_days is what that moves. -->
done_when: codeloop verify c-066
<!-- interview Q3: the proof is `spec check` failing on a spec with no options or scope-cut, and passing with them -->

<!-- One to five lines, outcome checks a user would notice, numbered US1..US5. Six means split. -->
acceptance:
- US1 Given an M card at the spec stage, when `codeloop spec check` runs, then it exits 0 only if spec.md has `## Options` with three approaches, one marked Rejected with a reason, and `## Not building` with at least two lines, and otherwise exits 1 naming the missing part. (interview Q3; research.md:36 settled: the rules live in `checkSpec`, no new command)
- US2 Given an option that names no existing file or wiki page in backticks, or a rejected option with no failure mode after it, when `codeloop spec check` runs, then it exits 1 naming that option. (interview Q4; research.md:35 settled: at least one named path exists today, a path to be created may stand beside it)
- US3 Given an S card at the spec stage, when `codeloop spec check` runs, then `## Not building` with two lines is required and `## Options` is not, read from `card.size`. (interview Q2; research.md:39 settled: the per-size rule is the check's own, not a stage `when:`)
- US4 Given an M card whose spec skill has written three options, when the stage ends, then one inbox question "A, B or C?" with a recommended letter is on the card, its accepted answer marks that option Chosen in spec.md, and the card's decision page is rewritten from spec.md when it leaves spec. (interview Q5; research.md:38 settled)

<!-- One name per screen the mock draws; `codeloop check mock` wants a <section data-screen="name"> for each. A card with nothing to draw says `screens: none`. -->
screens: none
<!-- interview Q5: the founder reads spec.md at the gate the board already shows; nothing new is drawn. The one inbox question (US4) renders through c-063's existing inbox, so there is no new screen either. -->

## Not building

<!-- What this card deliberately leaves out. A task not traceable to an acceptance line fails `spec check --strict`. -->
- Whys and premortem. A child card, created at this card's spec stage with `codeloop card new build "The agent names the root cause and how it fails" --feature agent-thinks-first --size M`; its id is recorded here once made. The premortem's use-case stubs under `usecases/` go with it. (interview Q1 and Q4; research.md:37 settled, assumption: no existing card fits, c-067 is research's first draft)
- A new `codeloop check thinking` command or a change to the spec stage's done cmd. `spec check` already runs there and nowhere else, so the rules go into it. (interview Q3; research.md:36 settled, assumption: supersedes the decision page's command name)
- Stage `when:` from c-058 T002. This card adds no stage, so it has nothing to gate; size is read inside the check. (interview Q2; research.md:39 settled, assumption)
- A second options list on the decision page. Research.md keeps its options as the draft the spec stage starts from; the decision page is written from spec.md alone once the card leaves spec. (interview Q5; research.md:38 settled, assumption)
- An option whose only named paths do not exist yet. Every option names at least one path that exists today, so the check has something to look up. (interview Q4; research.md:35 settled, assumption)

## Failure modes

<!-- The ways this can break in production. One use case per item. -->
- Three options each name a real file and still say nothing: the check counts shape, so the founder reads the options at the gate and the inbox question's recommended letter is the one thing that must carry a reason. (interview Q4; research.md:26)
- The research decision page and spec.md disagree after the founder picks a different letter: the decision page must be rewritten from spec.md at the spec advance, or the wiki records a choice nobody made. (research.md:29 and research.md:38 settled)
- A rejected option's failure mode is captured as a gotcha at review: it is an option not taken, not a mistake made, so `wiki-landed` must not count it. (research.md:30)
