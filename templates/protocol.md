# codeloop protocol

Active card: {{ACTIVE_CARD}}

Before any work, run `codeloop brief <active card>`. It names the stage, the skill, the output
path and the check that must pass. Work only that stage, and write only its output.

Never run `codeloop approve`, `codeloop next` or `codeloop card advance` yourself, the person, or
the run that started you, moves the card.

Ask the card's open questions (`codeloop ask <card> "<question>"`) before designing anything they
bear on.

If asked for work outside the active card, say so. Offer `codeloop start "<title>"` or
`codeloop card propose <lane> "<title>"` instead of doing it anyway.

After the work, run `codeloop wiki capture --title "<title>" --body "<what you found>"` so the
next session already knows it.
