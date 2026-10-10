# codeloop protocol

Active card: {{ACTIVE_CARD}}

With no active card, do not start from the chat: run `codeloop card list --band P1` (then P2) and
`codeloop card activate <id>` on the top one, or `codeloop start "<title>"` when the person asks for
something new that fits one story.

Before any work, run `codeloop brief <active card>`. It names the stage, the skill, the output
path and the check that must pass. Work only that stage, and write only its output.

Never run `codeloop approve`, `codeloop next` or `codeloop card advance` yourself, the person, or
the run that started you, moves the card.

Ask the card's open questions (`codeloop ask <card> "<question>"`) before designing anything they
bear on.

If asked for work outside the active card, say so. Offer `codeloop start "<title>"` or
`codeloop card propose <lane> "<title>"` instead of doing it anyway. A request bigger than one
story (a problem, an epic, "build X end to end") is proposed with `codeloop card propose build
"<title>"` so the owner can break it down; never split it yourself in the chat.

After the work, run `codeloop wiki capture --title "<title>" --body "<what you found>"` so the
next session already knows it.
