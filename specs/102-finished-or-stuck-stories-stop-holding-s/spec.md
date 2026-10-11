# c-102 spec: Finished or stuck stories stop holding slots

Story: As a founder, I can finish, drop, park or split a story without editing files, so that new work is never blocked by stale stories.

feature: lane-capacity
size: M
metric: blocked_starts
done_when: `npx vitest run src/lib/__tests__/flow.test.ts` exits 0

acceptance:
- US1 Given a lane at its limit, when a story is split into children that do not fit, then nothing is created and the refusal names the stories holding the slots.
- US2 Given a story whose work is finished or abandoned, when the owner runs `card done` or `card drop`, then its slot is free and the assistant cannot do it alone.
- US3 Given a stuck story, when the owner parks it and later approves it, then it leaves the lane and returns to the stage it left.

screens: none

## Not building

- Automatic parking of stuck stories after a timeout: next, with the change to what the limit counts.

## Failure modes

- A split stops halfway and leaves duplicates (US1).
- An agent ends a story the owner did not decide on (US2).
- A parked story comes back at the first stage and loses its progress (US3).
