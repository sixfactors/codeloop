# c-368 spec: I start, file, read and annotate a story in one command each

Story: As a founder, I can start the next story, file a bug, read a story's fields and add an owner decision to it in one command each, so that every bug-fix commit names a card and the board matches the work.

feature: loop-self-repair
initiative: wiki/initiatives/founder-ships-without-ceremony.md
size: M
metric: cycle_time_days
done_when: `npx vitest run src/commands/__tests__/card-one-command.test.ts` exits 0 and `codeloop card show` on a story with no story or description prints "story: not written" and "description: none" with the command that fills each

acceptance:
- US1 Given a queued story or a proposed one, when I run `codeloop start <id>`, then the story is at its start stage and is the session's active story; on a proposed story the command is refused inside an agent run, as approve is.
- US2 Given a bug to fix, when I run `codeloop bug "<title>"`, then a trivial story flagged as a bug is in the build lane, is the session's active story, and the command prints its id and the `Card: c-NNN` line to put in the commit.
- US3 Given a story with a blank story or description, when I run `codeloop card show <id>`, then it prints "story: not written" or "description: none" with the command that fills it; and `codeloop card edit <id> --description "<text>"` appends one line "<date> owner: <text>" and never replaces what is there.
- US4 Given a story another session holds, when I or the orchestrator (any session that is not an agent run) run `codeloop card release <id>`, then the hold is gone and the story has an event naming who released whose hold; an agent run may release only its own hold; and a hold whose session has had no prompt, tool call or file write for `monitor.stall_minutes` (30 by default) stops showing on the board and stops blocking other builders, the story records "hold expired", and the session takes the hold again on its next prompt.
- US5 Given the production board's stuck cards, when `codeloop park` runs on a card, then the "waiting for you: proposal" flag is cleared and the card lists as parked, so c-086, c-097, c-144 and c-203 are not listed as fresh proposals; and when code for a card has landed but the card is stuck at a gate, `codeloop card move <id> <stage>` moves it past that gate (c-128 is the case), recording who moved it and why.

screens: none
mock: drop

## Decisions

- start scope: `start <id>` works on a queued story and on a proposed one; on a proposed story it is the owner's promote, so it is refused in an agent run (interview Q1).
- release boundary: the owner and the orchestrator may release any hold from a session that is not an agent run; an agent run releases only its own; every release is an event on the story (interview Q2).
- hold expiry: quiet means no prompt, tool call or file write for `monitor.stall_minutes`; the expired hold is ignored everywhere a hold is read (board holder, lease check), and a returning session retakes it (interview Q3).
- bug shape: trivial size, build lane, bug flag so every pick takes it first, made active, prints id and Card line (interview Q4).
- annotate and read: `--description` appends "<date> owner: <text>"; blank fields print "story: not written" or "description: none" plus the fixing command (interview Q5).
- production findings (orchestrator, 10-18): park clears the proposal flag; card move passes a gate when code has landed (US5).

## Not building

- A heartbeat lease renewed by a periodic call; the activity stream already carries the signal.
- Replacing a description through `card edit --description`; only appending.
- Backfilling the 37 stories with no story and 60 with no description; show names the gap, a person fills it.
- Letting an agent run release another session's hold or start a proposed story.

## Failure modes

- `start <id>` on a queued story leaves it not active, so commits carry no card (uc-368-01).
- An agent run starts a proposed story and skips the owner's review (uc-368-01).
- `bug` makes a story but the session is not bound to it, so the commit has no Card line (uc-368-02).
- `card edit --description` overwrites an earlier owner decision (uc-368-03).
- A blank field prints nothing, so a reader cannot tell not-written from hidden (uc-368-03).
- A dead run's hold lasts a day and blocks builders, or a thinking session loses its hold and two builders share files (uc-368-04).
- A parked card still lists as a fresh proposal, or a card with landed code cannot leave its gate (uc-368-05).
