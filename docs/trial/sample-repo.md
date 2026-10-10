# Sample repo for teams that do not ship code

Status: current. For a trial team whose work is decks, memos and client deliverables rather than code. The walkthrough is the docs guide [Review a client deliverable](https://codeloop.protobox.ai/docs/guides/review-a-client-deliverable); this page says how to use it in the 20-minute trial.

## What the example is

A repo of client deliverables and a two-stage lane. The first stage runs a skill you already have (the guide uses `deloitte-language-review`, which rewrites a deck into house style and lists the evidence gaps) and its check is that the output file exists with its findings table. The second stage is the send, gated: the card stops at `outward: true` and nothing leaves until the person who owns the client relationship approves on the board or in the terminal. Every deliverable is a card; every send is an approval event with a name and a time.

## Use it in the trial

Follow [the trial guide](trial-guide.md) with these swaps:

| Trial guide step | For a deliverable team |
|---|---|
| 2. Init on your repo | `mkdir client-decks && cd client-decks && git init`, then `codeloop init --tools claude`. Deliverables are files, so they live in a repo like anything else. |
| 3. One card through a gate | Skip the build lane. Follow the guide's steps 2 to 5: `codeloop adopt` so the lane can name your skill, write the lane file from the guide, `codeloop card new review "<deck title>"`, and let the check park the card at the send gate. Approve it on the board's Inbox page. |
| 4. One wiki page | Capture the house-style rule the review found most often, with `--scope "decks/**"`. |
| 5. One question answered | `codeloop ask <id> "Send to the client's CFO as well?" --recommended "No, the sponsor only" --as agent`, then Accept on the board. |

The skill has to be on the machine that runs the stage. The guide's step 2 shows the folders `adopt` scans (`~/.claude/skills/`, `~/.claude/skills/synced/<id>/`, `.claude/commands/`). If `codeloop brief <id>` prints your skill's text under `## Skill:`, the lane found it.

## What to send back

The same three numbers as the trial guide, plus one: whether the person who approves the send could do it from the board alone, without the terminal. The board needs `codeloop serve --owner`, and anyone with the URL and its token can approve; the guide's step 7 shows the same approval from the terminal and from the board.
