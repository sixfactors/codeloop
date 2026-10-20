# c-330 plan: A board moved to v2 refuses writes from v1

## Layers touched

api (the board, wiki and question write paths; the guard hooks), test.

## Files

- src/lib/cards.ts
- src/lib/wiki.ts
- src/lib/interview.ts
- src/lib/store/file.ts
- src/program-base.ts
- src/commands/guard-hooks.ts
- src/lib/__tests__/moved-board.test.ts
- specs/330-a-board-moved-to-v2-refuses-writes-from/

## Risks

- A write path that skips writeCards (the stop hook's wiki capture, a question file) keeps changing the v1 copy after the switch: every such path calls the one `assertBoardNotMoved` in cards.ts, and the test runs each through the CLI.
- A hook keeps enforcing a lease read from the stale board and blocks a session started before the switch: the guard functions return before any board read when the marker is present, through the CLI and the hook daemon alike.
