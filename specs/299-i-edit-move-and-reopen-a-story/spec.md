# c-299 spec: I edit, move and reopen a story from its page

Story: As a founder, I can edit a story, move it to any stage or reopen a finished one from its page, so that a card marked done by mistake or sitting at the wrong stage is put right without editing files.

feature: codeloop
size: M
metric: no-data
done_when: `npx vitest run src/lib/__tests__/story-control.test.ts --maxWorkers=1 --no-file-parallelism` passes

acceptance:
- US1 Given a done card, when I reopen it, then it is back at its lane's first stage, or parked as proposed with `--to backlog`, with no holder and no gate.
- US2 Given an active card, when I move it to an earlier or later stage, then it is there with that stage's retries reset, and moving back past a passed gate needs a note saying why.
- US3 Given a card, when I edit its title, story, priority, feature or size, then the card and the story line in spec.md show the change.
- US4 Given a builder holds the card or an orchestrator run is live on it, when I move or reopen it, then it is refused.

screens: none
mock: drop

## Not building

- The page controls and the server routes: the UI builder wires them to `src/lib/story-control.ts`.
- Reopening a card into a different lane.
