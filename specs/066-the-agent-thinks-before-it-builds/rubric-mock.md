# c-066 mock rubric

The card draws nothing. The founder reads `## Options` and `## Not building` in spec.md at the
spec gate the board already shows, and the one lettered question lands in the inbox c-063 built.
Every acceptance line is a CLI exit code or an inbox line, so the frames that would carry them
already exist outside this card.

## Rubric

- M2 pass: specs/066-the-agent-thinks-before-it-builds/spec.md:20 says `screens: none` with the reason on line 21, so there is no screen to draw a state for; `codeloop check mock c-066` exits 0 on that line
- M4 pass: US1 to US3 in specs/066-the-agent-thinks-before-it-builds/spec.md:14-16 are `codeloop spec check` exit codes with no frame, proved by `codeloop verify c-066`; US4 on line 17 points at the inbox question list that src/commands/inbox.ts:50-54 already prints, with the `codeloop answer <id> <n> --accept` line under it
