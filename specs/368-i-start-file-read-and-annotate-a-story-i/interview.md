## Q1 Scope: should `codeloop start <id>` also start a proposed story, which today needs your approval, or only one already queued in Up next? (builds on research.md:44)
recommended: Both. On a queued story it starts it at its start stage and makes it the session's active story. On a proposed story it is your promote, so it is refused inside an agent run, as approve is.
answer: Both. On a queued story it starts it at its start stage and makes it the session's active story. On a proposed story it is your promote, so it is refused inside an agent run, as approve is.

## Q2 Boundary: who may release a story another session holds? (builds on research.md:45)
recommended: You and the orchestrator, from any session that is not an agent run. An agent run may release only its own hold. Each release is an event on the story naming who released whose hold.
answer: You and the orchestrator, from any session that is not an agent run. An agent run may release only its own hold. Each release is an event on the story naming who released whose hold.

## Q3 Risk: how long may a session stay quiet before its hold expires on its own? (builds on research.md:46)
recommended: `monitor.stall_minutes`, 30 by default, with no prompt, tool call or file write from that session. The hold then stops showing on the board and stops blocking other builders, and the story records "hold expired". A session that comes back takes the hold again on its next prompt.
answer: `monitor.stall_minutes`, 30 by default, with no prompt, tool call or file write from that session. The hold then stops showing on the board and stops blocking other builders, and the story records "hold expired". A session that comes back takes the hold again on its next prompt.

## Q4 Acceptance: what should `codeloop bug "<title>"` make? (builds on research.md:47)
recommended: A trivial story in the build lane, flagged as a bug so every pick takes it first, made the session's active story, and it prints the id and the `Card: c-NNN` line to put in the commit.
answer: A trivial story in the build lane, flagged as a bug so every pick takes it first, made the session's active story, and it prints the id and the `Card: c-NNN` line to put in the commit.

## Q5 Scope: how should `card edit --description` add an owner decision, and what should `card show` print for a blank field? (builds on research.md:48)
recommended: It appends one line, "<date> owner: <text>", and never replaces what is there. `card show` prints "story: not written" or "description: none" with the command that fills it.
answer: It appends one line, "<date> owner: <text>", and never replaces what is there. `card show` prints "story: not written" or "description: none" with the command that fills it.

## Rubric

- I2 pass: Q1 scope, Q2 boundary, Q3 risk, Q4 acceptance, Q5 scope, each named in its own `## Qn` heading in this file
- I4 pass: research.md R7 open questions (1) start scope is Q1, (2) who may release is Q2, (3) how long quiet is Q3, (4) what bug makes is Q4, (5) edit and blank-field display is Q5 (specs/368-i-start-file-read-and-annotate-a-story-i/research.md:42)
- I6 pass: each answer is a line under `## Decisions` in specs/368-i-start-file-read-and-annotate-a-story-i/spec.md (start scope, release boundary, hold expiry, bug shape, annotate and read), and is also acceptance US1 to US4
